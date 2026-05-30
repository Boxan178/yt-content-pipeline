import { NextRequest, NextResponse } from 'next/server';
import { enqueue, tickQueue, clearFinished, type EnqueueOptions } from '@/lib/job-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/queue
 * Devuelve estado actual de la cola (tickea antes de devolver).
 */
export async function GET() {
  const q = await tickQueue();
  return NextResponse.json({ ok: true, queue: q });
}

/**
 * POST /api/queue
 * Encola un item nuevo. Body: EnqueueOptions.
 */
export async function POST(req: NextRequest) {
  let body: Partial<EnqueueOptions>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const required: (keyof EnqueueOptions)[] = ['skill', 'label', 'videoFolder', 'videoTitle', 'prompt', 'cwd', 'timeoutMs'];
  for (const k of required) {
    if (body[k] === undefined || body[k] === null || body[k] === '') {
      return NextResponse.json({ ok: false, error: `Falta campo: ${k}` }, { status: 400 });
    }
  }
  const item = enqueue(body as EnqueueOptions);
  return NextResponse.json({ ok: true, item });
}

/**
 * DELETE /api/queue?cleanFinished=1
 * Limpia los items terminados (done/failed/cancelled). Devuelve cuántos.
 */
export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get('cleanFinished') === '1') {
    const removed = clearFinished();
    return NextResponse.json({ ok: true, removed });
  }
  return NextResponse.json({ ok: false, error: 'Pasa ?cleanFinished=1 para limpiar' }, { status: 400 });
}
