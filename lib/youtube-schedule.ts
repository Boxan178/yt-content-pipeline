// Sync del horario REAL de YouTube → calendario. Server-only.
//
// Dos fuentes, complementarias:
//   1) RSS público (https://www.youtube.com/feeds/videos.xml?channel_id=...):
//      sin OAuth, sin cuota. SOLO vídeos PÚBLICOS (últimos ~15). Cubre pasado/
//      presente publicado. Siempre disponible.
//   2) YouTube Data API (scripts/youtube_schedule.py vía el token de lectura del
//      skill youtube-seo-optimizer): vídeos PROPIOS incl. PROGRAMADOS privados
//      (publishAt futuro) — lo único que ve los huecos "falsos" del finde. Exige
//      token válido; si caducó/!refresca → status 'auth_required' y caemos a RSS.
//
// Resultado cacheado en ~/.yt-content-pipeline/youtube-schedule.json. Lo consume
// lib/calendar-gaps.ts (occupiedDatesByChannel) para que los huecos sean reales,
// y el MonthGrid para pintar lo que ya hay en el canal.

import 'server-only';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { getChannel } from './channels';
import { SEO_PYTHON, SEO_SCRIPTS_DIR } from './config';

const DIR = path.join(os.homedir(), '.yt-content-pipeline');
const FILE = path.join(DIR, 'youtube-schedule.json');

/** Clave del canal en el channels.json del skill SEO (suele coincidir con el slug). */
const SEO_CHANNEL_KEY: Record<string, string> = {
  'moderni-stoici': 'moderni-stoici',
};

export type YtItemKind = 'published' | 'scheduled';
export type YtChannelStatus = 'ok' | 'partial' | 'auth_required' | 'error' | 'unconfigured';

export interface YtItem {
  videoId?: string;
  title?: string;
  /** ISO. publishAt (programado) o publishedAt (publicado). */
  date: string;
  kind: YtItemKind;
  privacyStatus?: string;
}

export interface YtChannelCache {
  fetchedAt: string;
  status: YtChannelStatus;
  /** Fuentes que aportaron datos en este sync. */
  sources: Array<'rss' | 'api'>;
  items: YtItem[];
  error?: string;
}

interface YtScheduleCache {
  version: 1;
  channels: Record<string, YtChannelCache>;
}

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

export function readScheduleCache(): YtScheduleCache {
  if (!existsSync(FILE)) return { version: 1, channels: {} };
  try {
    const parsed = JSON.parse(readFileSync(FILE, 'utf-8')) as YtScheduleCache;
    if (!parsed || parsed.version !== 1 || typeof parsed.channels !== 'object') {
      return { version: 1, channels: {} };
    }
    return parsed;
  } catch {
    return { version: 1, channels: {} };
  }
}

function writeScheduleCache(c: YtScheduleCache) {
  ensureDir();
  writeFileSync(FILE, JSON.stringify(c, null, 2), 'utf-8');
}

function scriptPath(): string {
  if (process.env.YTCP_YT_SCHEDULE_SCRIPT) return process.env.YTCP_YT_SCHEDULE_SCRIPT;
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    path.join(process.cwd(), 'scripts', 'youtube_schedule.py'),
    resourcesPath ? path.join(resourcesPath, 'scripts', 'youtube_schedule.py') : '',
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0] ?? '';
}

/** RSS público: últimos vídeos PUBLICADOS. Sin auth. Devuelve [] si falla. */
async function fetchRss(channelId: string): Promise<YtItem[]> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  let xml: string;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    xml = await res.text();
  } catch {
    return [];
  }
  const items: YtItem[] = [];
  // Cada <entry> trae <yt:videoId>, <title> y <published>. Regex tolerante.
  const entries = xml.split('<entry>').slice(1);
  for (const e of entries) {
    const id = e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = e.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim();
    const published = e.match(/<published>([^<]+)<\/published>/)?.[1];
    if (!published) continue;
    items.push({ videoId: id, title, date: published, kind: 'published', privacyStatus: 'public' });
  }
  return items;
}

interface ApiResult {
  items: YtItem[];
  status: 'ok' | 'auth_required' | 'error';
  error?: string;
}

