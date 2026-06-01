import { NextRequest, NextResponse } from 'next/server';
import { stat, writeFile, unlink, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { getChannel } from '@/lib/channels';
import { isSafePathSegment } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SELECTED_FILE = '.selected-thumb';

async function tryStat(p: string) {
  try {
    return await stat(p);
  } catch {
    return null;
  }
}

async function findVideoFolder(channelRoot: string, stateFolders: string[], videoTitle: string) {
  for (const sf of stateFolders) {
    const candidate = path.join(channelRoot, sf, videoTitle);
    const s = await tryStat(candidate);
    if (s && s.isDirectory()) return candidate;
  }
  return null;
}

/**
 * POST /api/channels/[channel]/videos/[video]/select-thumbnail
 * Body: { filename: string | null }
 *
 * Si filename es string → marca esa miniatura como la elegida (escribe el
 * nombre en `_PACKAGING/MINIATURAS/.selected-thumb`).
 * Si filename es null → borra el flag y vuelve al fallback "última modificada".
 *
 * Validaciones:
 *  - filename no puede contener path separators (anti path traversal).
 *  - el archivo debe existir en MINIATURAS/.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { channel: string; video: string } },
) {
  const channel = getChannel(params.channel);
  if (!channel || !channel.enabled) {
    return NextResponse.json({ ok: false, error: 'Channel not found' }, { status: 404 });
  }

  let body: { filename?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const videoTitle = decodeURIComponent(params.video);
  if (!isSafePathSegment(videoTitle)) {
    return NextResponse.json({ ok: false, error: 'Invalid video name' }, { status: 400 });
  }
  const stateDirs = Object.values(channel.stateFolders);
  const videoDir = await findVideoFolder(channel.rootPath, stateDirs, videoTitle);
  if (!videoDir) {
    return NextResponse.json({ ok: false, error: 'Video folder not found' }, { status: 404 });
  }
  const minisDir = path.join(videoDir, '_PACKAGING', 'MINIATURAS');
  const minisStat = await tryStat(minisDir);
  if (!minisStat || !minisStat.isDirectory()) {
    return NextResponse.json({ ok: false, error: 'Miniaturas dir not found' }, { status: 404 });
  }
  const selectedPath = path.join(minisDir, SELECTED_FILE);

  // Caso clear (null)
  if (body.filename === null || body.filename === undefined) {
    if (existsSync(selectedPath)) {
      try { await unlink(selectedPath); } catch {}
    }
    return NextResponse.json({ ok: true, selected: null });
  }

  const filename = body.filename.trim();
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return NextResponse.json({ ok: false, error: 'filename inválido' }, { status: 400 });
  }
  const targetPath = path.join(minisDir, filename);
  const targetStat = await tryStat(targetPath);
  if (!targetStat || !targetStat.isFile()) {
    return NextResponse.json({ ok: false, error: 'Archivo no existe en MINIATURAS/' }, { status: 404 });
  }

  await writeFile(selectedPath, filename, 'utf-8');
  return NextResponse.json({ ok: true, selected: filename });
}

/**
 * GET /api/channels/[channel]/videos/[video]/select-thumbnail
 * Devuelve { selected: string | null } leyendo el flag actual.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { channel: string; video: string } },
) {
  const channel = getChannel(params.channel);
  if (!channel || !channel.enabled) {
    return NextResponse.json({ ok: false, error: 'Channel not found' }, { status: 404 });
  }
  const videoTitle = decodeURIComponent(params.video);
  if (!isSafePathSegment(videoTitle)) return NextResponse.json({ ok: true, selected: null });
  const stateDirs = Object.values(channel.stateFolders);
  const videoDir = await findVideoFolder(channel.rootPath, stateDirs, videoTitle);
  if (!videoDir) return NextResponse.json({ ok: true, selected: null });
  const selectedPath = path.join(videoDir, '_PACKAGING', 'MINIATURAS', SELECTED_FILE);
  if (!existsSync(selectedPath)) return NextResponse.json({ ok: true, selected: null });
  try {
    const content = (await readFile(selectedPath, 'utf-8')).trim();
    return NextResponse.json({ ok: true, selected: content || null });
  } catch {
    return NextResponse.json({ ok: true, selected: null });
  }
}
