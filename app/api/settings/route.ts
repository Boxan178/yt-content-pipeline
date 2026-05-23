import { NextRequest, NextResponse } from 'next/server';
import { readSettings, writeSettings, type AppSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, settings: readSettings() });
}

export async function POST(req: NextRequest) {
  let body: Partial<AppSettings>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const updated = writeSettings(body);
  return NextResponse.json({ ok: true, settings: updated });
}
