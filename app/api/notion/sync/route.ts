import { NextRequest, NextResponse } from 'next/server';
import { tick } from '@/lib/notion-poller';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/notion/sync?force=1
 * Dispara un tick del poller. `force=1` ignora el toggle disabled y el
 * backoff exponencial (usado por el botón "Sync ahora" del UI). Sin force,
 * lo lanza solo si está enabled — pensado para el setInterval de Electron.
 */
export async function POST(req: NextRequest) {
  const force = new URL(req.url).searchParams.get('force') === '1';
  try {
    const result = await tick({ force });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
