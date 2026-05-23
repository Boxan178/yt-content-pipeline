import { NextRequest } from 'next/server';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { StreamEvent } from '@/lib/stream-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JARVIS_ROOT = ['Y:', '04_DEV', 'J.A.R.V.I.S'].join('/');
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

let cachedClaudeBin: { exe: string; cliArg: string | null } | null = null;
function resolveClaudeBin(): { exe: string; cliArg: string | null } {
  if (cachedClaudeBin) return cachedClaudeBin;
  if (process.platform === 'win32') {
    const r = spawnSync('where', ['claude.cmd'], { encoding: 'utf-8', windowsHide: true });
    if (r.status !== 0 || !r.stdout) {
      throw new Error('claude.cmd no encontrado en PATH');
    }
    const cmdPath = r.stdout.trim().split(/[\r\n]+/)[0].trim();
    const cmdDir = path.dirname(cmdPath);
    const cliPath = path.join(cmdDir, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
    if (!existsSync(cliPath)) {
      throw new Error(`cli.js no existe en ${cliPath}`);
    }
    cachedClaudeBin = { exe: 'node.exe', cliArg: cliPath };
  } else {
    cachedClaudeBin = { exe: 'claude', cliArg: null };
  }
  return cachedClaudeBin;
}

interface ChatRequest {
  message: string;
  sessionId?: string;
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'max';
  cwd?: string;
}

/**
 * POST /api/claude/chat (Server-Sent Events).
 *
 * Spawnea `claude -p` y stream los eventos NDJSON al cliente como SSE en
 * tiempo real. Antes este endpoint esperaba al exit del child sync, lo que
 * causaba "Failed to fetch" en el browser cuando claude tardaba >30s.
 *
 * Eventos SSE emitidos:
 *   - `event` con data JSON (cada evento del stream-json de claude).
 *   - `error` con mensaje si hubo problema spawneando.
 *   - `done` con `{ sessionId }` al final.
 */
export async function POST(req: NextRequest) {
  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  const message = (body.message ?? '').trim();
  if (!message) {
    return new Response('message vacío', { status: 400 });
  }

  let claudeBin;
  try {
    claudeBin = resolveClaudeBin();
  } catch (e) {
    return new Response(e instanceof Error ? e.message : String(e), { status: 500 });
  }

  const model = body.model ?? 'sonnet';
  const cwd = body.cwd ?? JARVIS_ROOT;
  const args: string[] = [];
  if (claudeBin.cliArg) args.push(claudeBin.cliArg);
  args.push('-p', '--output-format', 'stream-json', '--verbose', '--model', model);
  if (body.effort) args.push('--effort', body.effort);
  if (body.sessionId) args.push('--resume', body.sessionId);
  args.push(message);

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      function safeEnqueue(chunk: string) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      }
      function sseEvent(name: string, data: unknown) {
        safeEnqueue(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
      }

      let child;
      try {
        child = spawn(claudeBin.exe, args, {
          cwd,
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, TERM: 'dumb' },
        });
      } catch (e) {
        sseEvent('error', { message: e instanceof Error ? e.message : String(e) });
        try { controller.close(); } catch {}
        closed = true;
        return;
      }

      let stdoutBuffer = '';
      let stderrCollected = '';
      let sessionId: string | undefined;

      child.stdout?.on('data', (chunk: Buffer) => {
        if (closed) return;
        stdoutBuffer += chunk.toString();
        // Procesar líneas completas
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? '';
        for (const line of lines) {
          const t = line.trim();
          if (!t || !t.startsWith('{')) continue;
          try {
            const ev = JSON.parse(t) as StreamEvent;
            if (ev && typeof ev === 'object' && typeof (ev as any).type === 'string') {
              // Capturar sessionId del primer system.init
              if (!sessionId && ev.type === 'system' && (ev as any).subtype === 'init') {
                sessionId = (ev as any).session_id;
              }
              sseEvent('event', ev);
            }
          } catch {}
        }
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderrCollected += chunk.toString();
      });

      // Heartbeat cada 15s para que ningún proxy mate la conexión por idle
      const heartbeat = setInterval(() => {
        if (closed) {
          clearInterval(heartbeat);
          return;
        }
        safeEnqueue(`: ping\n\n`);
      }, 15000);

      const timer = setTimeout(() => {
        try { child.kill(); } catch {}
      }, DEFAULT_TIMEOUT_MS);

      child.on('exit', (code) => {
        clearTimeout(timer);
        clearInterval(heartbeat);
        // Procesa cualquier resto del buffer
        const t = stdoutBuffer.trim();
        if (t && t.startsWith('{')) {
          try {
            const ev = JSON.parse(t) as StreamEvent;
            sseEvent('event', ev);
          } catch {}
        }
        sseEvent('done', {
          sessionId,
          exitCode: code,
          stderr: stderrCollected ? stderrCollected.slice(-1000) : undefined,
        });
        try { controller.close(); } catch {}
        closed = true;
      });
    },
    cancel() {
      closed = true;
      // El child sigue corriendo si el cliente abandona — claude codeface
      // sus propios timeouts. No matamos aquí porque podría haber respuesta
      // útil aún en disco.
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
