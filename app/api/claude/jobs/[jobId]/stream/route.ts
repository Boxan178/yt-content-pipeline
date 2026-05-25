import { NextRequest } from 'next/server';
import { existsSync, statSync, watch, type FSWatcher } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { findJob } from '@/lib/claude-jobs';
import { parseStreamLog, type StreamEvent } from '@/lib/stream-events';
import { normalizeAllowedPath } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/claude/jobs/[jobId]/stream?videoFolder=...
 *
 * Server-Sent Events: emite cada evento NDJSON nuevo que aparece en el log
 * del job. La primera trama incluye todos los eventos ya acumulados.
 * Termina cuando llega un evento `result` o cuando el job pasa a estado no-running.
 *
 * Watching: fs.watch + polling de fallback cada 2s por si en Windows el watcher
 * pierde eventos (pasa cuando el archivo está open con append).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const url = new URL(req.url);
  const folderParam = url.searchParams.get('videoFolder');
  const videoFolder = normalizeAllowedPath(folderParam);
  if (!videoFolder) {
    return new Response('Missing or invalid videoFolder', { status: 400 });
  }
  const job = findJob(videoFolder, params.jobId);
  if (!job) {
    return new Response('Job not found', { status: 404 });
  }
  const logPath = job.logPath;

  const encoder = new TextEncoder();
  let watcher: FSWatcher | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let lastSize = 0;
  let buffer = '';
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function safeEnqueue(chunk: string) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
          cleanup();
        }
      }
      function sseEvent(name: string, data: unknown) {
        safeEnqueue(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
      }
      function cleanup() {
        if (watcher) {
          try { watcher.close(); } catch {}
          watcher = null;
        }
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      }

      // Manda el snapshot inicial entero
      let fh: FileHandle | null = null;
      try {
        if (!existsSync(logPath)) {
          sseEvent('error', { message: 'log no existe' });
          controller.close();
          return;
        }
        const st = statSync(logPath);
        lastSize = st.size;
        fh = await open(logPath, 'r');
        const buf = Buffer.alloc(st.size);
        await fh.read(buf, 0, st.size, 0);
        const initial = buf.toString('utf-8');
        const evs = parseStreamLog(initial);
        for (const ev of evs) {
          sseEvent('event', ev);
          if (ev.type === 'result') {
            // Job ya terminó, cerramos
            sseEvent('done', { reason: 'result-found' });
            controller.close();
            cleanup();
            try { await fh.close(); } catch {}
            return;
          }
        }
        // Mantener el buffer con el resto que no sea NDJSON (en caso de líneas truncadas)
        const lastNewline = initial.lastIndexOf('\n');
        buffer = lastNewline >= 0 ? initial.slice(lastNewline + 1) : initial;
      } catch (e) {
        sseEvent('error', { message: e instanceof Error ? e.message : String(e) });
        controller.close();
        cleanup();
        if (fh) { try { await fh.close(); } catch {} }
        return;
      }

      async function readDelta() {
        if (closed) return;
        try {
          const st = statSync(logPath);
          if (st.size <= lastSize) return;
          const len = st.size - lastSize;
          const buf = Buffer.alloc(len);
          const handle = await open(logPath, 'r');
          await handle.read(buf, 0, len, lastSize);
          await handle.close();
          lastSize = st.size;
          const text = buffer + buf.toString('utf-8');
          const lines = text.split(/\r?\n/);
          buffer = lines.pop() ?? '';
          let resultSeen = false;
          for (const line of lines) {
            const t = line.trim();
            if (!t || !t.startsWith('{')) continue;
            try {
              const ev = JSON.parse(t) as StreamEvent;
              if (ev && typeof ev === 'object' && typeof (ev as any).type === 'string') {
                sseEvent('event', ev);
                if (ev.type === 'result') resultSeen = true;
              }
            } catch {}
          }
          if (resultSeen) {
            sseEvent('done', { reason: 'result-found' });
            controller.close();
            closed = true;
            cleanup();
          }
        } catch {}
      }

      // Watch + polling fallback
      try {
        watcher = watch(logPath, { persistent: false }, () => {
          readDelta();
        });
      } catch {}
      pollTimer = setInterval(readDelta, 2000);

      // Heartbeat para mantener viva la conexión y detectar desconexiones
      const heartbeat = setInterval(() => {
        if (closed) {
          clearInterval(heartbeat);
          return;
        }
        safeEnqueue(`: ping\n\n`);
      }, 15000);

      // Cerrar a los 30 minutos por si acaso
      const deadline = setTimeout(() => {
        if (closed) return;
        sseEvent('done', { reason: 'timeout' });
        try { controller.close(); } catch {}
        closed = true;
        cleanup();
        clearInterval(heartbeat);
      }, 30 * 60 * 1000);

      // Cleanup al cancelar la conexión
      // No hay un cancel listener directo aquí; el ReadableStream tiene cancel() arriba.
      const _ = deadline; // referencia para evitar GC
    },
    cancel() {
      closed = true;
      if (watcher) { try { watcher.close(); } catch {} }
      if (pollTimer) clearInterval(pollTimer);
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
