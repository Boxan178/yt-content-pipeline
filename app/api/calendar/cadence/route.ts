import { NextRequest, NextResponse } from 'next/server';
import { CHANNELS, channelColor } from '@/lib/channels';
import { readCadence, upsertCadence } from '@/lib/channel-cadence';
import type { ChannelCadence } from '@/lib/calendar-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/calendar/cadence — cadencia objetivo de cada canal activo (con su
 * registro guardado o null si no está configurada). Lo consume el panel de
 * cadencia del calendario.
 */
export async function GET() {
  const saved = new Map(readCadence().items.map((c) => [c.channel, c]));
  const channels = CHANNELS.filter((c) => c.enabled).map((c) => ({
    slug: c.slug,
    name: c.name,
    color: channelColor(c.slug),
    autoPipeline: !!c.autoPipeline,
    cadence: saved.get(c.slug) ?? null,
  }));
  return NextResponse.json({ ok: true, channels });
}

/**
 * PUT /api/calendar/cadence — crea/actualiza la cadencia de un canal.
 * Body: { channel, enabled?, targetPerWeek, preferredWeekdays?, hour? }
 */
export async function PUT(req: NextRequest) {
  let body: Partial<ChannelCadence> & { channel?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.channel) {
    return NextResponse.json({ ok: false, error: 'channel obligatorio' }, { status: 400 });
  }
  const saved = upsertCadence({ ...body, channel: body.channel });
  if (!saved) {
    return NextResponse.json({ ok: false, error: `channel desconocido: ${body.channel}` }, { status: 400 });
  }
  return NextResponse.json({ ok: true, cadence: saved });
}
