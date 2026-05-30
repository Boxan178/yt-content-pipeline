import { NextRequest, NextResponse } from 'next/server';
import { getChannel } from '@/lib/channels';
import { listIdeas } from '@/lib/lab/ideas';
import { startPipelineForIdea } from '@/lib/idea-pipeline';
import type { Idea } from '@/lib/lab/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: { channel: string };
}

interface Body {
  /** Subconjunto de ideas a encolar. Si se omite, se encolan TODAS las del canal. */
  ideaIds?: string[];
}

/**
 * POST /api/channels/[channel]/ideas/start-queue
 *
 * Encola el pipeline de SARA para varias ideas, que se procesan UNO DETRÁS DE
 * OTRO en la cola serial existente (lib/job-queue). Cada idea se scaffolda y se
 * mete como item; si una falla al crearse, se SALTA y se sigue con la siguiente
 * (aislamiento de fallos). En runtime, si SARA se "bloquea" en una decisión que
 * requiere a Pablo, termina su turno no-interactivo dejando el bloqueo anotado y
 * la cola continúa con el siguiente vídeo (regla estricta de Pablo).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const channel = getChannel(ctx.params.channel);
  if (!channel) {
    return NextResponse.json({ error: `Unknown channel: ${ctx.params.channel}` }, { status: 404 });
  }
  if (!channel.autoPipeline) {
    return NextResponse.json(
      { error: `El pipeline automático aún no está habilitado para ${channel.name}.` },
      { status: 403 },
    );
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // body opcional
  }

  // Candidatas: ideas del canal aún no en producción.
  const pipelineable = listIdeas({ channelId: channel.slug }).filter(
    (i) => i.status === 'raw' || i.status === 'developing',
  );
  let targets: Idea[] = pipelineable;
  if (Array.isArray(body.ideaIds) && body.ideaIds.length > 0) {
    const set = new Set(body.ideaIds);
    targets = pipelineable.filter((i) => set.has(i.id));
  }

  // Orden de producción: prioridad desc, luego más antigua primero.
  targets = targets.slice().sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.createdAt < b.createdAt ? -1 : 1;
  });

  if (targets.length === 0) {
    return NextResponse.json({ error: 'No hay ideas pendientes que encolar.' }, { status: 400 });
  }

  const enqueued: Array<{ ideaId: string; title: string; videoFolder: string; queueItemId?: string }> = [];
  const errors: Array<{ ideaId: string; title: string; error: string }> = [];

  for (const idea of targets) {
    try {
      const res = startPipelineForIdea(channel, idea, 'queue');
      enqueued.push({ ideaId: idea.id, title: idea.title, videoFolder: res.videoFolder, queueItemId: res.queueItemId });
    } catch (e) {
      // Aislamiento: una idea que falla al crearse NO detiene el lote.
      errors.push({ ideaId: idea.id, title: idea.title, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    ok: enqueued.length > 0,
    enqueued: enqueued.length,
    skipped: errors.length,
    items: enqueued,
    errors,
  });
}