/** Data API vía el script Python (token de lectura SEO). Best-effort. */
function fetchApi(seoKey: string): Promise<ApiResult> {
  return new Promise((resolve) => {
    const script = scriptPath();
    if (!script || !existsSync(script) || !existsSync(SEO_PYTHON)) {
      resolve({ items: [], status: 'error', error: 'script o venv SEO no disponible' });
      return;
    }
    const args = [script, '--channel', seoKey, '--seo-scripts-dir', SEO_SCRIPTS_DIR, '--max', '50'];
    execFile(
      SEO_PYTHON,
      args,
      { timeout: 45_000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, YTCP_SEO_SCRIPTS_DIR: SEO_SCRIPTS_DIR } },
      (err, stdout) => {
        const raw = (stdout || '').trim();
        let parsed: { error?: string; items?: Array<Record<string, unknown>> } | null = null;
        try {
          parsed = JSON.parse(raw.split(/\r?\n/).filter(Boolean).pop() || '{}');
        } catch {
          parsed = null;
        }
        if (parsed?.error) {
          const msg = String(parsed.error);
          const auth = /invalid_client|invalid_grant|token|refresh|forMine|credenciales|No hay token/i.test(msg);
          resolve({ items: [], status: auth ? 'auth_required' : 'error', error: msg });
          return;
        }
        if (!parsed || !Array.isArray(parsed.items)) {
          const msg = err ? (err.message || String(err)) : 'salida no parseable del script';
          const auth = /invalid_client|invalid_grant|token/i.test(msg);
          resolve({ items: [], status: auth ? 'auth_required' : 'error', error: msg });
          return;
        }
        const items: YtItem[] = parsed.items
          .filter((it) => it && typeof it.date === 'string')
          .map((it) => ({
            videoId: it.videoId as string | undefined,
            title: it.title as string | undefined,
            date: it.date as string,
            kind: it.publishAt ? 'scheduled' : 'published',
            privacyStatus: it.privacyStatus as string | undefined,
          }));
        resolve({ items, status: 'ok' });
      },
    );
  });
}

/** Funde RSS + API deduplicando por videoId (y por fecha si no hay id). */
function mergeItems(api: YtItem[], rss: YtItem[]): YtItem[] {
  const out: YtItem[] = [];
  const seen = new Set<string>();
  const key = (i: YtItem) => i.videoId || `d:${i.date}`;
  for (const i of [...api, ...rss]) {
    const k = key(i);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(i);
  }
  return out;
}

/**
 * Sincroniza un canal: RSS (siempre) + API (si hay token). Escribe en cache y la
 * devuelve. No lanza: cualquier fallo queda reflejado en `status`.
 */
export async function syncChannelSchedule(slug: string): Promise<YtChannelCache> {
  const channel = getChannel(slug);
  const cache = readScheduleCache();
  const now = new Date().toISOString();

  if (!channel || !channel.youtubeChannelId) {
    const entry: YtChannelCache = {
      fetchedAt: now,
      status: 'unconfigured',
      sources: [],
      items: [],
      error: 'Canal sin youtubeChannelId',
    };
    cache.channels[slug] = entry;
    writeScheduleCache(cache);
    return entry;
  }

  const rss = await fetchRss(channel.youtubeChannelId);
  const seoKey = SEO_CHANNEL_KEY[slug];
  const api: ApiResult = seoKey
    ? await fetchApi(seoKey)
    : { items: [], status: 'error', error: 'canal sin token de lectura SEO' };

  const items = mergeItems(api.items, rss);
  const sources: Array<'rss' | 'api'> = [];
  if (api.status === 'ok') sources.push('api');
  if (rss.length) sources.push('rss');

  // status: ok si la API trajo programados; partial si solo RSS (publicados);
  // auth_required si la API pide re-login (pero RSS pudo cubrir publicados).
  let status: YtChannelStatus;
  if (api.status === 'ok') status = 'ok';
  else if (api.status === 'auth_required') status = 'auth_required';
  else status = rss.length ? 'partial' : 'error';

  const entry: YtChannelCache = {
    fetchedAt: now,
    status,
    sources,
    items,
    error: status === 'ok' ? undefined : api.error,
  };
  cache.channels[slug] = entry;
  writeScheduleCache(cache);
  return entry;
}

/** 'YYYY-MM-DD' local de un ISO. */
function ymdLocal(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Fechas (Date local, 1/día) ocupadas según YouTube por canal, leídas del cache.
 * Lo usa calendar-gaps para no marcar como hueco un día con vídeo real.
 */
export function getOccupiedYouTubeDates(): Map<string, Date[]> {
  const map = new Map<string, Date[]>();
  const cache = readScheduleCache();
  for (const [slug, entry] of Object.entries(cache.channels)) {
    if (entry.status === 'error' || entry.status === 'unconfigured') continue;
    const days = new Set<string>();
    for (const it of entry.items) {
      const ymd = ymdLocal(it.date);
      if (ymd) days.add(ymd);
    }
    const dates = [...days].map((ymd) => {
      const [y, m, d] = ymd.split('-').map(Number);
      return new Date(y, m - 1, d);
    });
    if (dates.length) map.set(slug, dates);
  }
  return map;
}

/** Estado por canal para la UI (badge "Reconectar YouTube", última sync, etc.). */
export function getYouTubeScheduleStatus(): Record<string, { status: YtChannelStatus; fetchedAt: string; count: number; scheduled: number; error?: string }> {
  const cache = readScheduleCache();
  const out: Record<string, { status: YtChannelStatus; fetchedAt: string; count: number; scheduled: number; error?: string }> = {};
  for (const [slug, entry] of Object.entries(cache.channels)) {
    out[slug] = {
      status: entry.status,
      fetchedAt: entry.fetchedAt,
      count: entry.items.length,
      scheduled: entry.items.filter((i) => i.kind === 'scheduled').length,
      error: entry.error,
    };
  }
  return out;
}
