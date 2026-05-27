import { NextRequest, NextResponse } from 'next/server';
import { readState, setEnabled } from '@/lib/notion-poller';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ConfigBody {
  enabled?: boolean;
}

export async function GET() {
  return NextResponse.json({ ok: true, state: readState() });
}

/**
 * POST /api/notion/config
 * Body: { enabled?: boolean }
 * Persiste el toggle del poller. Al pasar de false→true se resetea el
 * backoff exponencial para que el siguiente tick corra sin esperar.
 */
export async function POST(req: NextRequest) {
  let body: ConfigBody;
  try {
    body = (await req.json()) as ConfigBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ ok: false, error: 'missing "enabled" boolean' }, { status: 400 });
  }
  const state = setEnabled(body.enabled);
  return NextResponse.json({ ok: true, state });
}
