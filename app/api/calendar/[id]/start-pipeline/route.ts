import { NextRequest, NextResponse } from 'next/server';
import { getChannel } from '@/lib/channels';
import { getIdea, createIdea } from '@/lib/lab/ideas';
import { getPlanned, updatePlanned } from '@/lib/content-calendar';
import { startPipelineForIdea, type StartMode } from '@/lib/idea-pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: { id: string };
}

/**
 * POST /api/calendar/[id]/start-pipeline
 *
 * Arranca la producción de un item PLANIFICADO del calendario (Fase 3). Reusa
 * lib/idea-pipeline.ts (mismo motor que el botón del kanban):
 *   - resuelve la idea vinculada (o crea una al vuelo desde el título),
 *   - crea la carpeta del vídeo en _EN PRODUCCIÓN + idea.md,
 *   - encola a SARA (mode 'queue' por defecto: producción en serie) o la lanza ya.
 *
 * Solo canales con autoPipeline. Guard anti-doble-arranque: marca el planificado
 * como 'scheduled' ANTES de scaffolear (sección crítica síncrona en un único
 * proceso Node), y revierte si el arranque falla.
 *
 * Body opcional: { mode?: 'now' | 'queue' } (default 'queue').
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  let mode: StartMode = 'queue';
  try {
    const body = (await req.json()) as { mode?: StartMode };
    if (body?.mode === 'now' || body?.mode === 'queue') mode = body.mode;
  } catch {
    // sin body → default 'queue'
  }

  const planned = getPlanned(params.id);
  if (!planned) {
    return NextResponse.json({ ok: false, error: 'Item planificado no encontrado' }, { status: 404 });
  }

  const channel = getChannel(planned.channel);
  if (!channel) {
    return NextResponse.json({ ok: false, error: `Canal desconocido: ${planned.channel}` }, { status: 404 });
  }
  if (!channel.autoPipeline) {
    return NextResponse.json(
      { ok: false, error: `El pipeline automático no está habilitado para ${channel.name}.` },
      { status: 403 },
    );
  }
  if (planned.status === 'scheduled' || planned.videoFolder) {
    return NextResponse.json(
      { ok: false, error: 'Este planificado ya tiene producción en marcha.', videoFolder: planned.videoFolder ?? null },
      { status: 409 },
    );
  }

  // Resolver la idea: la vinculada, o una nueva al vuelo desde el planificado.
  let idea = planned.ideaId ? getIdea(planned.ideaId) : null;
  if (idea && idea.status === 'in-production') {
    return NextResponse.json(
      { ok: false, error: 'La idea vinculada ya tiene un pipeline en marcha.', videoFolder: idea.videoFolder ?? null },
      { status: 409 },
    );
  }
  if (!idea) {
    idea = createIdea({
      title: planned.title,
      description: `Planificado desde el calendario para ${channel.name}.`,
      channelId: channel.slug,
      status: 'raw',
    });
  }

  // Guard atómico: marcar 'scheduled' antes de scaffolear. startPipelineForIdea
  // es síncrono (sin await entre check y set), así que no hay ventana de carrera
  // en el proceso Next. Si falla, revertimos a 'planned'.
  updatePlanned(planned.id, { status: 'scheduled' });
  try {
    const { videoFolder, jobId, queueItemId } = startPipelineForIdea(channel, idea, mode);
    updatePlanned(planned.id, { videoFolder, ideaId: idea.id });
    return NextResponse.json({ ok: true, mode, videoFolder, jobId, queueItemId });
  } catch (e) {
    updatePlanned(planned.id, { status: 'planned' });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
