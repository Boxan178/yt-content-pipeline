import { NextRequest, NextResponse } from 'next/server';
import { getChannel } from '@/lib/channels';
import { createIdea, listIdeas } from '@/lib/lab/ideas';
import type { Idea } from '@/lib/lab/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: { channel: string };
}

/** Ideas que se muestran en la columna "Ideas" del kanban: aún sin pipeline. */
function isPipelineableIdea(i: Idea): boolean {
  return i.status === 'raw' || i.status === 'developing';
}

/**
 * GET /api/channels/[channel]/ideas
 * Lista las ideas asignadas a este canal que todavía no han entrado en pipeline.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const channel = getChannel(ctx.params.channel);
  if (!channel) {
    return NextResponse.json({ error: `Unknown channel: ${ctx.params.channel}` }, { status: 404 });
  }
  const ideas = listIdeas({ channelId: channel.slug }).filter(isPipelineableIdea);
  return NextResponse.json({ ok: true, ideas, autoPipeline: !!channel.autoPipeline });
}

interface NewIdea {
  title: string;
  description: string;
  tags?: string[];
  priority?: 1 | 2 | 3 | 4 | 5;
  sourceVideoTitle?: string | null;
  sourceVideoUrl?: string | null;
  replicatedFromIdeaId?: string | null;
}

interface PostBody {
  /** Una sola idea, o un lote (desde "Explorar ideas"). */
  ideas?: NewIdea[];
  // Alta directa de una idea (campos sueltos).
  title?: string;
  description?: string;
  tags?: string[];
  priority?: 1 | 2 | 3 | 4 | 5;
  sourceVideoTitle?: string | null;
  sourceVideoUrl?: string | null;
}

/**
 * POST /api/channels/[channel]/ideas
 * Crea una idea (campos sueltos) o un lote (`ideas: [...]`). Todas quedan
 * asignadas a este canal (`channelId = slug`, status `raw`).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const channel = getChannel(ctx.params.channel);
  if (!channel) {
    return NextResponse.json({ error: `Unknown channel: ${ctx.params.channel}` }, { status: 404 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const incoming: NewIdea[] = Array.isArray(body.ideas)
    ? body.ideas
    : body.title
    ? [
        {
          title: body.title,
          description: body.description ?? '',
          tags: body.tags,
          priority: body.priority,
          sourceVideoTitle: body.sourceVideoTitle ?? null,
          sourceVideoUrl: body.sourceVideoUrl ?? null,
        },
      ]
    : [];

  const valid = incoming.filter((i) => i?.title?.trim() && i?.description?.trim());
  if (valid.length === 0) {
    return NextResponse.json(
      { error: 'Se requiere al menos una idea con title y description.' },
      { status: 400 },
    );
  }

  const created = valid.map((i) =>
    createIdea({
      title: i.title.trim(),
      description: i.description.trim(),
      tags: Array.isArray(i.tags) ? i.tags : [],
      channelId: channel.slug,
      priority: i.priority ?? 3,
      status: 'raw',
      replicatedFromIdeaId: i.replicatedFromIdeaId ?? null,
    }),
  );

  // createIdea no acepta sourceVideo*; los seteamos vía updateIdea para no
  // ampliar su firma. Import diferido para evitar ciclos.
  const { updateIdea } = await import('@/lib/lab/ideas');
  const enriched = created.map((idea, idx) => {
    const src = valid[idx];
    if (src.sourceVideoTitle || src.sourceVideoUrl) {
      return (
        updateIdea(idea.id, {
          sourceVideoTitle: src.sourceVideoTitle ?? null,
          sourceVideoUrl: src.sourceVideoUrl ?? null,
        }) ?? idea
      );
    }
    return idea;
  });

  return NextResponse.json({ ok: true, ideas: enriched, count: enriched.length });
}
