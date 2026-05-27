// POST /api/run
//
// Dos modos de operación según env:
//
//   1. LOCAL DEV (sin env BACKEND_URL):
//      Lanza subprocess directo al runner Python en lab/yt-automator-engine/.
//      Solo funciona en la máquina de Pablo (Windows con Python instalado).
//
//   2. PRODUCCIÓN (BACKEND_URL + BACKEND_TOKEN):
//      Hace fetch al backend FastAPI del VPS y reenvía el SSE al cliente.
//      Es lo que ocurre cuando se deploya a Vercel.
//
// Lógica de auth (NextAuth) la maneja middleware.ts — aquí asumimos request autorizada.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_URL;
const BACKEND_TOKEN = process.env.BACKEND_TOKEN;
const PYTHON_BIN = process.env.YT_AUTOMATOR_PYTHON || "python";
const ENGINE_PATH =
  process.env.YT_AUTOMATOR_ENGINE_PATH ||
  String.raw`Y:\04_DEV\J.A.R.V.I.S\lab\yt-automator-engine\runner.py`;

function sseChunk(data: unknown): string {
  return `data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`;
}

async function writeTemp(prefix: string, ext: string, content: Buffer | string): Promise<string> {
  const dir = join(tmpdir(), "yt-automator");
  await mkdir(dir, { recursive: true });
  const name = `${prefix}-${randomBytes(8).toString("hex")}.${ext}`;
  const path = join(dir, name);
  await writeFile(path, content);
  return path;
}

// ── Modo producción: proxy al VPS ───────────────────────────────────────────

async function proxyToBackend(req: Request, projectJson: string, refFile: File | null) {
  if (!BACKEND_URL || !BACKEND_TOKEN) {
    return new Response("Backend not configured", { status: 500 });
  }

  const upstream = new FormData();
  upstream.append("project", projectJson);
  if (refFile) upstream.append("ref_file", refFile);

  const res = await fetch(`${BACKEND_URL.replace(/\/$/, "")}/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${BACKEND_TOKEN}` },
    body: upstream,
    // @ts-expect-error — Node 18+ fetch acepta duplex en streaming
    duplex: "half",
    signal: req.signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    return new Response(`Backend error: HTTP ${res.status} ${text}`, { status: 502 });
  }

  // Forward 1:1 (ya es text/event-stream)
  return new Response(res.body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}

// ── Modo dev local: subprocess al motor Python ─────────────────────────────

async function spawnLocal(req: Request, projectJson: string, refFile: File | null) {
  let refFilePath: string | undefined;
  if (refFile && refFile.size > 0) {
    const buffer = Buffer.from(await refFile.arrayBuffer());
    const ext = (refFile.name.split(".").pop() || "jpg").toLowerCase();
    refFilePath = await writeTemp("ref", ext, buffer);
  }

  let project: Record<string, unknown>;
  try {
    project = JSON.parse(projectJson);
  } catch (e) {
    return new Response(`Invalid project JSON: ${e}`, { status: 400 });
  }
  if (refFilePath) project.reference_image = refFilePath;

  const projectPath = await writeTemp("project", "json", JSON.stringify(project, null, 2));

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: unknown) => controller.enqueue(enc.encode(sseChunk(event)));

      send({ event: "api_start", project_path: projectPath });

      const child = spawn(PYTHON_BIN, [ENGINE_PATH, "--project", projectPath], {
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      });

      const ac = (req as Request & { signal?: AbortSignal }).signal;
      const onAbort = () => {
        if (!child.killed) child.kill();
      };
      ac?.addEventListener("abort", onAbort);

      let stdoutBuf = "";
      child.stdout.setEncoding("utf-8");
      child.stdout.on("data", (chunk: string) => {
        stdoutBuf += chunk;
        let nl: number;
        while ((nl = stdoutBuf.indexOf("\n")) !== -1) {
          const line = stdoutBuf.slice(0, nl).trim();
          stdoutBuf = stdoutBuf.slice(nl + 1);
          if (!line) continue;
          try {
            send(JSON.parse(line));
          } catch {
            send({ event: "raw_stdout", line });
          }
        }
      });

      let stderrBuf = "";
      child.stderr.setEncoding("utf-8");
      child.stderr.on("data", (chunk: string) => {
        stderrBuf += chunk;
        const lines = stderrBuf.split("\n");
        stderrBuf = lines.pop() || "";
        for (const l of lines) if (l.trim()) send({ event: "stderr", line: l });
      });

      child.on("error", (err) => send({ event: "api_error", error: String(err) }));
      child.on("close", (code, signal) => {
        if (stdoutBuf.trim()) {
          try {
            send(JSON.parse(stdoutBuf.trim()));
          } catch {
            send({ event: "raw_stdout", line: stdoutBuf.trim() });
          }
        }
        if (stderrBuf.trim()) send({ event: "stderr", line: stderrBuf.trim() });
        send({ event: "api_end", exit_code: code, signal });
        ac?.removeEventListener("abort", onAbort);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}

// ── Entry point ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  let projectJson: string;
  let refFile: File | null = null;

  const contentType = req.headers.get("content-type") || "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const projField = form.get("project");
      if (typeof projField !== "string") {
        return new Response("Missing 'project' field", { status: 400 });
      }
      projectJson = projField;
      const refField = form.get("ref_file");
      if (refField && refField instanceof File && refField.size > 0) {
        refFile = refField;
      }
    } else {
      projectJson = await req.text();
    }
  } catch (e) {
    return new Response(`Failed to parse request: ${e}`, { status: 400 });
  }

  if (BACKEND_URL && BACKEND_TOKEN) {
    return proxyToBackend(req, projectJson, refFile);
  }
  return spawnLocal(req, projectJson, refFile);
}
