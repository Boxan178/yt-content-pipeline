import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { getChannel } from '@/lib/channels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IMAGE_EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

async function tryStat(p: string) {
  try {
    return await stat(p);
  } catch {
    return null;
  }
}

/**
 * Encuentra la carpeta del vídeo dentro del canal probando los 4 estados.
 * Devuelve null si no existe en ninguno.
 */
async function findVideoFolder(channelRoot: string, stateFolders: string[], videoTitle: string) {
  for (const sf of stateFolders) {
    const candidate = path.join(channelRoot, sf, videoTitle);
    const s = await tryStat(candidate);
    if (s && s.isDirectory()) return candidate;
  }
  return null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { channel: string; video: string } },
) {
  const channel = getChannel(params.channel);
  if (!channel || !channel.enabled) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  const videoTitle = decodeURIComponent(params.video);
  const stateDirs = Object.values(channel.stateFolders);
  const videoDir = await findVideoFolder(channel.rootPath, stateDirs, videoTitle);
  if (!videoDir) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const minisDir = path.join(videoDir, '_PACKAGING', 'MINIATURAS');
  let entries: string[];
  try {
    entries = await readdir(minisDir);
  } catch {
    return NextResponse.json({ error: 'No miniatures folder' }, { status: 404 });
  }

  type Cand = { name: string; mtime: number; ext: string };
  const candidates: Cand[] = [];
  for (const name of entries) {
    const ext = path.extname(name).toLowerCase();
    if (!(ext in IMAGE_EXT_MIME)) continue;
    const full = path.join(minisDir, name);
    const s = await tryStat(full);
    if (s && s.isFile()) candidates.push({ name, mtime: s.mtimeMs, ext });
  }

  if (candidates.length === 0) {
    return NextResponse.json({ error: 'No miniature image' }, { status: 404 });
  }
  candidates.sort((a, b) => b.mtime - a.mtime);

  // Prioridad: si existe `.selected-thumb` con un nombre válido, usar ése.
  // Fallback: la más recientemente modificada.
  let chosen: Cand | undefined;
  try {
    const selectedPath = path.join(minisDir, '.selected-thumb');
    if (await tryStat(selectedPath)) {
      const wanted = (await readFile(selectedPath, 'utf-8')).trim();
      if (wanted) {
        const hit = candidates.find((c) => c.name === wanted);
        if (hit) chosen = hit;
      }
    }
  } catch {}
  if (!chosen) chosen = candidates[0];
  const fullPath = path.join(minisDir, chosen.name);

  const buf = await readFile(fullPath);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': IMAGE_EXT_MIME[chosen.ext],
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      'Content-Length': String(buf.length),
    },
  });
}
