import { NextRequest, NextResponse } from 'next/server';
import { sendApprovalsNotice, sendInlinePhoto } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/telegram/notify — manda un aviso simple a Pablo por el bot DEDICADO de
 * aprobaciones (@yt_content_pipeline_bot). Uso interno: avisos de hito del pipeline /
 * babysitting. El servidor sí alcanza api.telegram.org (lo hace ya para los gates), así
 * que esto evita tener que llamar a la API de Telegram desde el shell.
 *
 * Body: { text: string (HTML simple, sin < > & crudos), imagePath?: string }
 *   - imagePath presente → manda la imagen como foto con `text` de caption.
 */
export async function POST(req: NextRequest) {
  let body: { text?: string; imagePath?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 });
  }
  const text = (body.text ?? '').trim();
  if (!text) {
    return NextResponse.json({ ok: false, error: 'text requerido' }, { status: 400 });
  }
  try {
    if (body.imagePath) {
      const res = await sendInlinePhoto({ imagePath: body.imagePath, caption: text, buttons: [] });
      return NextResponse.json({ ok: res.ok, messageId: res.messageId, error: res.error });
    }
    const res = await sendApprovalsNotice(text);
    return NextResponse.json({ ok: res.ok, error: res.error });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
