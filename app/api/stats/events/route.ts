import { NextRequest, NextResponse } from 'next/server';
import { recordEvent } from '@/lib/gamification';
import type { XPEventKind } from '@/lib/gamification-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID: XPEventKind[] = [
  'job_done',
  'job_approved',
  'job_rejected',
  'video_uploaded',
  'video_ready',
  'thumbnail_added',
  'checklist_resolved',
  'streak_day',
];

/**
 * POST /api/stats/events
 * Body: { kind: XPEventKind, label?: string }
 * Registra un evento y devuelve el AwardResult (xp ganado, level-up, logros).
 */
export async function POST(req: NextRequest) {
  let body: { kind?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const kind = body.kind;
  if (!kind || !VALID.includes(kind as XPEventKind)) {
    return NextResponse.json(
      { ok: false, error: `kind inválido. Permitidos: ${VALID.join(', ')}` },
      { status: 400 },
    );
  }
  const result = recordEvent(kind as XPEventKind, body.label);
  return NextResponse.json({ ok: true, result });
}
