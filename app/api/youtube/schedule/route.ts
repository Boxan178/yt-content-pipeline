import { NextRequest, NextResponse } from 'next/server';
import { CHANNELS } from '@/lib/channels';
import {
  syncChannelSchedule,
  getYouTubeScheduleStatus,
  readScheduleCache,
} from '@/lib/youtube-schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Canales con youtubeChannelId configurado (los únicos sincronizables). */
function syncableSlugs(): string[] {
  return CHANNELS.filter((c) => c.enabled && c.youtubeChannelId).map((c) => c.slug);
}

/**
 * GET /api/youtube/schedule — estado + items cacheados del horario real de
 * YouTube por canal. Solo lectura (no llama a la API). La UI lo usa para pintar
 * y mostrar el badge de estado/última sync.
 */
export async function GET() {
  const cache = readScheduleCache();
  return NextResponse.json({
    ok: true,
    status: getYouTubeScheduleStatus(),
    channels: cache.channels,
    syncable: syncableSlugs(),
  });
}

/**
 * POST /api/youtube/schedule — fuerza la sincronización. Body opcional
 * { channel?: slug }. Sin channel → sincroniza todos los configurados.
 */
export async function POST(req: NextRequest) {
  let body: { channel?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* sin body → todos */
  }
  const slugs = body.channel ? [body.channel] : syncableSlugs();
  const results = await Promise.all(
    slugs.map(async (slug) => ({ slug, result: await syncChannelSchedule(slug) })),
  );
  return NextResponse.json({
    ok: true,
    synced: results.map((r) => ({ slug: r.slug, status: r.result.status, count: r.result.items.length })),
    status: getYouTubeScheduleStatus(),
  });
}
