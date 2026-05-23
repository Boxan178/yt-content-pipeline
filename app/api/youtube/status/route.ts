import { NextRequest, NextResponse } from 'next/server';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getChannel } from '@/lib/channels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_DIR = path.join(os.homedir(), '.yt-content-pipeline');
const CACHE_FILE = path.join(CACHE_DIR, 'yt-cache.json');
const TTL_MS = 60 * 60 * 1000; // 1 hora

interface CacheEntry {
  fetchedAt: number;
  videos: Array<{ id: string; title: string; published: string }>;
}
type Cache = Record<string, CacheEntry>; // key = youtubeChannelId

function readCache(): Cache {
  if (!existsSync(CACHE_FILE)) return {};
  try { return JSON.parse(readFileSync(CACHE_FILE, 'utf-8')); } catch { return {}; }
}
function writeCache(c: Cache) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(c, null, 2), 'utf-8');
}

async function fetchChannelFeed(channelId: string): Promise<CacheEntry['videos']> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'yt-content-pipeline/0.1' } });
  if (!r.ok) throw new Error(`RSS HTTP ${r.status}`);
  const xml = await r.text();
  // Parser muy básico — solo necesitamos id, title, published
  const out: CacheEntry['videos'] = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml))) {
    const block = m[1];
    const idMatch = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    const titleMatch = block.match(/<title>([^<]+)<\/title>/);
    const publishedMatch = block.match(/<published>([^<]+)<\/published>/);
    if (idMatch && titleMatch) {
      out.push({
        id: idMatch[1],
        title: titleMatch[1].trim(),
        published: publishedMatch?.[1] ?? '',
      });
    }
  }
  return out;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}0-9 ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a: string, b: string): number {
  // Jaccard sobre palabras normalizadas
  const setA = new Set(normalize(a).split(' ').filter((w) => w.length > 2));
  const setB = new Set(normalize(b).split(' ').filter((w) => w.length > 2));
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter++;
  const union = setA.size + setB.size - inter;
  return inter / union;
}

/**
 * GET /api/youtube/status?channel=moderni-stoici&title=...
 *
 * Lee el RSS público del canal de YouTube configurado en `lib/channels.ts`.
 * Compara el título buscado con los últimos 15 vídeos publicados (fuzzy
 * Jaccard sobre palabras). Si coincide >= 0.4 → uploaded:true.
 *
 * Sin OAuth, sin cuota. El RSS solo lista los últimos 15 vídeos del canal.
 * Si Pablo busca vídeos más viejos, hay que migrar a API key con search.list.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const channelSlug = url.searchParams.get('channel');
  const title = url.searchParams.get('title');
  if (!channelSlug || !title) {
    return NextResponse.json({ ok: false, error: 'Missing channel/title' }, { status: 400 });
  }
  const channel = getChannel(channelSlug);
  if (!channel) {
    return NextResponse.json({ ok: false, error: 'Channel not found' }, { status: 404 });
  }
  if (!channel.youtubeChannelId) {
    return NextResponse.json({
      ok: true,
      uploaded: false,
      configured: false,
      hint: 'Configura youtubeChannelId en lib/channels.ts para activar esta comprobación.',
    });
  }

  const cache = readCache();
  let entry = cache[channel.youtubeChannelId];
  if (!entry || Date.now() - entry.fetchedAt > TTL_MS) {
    try {
      const videos = await fetchChannelFeed(channel.youtubeChannelId);
      entry = { fetchedAt: Date.now(), videos };
      cache[channel.youtubeChannelId] = entry;
      writeCache(cache);
    } catch (e) {
      return NextResponse.json({
        ok: true,
        uploaded: false,
        configured: true,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Buscar mejor match
  let best: { score: number; video: CacheEntry['videos'][number] | null } = { score: 0, video: null };
  for (const v of entry.videos) {
    const s = similarity(title, v.title);
    if (s > best.score) best = { score: s, video: v };
  }
  const uploaded = best.score >= 0.4 && best.video !== null;
  return NextResponse.json({
    ok: true,
    configured: true,
    uploaded,
    score: best.score,
    video: uploaded && best.video
      ? {
          id: best.video.id,
          title: best.video.title,
          url: `https://www.youtube.com/watch?v=${best.video.id}`,
          published: best.video.published,
        }
      : null,
    cachedAt: new Date(entry.fetchedAt).toISOString(),
  });
}
