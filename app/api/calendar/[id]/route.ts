import { NextRequest, NextResponse } from 'next/server';
import { updatePlanned, deletePlanned, type PlannedPatch } from '@/lib/content-calendar';
import { getChannel } from '@/lib/channels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/calendar/[id] — mueve/edita un item planificado.
 * Body: { date?, title?, channel?, status?, videoFolder?, ideaId? }
 * Lo usa el drag-drop (cambiar de día) y la edición inline.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body: PlannedPatch;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  if (body.date !== undefined && Number.isNaN(Date.parse(body.date))) {
    return NextResponse.json({ ok: false, error: 'date inválida' }, { status: 400 });
  }
  if (body.channel !== undefined && !getChannel(body.channel)) {
    return NextResponse.json({ ok: false, error: 'channel inválido' }, { status: 400 });
  }
  const updated = updatePlanned(params.id, body);
  if (!updated) return NextResponse.json({ ok: false, error: 'no encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true, item: updated });
}

/** DELETE /api/calendar/[id] — borra un item planificado. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ok = deletePlanned(params.id);
  if (!ok) return NextResponse.json({ ok: false, error: 'no encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
