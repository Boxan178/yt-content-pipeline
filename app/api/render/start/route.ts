import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { normalizeAllowedPath } from '@/lib/config';
import { isAnyRenderRunning, startRenderFor } from '@/lib/auto-render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/render/start — dispara el render (LUIS) de un vídeo a mano.
 * Body: { channel, videoFolder, title? }. Respeta el gate secuencial: si ya hay
 * un render en curso, devuelve 409 (los renders van de uno en uno).
 */
export async function POST(req: NextRequest) {
  let body: { channel?: string; videoFolder?: string; title?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const folder = normalizeAllowedPath(body.videoFolder);
  if (!folder || !body.channel) {
    return NextResponse.json({ ok: false, error: 'Faltan channel/videoFolder' }, { status: 400 });
  }
  if (isAnyRenderRunning()) {
    return NextResponse.json(
      { ok: false, error: 'Ya hay un render en curso. Los renders van de uno en uno.' },
      { status: 409 },
    );
  }
  try {
    const { jobId } = startRenderFor({
      channel: body.channel,
      title: body.title ?? path.basename(folder),
      folderPath: folder,
    });
    return NextResponse.json({ ok: true, jobId });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
