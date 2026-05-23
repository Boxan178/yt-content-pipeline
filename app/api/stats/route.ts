import { NextResponse } from 'next/server';
import { readStats } from '@/lib/gamification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/stats
 * Devuelve el estado actual de gamificación (XP, nivel, racha, logros, eventos).
 */
export async function GET() {
  const stats = readStats();
  return NextResponse.json({ ok: true, stats });
}
