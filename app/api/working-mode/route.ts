import { NextRequest, NextResponse } from 'next/server';
import { getWorkingMode, setWorkingMode, type WorkingMode } from '@/lib/working-mode';
import { sendApprovalsNotice } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/working-mode — modo actual ('home' | 'away'). */
export async function GET() {
  return NextResponse.json({ ok: true, mode: getWorkingMode() });
}

/** POST /api/working-mode — fija el modo. Body: { mode: 'home' | 'away' }. */
export async function POST(req: NextRequest) {
  let body: { mode?: string };
  try {
    body = (await req.json()) as { mode?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  if (body.mode !== 'home' && body.mode !== 'away') {
    return NextResponse.json({ ok: false, error: "mode debe ser 'home' | 'away'" }, { status: 400 });
  }
  const mode = body.mode as WorkingMode;
  const prev = getWorkingMode();
  setWorkingMode(mode);

  // Aviso a Telegram SOLO cuando el modo cambia de verdad (evita duplicados si la
  // UI re-postea el mismo valor). Best-effort: no rompe el toggle si Telegram falla.
  if (prev !== mode) {
    const notice =
      mode === 'away'
        ? '📲 <b>Fuera del PC</b> — te pongo al día y te aviso de todo lo que vaya acabando (renders, subidas…). Las decisiones te siguen llegando por aquí, como siempre.'
        : '💻 <b>En el PC</b> — dejo de avisarte de completados. Las decisiones te siguen llegando por Telegram igual.';
    try {
      await sendApprovalsNotice(notice);
    } catch {
      // ignorado
    }
  }

  return NextResponse.json({ ok: true, mode });
}
