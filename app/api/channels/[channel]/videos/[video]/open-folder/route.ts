import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { getChannel } from '@/lib/channels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function tryStat(p: string) {
  try {
    return await stat(p);
  } catch {
    return null;
  }
}

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
  const stateDirs = Object.values(channel.stateFolders);
  let videoDir: string | null = null;
  for (const sf of stateDirs) {
    const cand = path.join(channel.rootPath, sf, videoTitle);
    const s = await tryStat(cand);
    if (s && s.isDirectory()) {
      videoDir = cand;
      break;
    }
  }
  if (!videoDir) {
    return NextResponse.json({ error: 'Video folder not found' }, { status: 404 });
  }

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
