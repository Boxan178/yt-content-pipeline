import { NextRequest, NextResponse } from 'next/server';
import { deleteIdea, getIdea, updateIdea } from '@/lib/lab/ideas';
import type { Idea } from '@/lib/lab/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: { id: string };
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const idea = getIdea(ctx.params.id);
  if (!idea) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, idea });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  let body: Partial<Idea>;
  try {
    body = (await req.json()) as Partial<Idea>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const updated = updateIdea(ctx.params.id, body);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, idea: updated });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const ok = deleteIdea(ctx.params.id);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
