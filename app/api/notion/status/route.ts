import { NextResponse } from 'next/server';
import { getConfigInfo } from '@/lib/notion-poller';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, ...getConfigInfo() });
}
