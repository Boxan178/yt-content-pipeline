import { NextRequest, NextResponse } from 'next/server';
import { deleteResearch, getResearch } from '@/lib/lab/research';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: { id: string };
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const r = getResearch(ctx.params.id);
  if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, research: r });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const ok = deleteResearch(ctx.params.id);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
