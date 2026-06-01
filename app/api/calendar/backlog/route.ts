import { NextResponse } from 'next/server';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { CHANNELS, channelColor } from '@/lib/channels';
import { hasUploadForFolder } from '@/lib/upload-schedule';
import { listIdeas } from '@/lib/lab/ideas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv']);
const RENDER_MIN_BYTES = 50 * 1024 * 1024;

/** ¿La carpeta tiene un render principal (.mp4 ≥ 50MB, no "Short N")? */
async function hasRenderPrincipal(folder: string): Promise<boolean> {
  try {
    const files = await readdir(path.join(folder, 'RENDER'));
    for (const f of files) {
      if (!VIDEO_EXT.has(path.extname(f).toLowerCase())) continue;
      if (/^Short\s+\d/i.test(f)) continue;
      try {
        const st = await stat(path.join(folder, 'RENDER', f));
        if (st.isFile() && st.size >= RENDER_MIN_BYTES) return true;
      } catch {}
    }
  } catch {}
  return false;
}

/**
 * GET /api/calendar/backlog — material arrastrable al calendario:
 *   - ideas: banco de ideas no publicadas (lib/lab/ideas.ts).
 *   - readyVideos: vídeos en `_LISTOS PARA SUBIR` con render y sin subida ya
 *     encolada/hecha (para arrastrar → programar vía /upload).
 * Se carga bajo demanda (no en el poll de 30s) porque escanea disco.
 */
export async function GET() {
  const ideas = listIdeas()
    .filter((i) => i.status !== 'published')
    .map((i) => ({ id: i.id, title: i.title, channelId: i.channelId, status: i.status }));

  const readyVideos: Array<{ channel: string; channelName: string; channelColor: string; title: string; folderPath: string }> = [];
  await Promise.all(
    CHANNELS.filter((c) => c.enabled && c.stateFolders.ready).map(async (c) => {
      const readyDir = path.join(c.rootPath, c.stateFolders.ready);
      let entries: string[];
      try {
        entries = await readdir(readyDir);
      } catch {
        return;
      }
      await Promise.all(
        entries.map(async (name) => {
          if (c.ignoreFolders.includes(name)) return;
          const folderPath = path.join(readyDir, name);
          try {
            const st = await stat(folderPath);
            if (!st.isDirectory()) return;
          } catch {
            return;
          }
          if (!(await hasRenderPrincipal(folderPath))) return;
          // Excluir los que ya tienen subida en marcha o hecha.
          if (hasUploadForFolder(folderPath.replace(/\\/g, '/'))) return;
          readyVideos.push({
            channel: c.slug,
            channelName: c.name,
            channelColor: channelColor(c.slug),
            title: name,
            folderPath: folderPath.replace(/\\/g, '/'),
          });
        }),
      );
    }),
  );

  return NextResponse.json({ ok: true, ideas, readyVideos });
}
