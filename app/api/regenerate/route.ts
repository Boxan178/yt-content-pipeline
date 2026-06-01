// POST /api/regenerate — proxy al backend del VPS para regenerar UNA escena.
// Body JSON: { project: string, scene_number: string }
// Response: SSE 1:1 desde el motor.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_URL;
const BACKEND_TOKEN = process.env.BACKEND_TOKEN;

export async function POST(req: Request) {
  let project: string;
  let sceneNumber: string;
  try {
    const body = await req.json();
    project = String(body.project || "");
    sceneNumber = String(body.scene_number || "");
    if (!project || !sceneNumber) {
      return new Response("Missing 'project' or 'scene_number'", { status: 400 });
    }
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  if (!BACKEND_URL || !BACKEND_TOKEN) {
    return new Response("Backend not configured", { status: 500 });
  }

  const form = new FormData();
  form.append("project", project);
  form.append("scene_number", sceneNumber);

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL.replace(/\/$/, "")}/regenerate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${BACKEND_TOKEN}` },
      body: form,
      signal: req.signal,
      // @ts-expect-error — Node fetch acepta duplex en streaming
      duplex: "half",
    });
  } catch (e) {
    // Sin try/catch, un backend caído o un abort del cliente lanzaba un 500 sin
    // manejar (inconsistente con projects/balance, que devuelven 502 limpio).
    if (e instanceof Error && e.name === "AbortError") {
      return new Response("Client aborted", { status: 499 });
    }
    return new Response("Backend unreachable", { status: 502 });
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    return new Response(`Backend error: HTTP ${res.status} ${text}`, { status: 502 });
  }
  return new Response(res.body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}
