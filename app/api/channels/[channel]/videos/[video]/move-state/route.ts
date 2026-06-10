import { NextRequest, NextResponse } from 'next/server';
import { rename, stat, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { getChannel, type VideoState } from '@/lib/channels';
import { resolveVideoFolder } from '@/lib/video-folders';
import { isSafePathSegment } from '@/lib/config';
import { readSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function tryStat(p: string) {
  try {
    return await stat(p);
  } catch {
    return null;
  }
}

const VALID: VideoState[] = ['pending_locution', 'production', 'review', 'ready', 'uploaded', 'archived'];

/**
 * POST /api/channels/[channel]/videos/[video]/move-state
 * Body: { toState: VideoState }
 *
 * Mueve la carpeta del vídeo desde su subcarpeta actual a la subcarpeta del
 * nuevo estado. Usa fs.rename (atómico dentro del mismo drive).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { channel: string; video: string } },
) {
  const channel = getChannel(params.channel);
  if (!channel || !channel.enabled) {
    return NextResponse.json({ ok: false, error: 'Channel not found' }, { status: 404 });
  }
  let body: { toState?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.toState || !VALID.includes(body.toState as VideoState)) {
    return NextResponse.json(
      { ok: false, error: `toState inválido. Permitidos: ${VALID.join(', ')}` },
      { status: 400 },
    );
  }
  const toState = body.toState as VideoState;
  const toFolder = channel.stateFolders[toState];
  if (!toFolder) {
    return NextResponse.json(
      { ok: false, error: `Canal no tiene carpeta configurada para estado ${toState}` },
      { status: 422 },
    );
  }

  // Buscar la carpeta del vídeo en cualquier estado actual
  const videoTitle = decodeURIComponent(params.video);
  if (!isSafePathSegment(videoTitle)) {
    return NextResponse.json({ ok: false, error: 'Invalid video name' }, { status: 400 });
  }
  // Resuelve la carpeta REAL del vídeo (prefiere la que tiene material; ignora
  // la "fantasma" homónima que solo tiene .claude-jobs). Así move-state mueve el
  // vídeo de verdad, no un esqueleto vacío.
  const resolved = await resolveVideoFolder(channel, videoTitle);
  if (!resolved) {
    return NextResponse.json({ ok: false, error: 'Video folder no encontrado en ningún estado' }, { status: 404 });
  }
  const src = resolved.absolute;
  const fromState = resolved.state;
  if (fromState === toState) {
    return NextResponse.json({ ok: true, noop: true, message: 'ya está en ese estado' });
  }

  const dst = path.join(channel.rootPath, toFolder, videoTitle);
  const dstExists = await tryStat(dst);
  if (dstExists) {
    return NextResponse.json({ ok: false, error: 'Ya existe una carpeta con ese nombre en el destino' }, { status: 409 });
  }

  try {
    await rename(src, dst);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Error moviendo: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  // Si el destino es 'archived' y hay configurado un path NAS para este canal,
  // copia (o mueve) la carpeta al NAS además.
  let nasResult: { copied?: string; error?: string; deletedLocal?: boolean } | undefined;
  if (toState === 'archived') {
    try {
      const settings = readSettings();
      const nasPath = settings.channelNasPaths?.[channel.slug];
      if (nasPath && nasPath.trim()) {
        const nasDst = path.join(nasPath, videoTitle);
        const existingNas = await tryStat(nasDst);
        if (existingNas) {
          nasResult = { error: 'destino NAS ya tiene una carpeta con ese nombre' };
        } else {
          await cp(dst, nasDst, { recursive: true, force: false, errorOnExist: true });
          nasResult = { copied: nasDst.replace(/\\/g, '/') };
          if (settings.archiveMoveDeleteLocal) {
            try {
              await rm(dst, { recursive: true, force: true });
              nasResult.deletedLocal = true;
            } catch (e) {
              nasResult.error = `copia a NAS OK pero no se pudo borrar local: ${e instanceof Error ? e.message : String(e)}`;
            }
          }
        }
      }
    } catch (e) {
      nasResult = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  return NextResponse.json({
    ok: true,
    from: fromState,
    to: toState,
    src: src.replace(/\\/g, '/'),
    dst: dst.replace(/\\/g, '/'),
    nas: nasResult,
  });
}
