import { NextRequest, NextResponse } from 'next/server';
import { createIdea, listIdeas, type CreateIdeaInput } from '@/lib/lab/ideas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const filter = url.searchParams.get('filter'); // 'bank' | 'assigned' | null
  if (filter === 'bank') {
    return NextResponse.json({ ok: true, ideas: listIdeas({ channelId: null }) });
  }
  return NextResponse.json({ ok: true, ideas: listIdeas() });
}

export async function POST(req: NextRequest) {
  let body: CreateIdeaInput;
  try {
    body = (await req.json()) as CreateIdeaInput;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.title?.trim() || !body.description?.trim()) {
    return NextResponse.json({ error: 'title y description son obligatorios' }, { status: 400 });
  }
  const idea = createIdea({
    title: body.title.trim(),
    description: body.description.trim(),
    tags: Array.isArray(body.tags) ? body.tags : [],
    channelId: body.channelId ?? null,
    priority: body.priority ?? 3,
    status: body.status ?? 'raw',
    sourceResearchId: body.sourceResearchId ?? null,
    replicatedFromIdeaId: body.replicatedFromIdeaId ?? null,
  });
  return NextResponse.json({ ok: true, idea });
}
