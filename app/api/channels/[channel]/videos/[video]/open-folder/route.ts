import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { getChannel } from '@/lib/channels';
import { resolveVideoFolder } from '@/lib/video-folders';
import { isSafePathSegment } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/channels/[channel]/videos/[video]/open-folder
 *
 * Lanza Explorer.exe (Windows) en la carpeta del vídeo. Solo funciona si la
 * app corre en local con permisos para spawn. Devuelve 501 en plataformas
 * no-Windows.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { channel: string; video: string } },
) {
  if (process.platform !== 'win32') {
    return NextResponse.json(
      { error: 'open-folder solo está implementado para Windows todavía' },
      { status: 501 },
    );
  }

  const channel = getChannel(params.channel);
  if (!channel || !channel.enabled) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  const videoTitle = decodeURIComponent(params.video);
  if (!isSafePathSegment(videoTitle)) {
    return NextResponse.json({ error: 'Invalid video name' }, { status: 400 });
  }
  const resolved = await resolveVideoFolder(channel, videoTitle);
  if (!resolved) {
    return NextResponse.json({ error: 'Video folder not found' }, { status: 404 });
  }
  const videoDir = resolved.absolute;

  try {
    // Path para Explorer.exe: barras backslash
    const winPath = videoDir.replace(/\//g, '\\');
    const child = spawn('explorer.exe', [winPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    // Explorer.exe devuelve exit code 1 incluso cuando abre OK (es normal).
    return NextResponse.json({ ok: true, opened: winPath });
  } catch (e) {
    return NextResponse.json(
      { error: `Error abriendo carpeta: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}
