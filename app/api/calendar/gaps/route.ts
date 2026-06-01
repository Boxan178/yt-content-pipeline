import { NextRequest, NextResponse } from 'next/server';
import { computeGaps } from '@/lib/calendar-gaps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/calendar/gaps?weeks=N — déficit de cadencia por canal/semana para las
 * próximas N semanas (default 4, máx 12). Solo lectura.
 */
export async function GET(req: NextRequest) {
  const weeksParam = Number(req.nextUrl.searchParams.get('weeks'));
  const weeks = Number.isFinite(weeksParam) && weeksParam > 0 ? Math.min(12, Math.round(weeksParam)) : 4;
  const gaps = computeGaps(weeks);
  return NextResponse.json({ ok: true, weeks, gaps });
}
