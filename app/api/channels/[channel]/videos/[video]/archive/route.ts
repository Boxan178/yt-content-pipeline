import { NextRequest, NextResponse } from 'next/server';
import { rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { getChannel } from '@/lib/channels';
import { isSafePathSegment } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * POST /api/channels/[channel]/videos/[video]/archive
 *
 * Mueve la carpeta del vídeo desde la carpeta de "uploaded" a la de "archived".
 * No acepta archivar desde otros estados (sería destructivo de info útil).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { channel: string; video: string } },
) {
  const channel = getChannel(params.channel);
  if (!channel || !channel.enabled) {
    return NextResponse.json({ error: 'Channel not found or disabled' }, { status: 404 });
  }

  const videoTitle = decodeURIComponent(params.video);
  if (!isSafePathSegment(videoTitle)) {
    return NextResponse.json({ error: 'Invalid video name' }, { status: 400 });
  }
  const from = path.join(channel.rootPath, channel.stateFolders.uploaded, videoTitle);
  const to = path.join(channel.rootPath, channel.stateFolders.archived, videoTitle);

  if (!(await exists(from))) {
    return NextResponse.json(
      { error: `Video no encontrado en _SUBIDOS: ${videoTitle}` },
      { status: 404 },
    );
  }
  if (await exists(to)) {
    return NextResponse.json(
      { error: `Ya existe una carpeta con ese nombre en _ARCHIVO: ${videoTitle}` },
      { status: 409 },
    );
  }

  try {
    await rename(from, to);
  } catch (e) {
    return NextResponse.json(
      { error: `Error moviendo carpeta: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, from, to });
}
