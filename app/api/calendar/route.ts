import { NextRequest, NextResponse } from 'next/server';
import { readSchedule } from '@/lib/upload-schedule';
import { readContentCalendar, addPlanned } from '@/lib/content-calendar';
import { readScheduleCache } from '@/lib/youtube-schedule';
import { CHANNELS, getChannel, channelColor } from '@/lib/channels';
import type { CalendarItem } from '@/lib/calendar-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/calendar — vista editorial de pájaro. Fusiona dos fuentes:
 *   1. scheduled-uploads.json (subidas reales/programadas) → source 'upload'.
 *   2. content-calendar.json (plan editorial, Fase 2)        → source 'planned'.
 *
 * SOLO LECTURA: a diferencia de /api/uploads, NO llama a tickScheduler() — abrir
 * el calendario no debe disparar subidas. El estado de las subidas lo refrescan
 * /api/uploads (página Subidas) y el poller de Electron.
 *
 * Query opcional: ?channel=<slug> filtra server-side por canal.
 */
export async function GET(req: NextRequest) {
  const channelFilter = req.nextUrl.searchParams.get('channel');
  const matchesChannel = (slug: string) => !channelFilter || slug === channelFilter;

  const scheduleItems = readSchedule().items;
  // 1) Subidas reales/programadas.
  const uploadItems: CalendarItem[] = scheduleItems
    .filter((u) => matchesChannel(u.channel))
    .map((u) => ({
      id: u.id,
      channel: u.channel,
      channelName: getChannel(u.channel)?.name ?? u.channel,
      channelColor: channelColor(u.channel),
      title: u.title || u.videoTitle,
      date: u.publishAt ?? u.scheduledFor,
      status: u.status,
      source: 'upload' as const,
      nativeSchedule: !!u.publishAt,
      videoFolder: u.videoFolder,
      youtubeVideoId: u.youtubeVideoId,
    }));

  // Basename de carpeta de cada subida (estable aunque la carpeta cambie de
  // estado) → para ocultar el planificado que YA es subida y no duplicar el chip.
  const baseOf = (f?: string) =>
    (f || '').replace(/\\/g, '/').split('/').filter(Boolean).pop()?.normalize('NFC') ?? '';
  const uploadFolderBases = new Set(scheduleItems.map((u) => baseOf(u.videoFolder)).filter(Boolean));

  // 2) Plan editorial (huecos/ideas planificadas). Oculta los que ya tienen subida
  //    (misma carpeta): la subida es el registro vivo → evita el chip duplicado.
  const plannedItems: CalendarItem[] = readContentCalendar()
    .items.filter((p) => matchesChannel(p.channel))
    .filter((p) => !p.videoFolder || !uploadFolderBases.has(baseOf(p.videoFolder)))
    .map((p) => ({
      id: p.id,
      channel: p.channel,
      channelName: getChannel(p.channel)?.name ?? p.channel,
      channelColor: channelColor(p.channel),
      title: p.title,
      date: p.date,
      status: p.status,
      source: 'planned' as const,
      nativeSchedule: false,
      videoFolder: p.videoFolder,
      plannedId: p.id,
      ideaId: p.ideaId,
    }));

  // 3) Horario REAL de YouTube (RSS publicados + API programados privados). Es la
  //    fuente que refleja lo que de verdad hay en el canal, aunque se subiera/
  //    programara fuera de la app. Dedup por youtubeVideoId contra las subidas
  //    (auto-publish ya las registra con su videoId → no duplicar chip).
  const uploadVideoIds = new Set(scheduleItems.map((u) => u.youtubeVideoId).filter(Boolean) as string[]);
  const ytCache = readScheduleCache();
  const youtubeItems: CalendarItem[] = [];
  for (const [slug, entry] of Object.entries(ytCache.channels)) {
    if (!matchesChannel(slug)) continue;
    if (entry.status === 'error' || entry.status === 'unconfigured') continue;
    for (const it of entry.items) {
      if (it.videoId && uploadVideoIds.has(it.videoId)) continue;
      youtubeItems.push({
        id: `yt:${slug}:${it.videoId ?? it.date}`,
        channel: slug,
        channelName: getChannel(slug)?.name ?? slug,
        channelColor: channelColor(slug),
        title: it.title ?? '(sin título)',
        date: it.date,
        status: it.kind === 'scheduled' ? 'scheduled' : 'done',
        source: 'youtube' as const,
        nativeSchedule: it.kind === 'scheduled',
        youtubeVideoId: it.videoId,
      });
    }
  }

  const channels = CHANNELS.filter((c) => c.enabled).map((c) => ({
    slug: c.slug,
    name: c.name,
    color: channelColor(c.slug),
  }));

  return NextResponse.json({ ok: true, items: [...uploadItems, ...plannedItems, ...youtubeItems], channels });
}

/**
 * POST /api/calendar — crea un item planificado (plan editorial). No sube nada a
 * YouTube; solo coloca un hueco/idea en una fecha. Body:
 *   { channel, date(ISO), title, ideaId?, videoFolder? }
 */
export async function POST(req: NextRequest) {
  let body: { channel?: string; date?: string; title?: string; ideaId?: string; videoFolder?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.channel || !getChannel(body.channel)) {
    return NextResponse.json({ ok: false, error: 'channel inválido' }, { status: 400 });
  }
  if (!body.date || Number.isNaN(Date.parse(body.date))) {
    return NextResponse.json({ ok: false, error: 'date inválida' }, { status: 400 });
  }
  if (!body.title?.trim()) {
    return NextResponse.json({ ok: false, error: 'title obligatorio' }, { status: 400 });
  }
  const item = addPlanned({
    channel: body.channel,
    date: body.date,
    title: body.title.trim(),
    ideaId: body.ideaId,
    videoFolder: body.videoFolder,
  });
  return NextResponse.json({ ok: true, item });
}
