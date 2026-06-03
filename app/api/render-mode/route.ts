import { NextRequest, NextResponse } from 'next/server';
import { getRenderMode, setRenderMode, type RenderMode } from '@/lib/render-mode';
import { sendApprovalsNotice } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/render-mode — modo actual ('auto' | 'manual'). */
export async function GET() {
  return NextResponse.json({ ok: true, mode: getRenderMode() });
}

/** POST /api/render-mode — fija el modo. Body: { mode: 'auto' | 'manual' }. */
export async function POST(req: NextRequest) {
  let body: { mode?: string };
  try {
    body = (await req.json()) as { mode?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  if (body.mode !== 'auto' && body.mode !== 'manual') {
    return NextResponse.json({ ok: false, error: "mode debe ser 'auto' | 'manual'" }, { status: 400 });
  }
  const mode = body.mode as RenderMode;
  const prev = getRenderMode();
  setRenderMode(mode);

  if (prev !== mode) {
    const notice =
      mode === 'auto'
        ? '🎬 <b>Auto-render ON</b> — los vídeos se renderizan solos (uno a uno) en cuanto tienen todo menos el render.'
        : '✋ <b>Render manual</b> — los renders los disparas tú desde la app (columna «Cola de render»).';
    try {
      await sendApprovalsNotice(notice);
    } catch {
      // ignorado
    }
  }

  return NextResponse.json({ ok: true, mode });
}
