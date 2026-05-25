import { NextRequest, NextResponse } from 'next/server';
import { createDraft, listDrafts, type CreateDraftInput } from '@/lib/lab/drafts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/lab/channels — lista todos los drafts. */
export async function GET() {
  return NextResponse.json({ ok: true, drafts: listDrafts() });
}

/** POST /api/lab/channels — crea un draft nuevo y devuelve su id. */
export async function POST(req: NextRequest) {
  let body: CreateDraftInput;
  try {
    body = (await req.json()) as CreateDraftInput;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.referenceChannelUrl || typeof body.referenceChannelUrl !== 'string') {
    return NextResponse.json({ error: 'Missing referenceChannelUrl' }, { status: 400 });
  }
  if (!body.language) {
    return NextResponse.json({ error: 'Missing language' }, { status: 400 });
  }
  if (typeof body.initialTopic !== 'string') {
    return NextResponse.json({ error: 'Missing initialTopic' }, { status: 400 });
  }

  const draft = createDraft({
    referenceChannelUrl: body.referenceChannelUrl.trim(),
    language: body.language,
    initialTopic: body.initialTopic.trim(),
    transcripts: Array.isArray(body.transcripts) ? body.transcripts : [],
  });

  return NextResponse.json({ ok: true, draft });
}
