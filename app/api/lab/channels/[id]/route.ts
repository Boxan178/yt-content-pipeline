import { NextRequest, NextResponse } from 'next/server';
import { deleteDraft, getDraft, updateDraft } from '@/lib/lab/drafts';
import type { ChannelDraft } from '@/lib/lab/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: { id: string };
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const draft = getDraft(ctx.params.id);
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, draft });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  let body: Partial<ChannelDraft>;
  try {
    body = (await req.json()) as Partial<ChannelDraft>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const updated = updateDraft(ctx.params.id, body);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, draft: updated });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const ok = deleteDraft(ctx.params.id);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
