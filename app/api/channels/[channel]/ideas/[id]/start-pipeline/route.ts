import { NextRequest, NextResponse } from 'next/server';
import { getChannel } from '@/lib/channels';
import { getIdea } from '@/lib/lab/ideas';
import { startPipelineForIdea } from '@/lib/idea-pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: { channel: string; id: string };
}

/**
 * POST /api/channels/[channel]/ideas/[id]/start-pipeline
 *
 * Crea la carpeta del vídeo en _EN PRODUCCIÓN/<título> + idea.md y lanza a SARA
 * YA (no por cola) hasta "listo para subir" (sin publicar). Marca la idea como
 * in-production. La lógica vive en lib/idea-pipeline.ts (compartida con la cola).
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const channel = getChannel(ctx.params.channel);
  if (!channel) {
    return NextResponse.json({ error: `Unknown channel: ${ctx.params.channel}` }, { status: 404 });
  }
  if (!channel.autoPipeline) {
    return NextResponse.json(
      { error: `El pipeline automático aún no está habilitado para ${channel.name}. Por ahora solo canales estoicos listos.` },
      { status: 403 },
    );
  }

  const idea = getIdea(ctx.params.id);
  if (!idea || idea.channelId !== channel.slug) {
    return NextResponse.json({ error: 'Idea not found in this channel' }, { status: 404 });
  }
  if (idea.status === 'in-production') {
    return NextResponse.json(
      { error: 'Esta idea ya tiene un pipeline en marcha.', videoFolder: idea.videoFolder ?? null },
      { status: 409 },
    );
  }

  try {
    const { videoFolder, jobId } = startPipelineForIdea(channel, idea, 'now');
    return NextResponse.json({ ok: true, jobId, videoFolder });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
