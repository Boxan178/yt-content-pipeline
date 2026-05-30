import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'node:fs';
import { normalizeAllowedPath } from '@/lib/config';
import { startVerify, readVerify, type VerifyMode } from '@/lib/verify-locucion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/verify-locucion
 * Body: { folder, mode?: 'quick' | 'full' }
 * Arranca la verificación de la locución (duración + opcionalmente Whisper).
 */
export async function POST(req: NextRequest) {
  let body: { folder?: string; mode?: VerifyMode };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const folder = normalizeAllowedPath(body.folder ?? '');
  if (!folder) {
    return NextResponse.json({ ok: false, error: 'folder inválido o fuera de los prefijos permitidos' }, { status: 400 });
  }
  if (!existsSync(folder)) {
    return NextResponse.json({ ok: false, error: 'La carpeta no existe' }, { status: 404 });
  }

  const mode: VerifyMode = body.mode === 'quick' ? 'quick' : 'full';
  try {
    const meta = startVerify(folder, mode);
    return NextResponse.json({ ok: true, meta });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/**
 * GET /api/verify-locucion?folder=...
 * Devuelve el estado actual de la verificación.
 */
export async function GET(req: NextRequest) {
  const folder = normalizeAllowedPath(req.nextUrl.searchParams.get('folder'));
  if (!folder) {
    return NextResponse.json({ ok: false, error: 'folder inválido' }, { status: 400 });
  }
  const state = readVerify(folder);
  return NextResponse.json({ ok: true, state });
}
