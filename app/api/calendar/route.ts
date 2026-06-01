import { NextRequest, NextResponse } from 'next/server';
import { readSchedule } from '@/lib/upload-schedule';
import { readContentCalendar, addPlanned } from '@/lib/content-calendar';
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

  // 1) Subidas reales/programadas.
  const uploadItems: CalendarItem[] = readSchedule()
    .items.filter((u) => matchesChannel(u.channel))
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

  // 2) Plan editorial (huecos/ideas planificadas).
  const plannedItems: CalendarItem[] = readContentCalendar()
    .items.filter((p) => matchesChannel(p.channel))
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

  const channels = CHANNELS.filter((c) => c.enabled).map((c) => ({
    slug: c.slug,
    name: c.name,
    color: channelColor(c.slug),
  }));

  return NextResponse.json({ ok: true, items: [...uploadItems, ...plannedItems], channels });
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
