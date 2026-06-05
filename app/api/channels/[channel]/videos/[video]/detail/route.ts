import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { getChannel } from '@/lib/channels';
import { resolveVideoFolder } from '@/lib/video-folders';
import { isSafePathSegment } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function tryStat(p: string) {
  try {
    return await stat(p);
  } catch {
    return null;
  }
}

async function safeReaddir(p: string): Promise<string[]> {
  try {
    return await readdir(p);
  } catch {
    return [];
  }
}

interface FileEntry {
  name: string;
  relPath: string;
  size: number;
  ext: string;
  mtime: string;
}

const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

async function listDirRecursive(absolute: string, basePath: string, maxDepth = 3): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  async function walk(cur: string, depth: number) {
    if (depth > maxDepth) return;
    const entries = await safeReaddir(cur);
    for (const e of entries) {
      const full = path.join(cur, e);
      const s = await tryStat(full);
      if (!s) continue;
      if (s.isDirectory()) {
        await walk(full, depth + 1);
      } else if (s.isFile()) {
        const rel = path.relative(basePath, full).replace(/\\/g, '/');
        out.push({
          name: e,
          relPath: rel,
          size: s.size,
          ext: path.extname(e).toLowerCase(),
          mtime: new Date(s.mtimeMs).toISOString(),
        });
      }
    }
  }
  await walk(absolute, 0);
  return out;
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
  if (!isSafePathSegment(videoTitle)) {
    return NextResponse.json({ error: 'Invalid video name' }, { status: 400 });
  }
  const folder = await resolveVideoFolder(channel, videoTitle);
  if (!folder) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  // packaging.md
  const packagingPath = path.join(folder.absolute, '_PACKAGING', 'packaging.md');
  let packagingMd: string | null = null;
  try {
    packagingMd = await readFile(packagingPath, 'utf-8');
  } catch {
    packagingMd = null;
  }

  // descripcion-seo.md: la descripción REAL de YouTube (prosa + chapters), que el
  // packaging.md no contiene. El form de subida la prefiere sobre el packaging.
  const descripcionSeoPath = path.join(folder.absolute, '_PACKAGING', 'descripcion-seo.md');
  let descripcionSeoMd: string | null = null;
  try {
    descripcionSeoMd = await readFile(descripcionSeoPath, 'utf-8');
  } catch {
    descripcionSeoMd = null;
  }

  // Listado completo de archivos relevantes (videos/audios/imágenes)
  const allFiles = await listDirRecursive(folder.absolute, folder.absolute, 3);

  const videos = allFiles
    .filter((f) => VIDEO_EXT.has(f.ext))
    .sort((a, b) => a.relPath.localeCompare(b.relPath));
  const audios = allFiles
    .filter((f) => AUDIO_EXT.has(f.ext))
    .sort((a, b) => a.relPath.localeCompare(b.relPath));
  const images = allFiles
    .filter((f) => IMAGE_EXT.has(f.ext))
    .sort((a, b) => a.relPath.localeCompare(b.relPath));

  // Render principal: el .mp4 más grande que NO sea Short
  const renderPrincipal = videos
    .filter((v) => v.relPath.startsWith('RENDER/') && !/Short\s+\d/i.test(v.name))
    .sort((a, b) => b.size - a.size)[0] ?? null;

  const shorts = videos.filter((v) => /^RENDER\/Short\s+\d/i.test(v.relPath));

  return NextResponse.json({
    channel: channel.slug,
    title: videoTitle,
    folderPath: folder.absolute,
    stateFolder: folder.stateFolder,
    packagingMd,
    descripcionSeoMd,
    counts: {
      videos: videos.length,
      audios: audios.length,
      images: images.length,
    },
    renderPrincipal,
    shorts,
    audios,
    images,
    allFiles,
  });
}
