import { NextResponse } from 'next/server';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { CHANNELS, type VideoState } from '@/lib/channels';
import { computeProgress } from '@/lib/progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function tryReaddir(p: string): Promise<string[]> {
  try {
    return await readdir(p);
  } catch {
    return [];
  }
}

async function tryStat(p: string) {
  try {
    return await stat(p);
  } catch {
    return null;
  }
}

const STOIC_SLUGS = ['moderni-stoici', 'moderno-estoico'];

interface SleepStoryDTO {
  channel: string;
  channelName: string;
  title: string;
  language: 'en' | 'es';
  state: VideoState;
  folderPath: string;
  thumbnailUrl: string | null;
  mtime: string;
  progress: {
    percent: number;
    hits: number;
    total: number;
  };
}

/**
 * GET /api/sleep-stories
 * Lista todas las carpetas que empiezan por `story-` en los canales estoicos.
 * Detecta idioma por sufijo: `-es` = español, resto = inglés.
 */
export async function GET() {
  const results: SleepStoryDTO[] = [];
  for (const channel of CHANNELS) {
    if (!STOIC_SLUGS.includes(channel.slug) || !channel.enabled) continue;
    for (const [state, folder] of Object.entries(channel.stateFolders) as [VideoState, string][]) {
      if (!folder) continue;
      const stateDir = path.join(channel.rootPath, folder);
      const entries = await tryReaddir(stateDir);
      for (const name of entries) {
        if (!name.startsWith('story-')) continue;
        const fp = path.join(stateDir, name);
        const st = await tryStat(fp);
        if (!st || !st.isDirectory()) continue;
        const language: 'en' | 'es' = name.endsWith('-es') ? 'es' : 'en';
        const progress = await computeProgress(fp);
        results.push({
          channel: channel.slug,
          channelName: channel.name,
          title: name,
          language,
          state,
          folderPath: fp.replace(/\\/g, '/'),
          thumbnailUrl: `/api/channels/${encodeURIComponent(channel.slug)}/videos/${encodeURIComponent(name)}/thumbnail`,
          mtime: new Date(st.mtimeMs).toISOString(),
          progress: { percent: progress.percent, hits: progress.hits, total: progress.total },
        });
      }
    }
  }
  results.sort((a, b) => a.title.localeCompare(b.title, 'es'));
  return NextResponse.json({ ok: true, stories: results });
}
