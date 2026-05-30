import { NextRequest, NextResponse } from 'next/server';
import { getChannel } from '@/lib/channels';
import { deleteIdea, getIdea, updateIdea } from '@/lib/lab/ideas';
import type { Idea } from '@/lib/lab/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: { channel: string; id: string };
}

/** DELETE /api/channels/[channel]/ideas/[id] — borra una idea del canal. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const channel = getChannel(ctx.params.channel);
  if (!channel) {
    return NextResponse.json({ error: `Unknown channel: ${ctx.params.channel}` }, { status: 404 });
  }
  const idea = getIdea(ctx.params.id);
  if (!idea || idea.channelId !== channel.slug) {
    return NextResponse.json({ error: 'Idea not found in this channel' }, { status: 404 });
  }
  const ok = deleteIdea(ctx.params.id);
  return NextResponse.json({ ok });
}

/** PATCH /api/channels/[channel]/ideas/[id] — edita campos de una idea. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const channel = getChannel(ctx.params.channel);
  if (!channel) {
    return NextResponse.json({ error: `Unknown channel: ${ctx.params.channel}` }, { status: 404 });
  }
  const idea = getIdea(ctx.params.id);
  if (!idea || idea.channelId !== channel.slug) {
    return NextResponse.json({ error: 'Idea not found in this channel' }, { status: 404 });
  }
  let patch: Partial<Idea>;
  try {
    patch = (await req.json()) as Partial<Idea>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  // No permitir reasignar el canal por aquí.
  delete patch.channelId;
  const updated = updateIdea(ctx.params.id, patch);
  return NextResponse.json({ ok: !!updated, idea: updated });
}
