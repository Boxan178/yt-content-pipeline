import { NextRequest, NextResponse } from 'next/server';
import { addUpload, tickScheduler, type AddUploadOptions } from '@/lib/upload-schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/uploads
 * Tick + lista actual de uploads programados.
 */
export async function GET() {
  const state = tickScheduler();
  return NextResponse.json({ ok: true, items: state.items });
}

/**
 * POST /api/uploads
 * Body: AddUploadOptions
 */
export async function POST(req: NextRequest) {
  let body: Partial<AddUploadOptions>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const required: (keyof AddUploadOptions)[] = [
    'videoFolder', 'videoTitle', 'channel', 'title', 'description',
    'tags', 'thumbnailFilename', 'privacyOnPublish', 'scheduledFor',
  ];
  for (const k of required) {
    if (body[k] === undefined || body[k] === null) {
      return NextResponse.json({ ok: false, error: `Falta campo: ${k}` }, { status: 400 });
    }
  }
  if (!Array.isArray(body.tags)) {
    return NextResponse.json({ ok: false, error: 'tags debe ser array' }, { status: 400 });
  }
  const item = addUpload(body as AddUploadOptions);
  return NextResponse.json({ ok: true, item });
}
