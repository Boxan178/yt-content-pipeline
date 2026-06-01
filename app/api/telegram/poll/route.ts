import { NextResponse } from 'next/server';
import { runTelegramPoll } from '@/lib/approvals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/telegram/poll
 *
 * Un tick del listener de aprobaciones por Telegram:
 *  1. getUpdates → enruta los taps de botón (✅/❌/📝) y la captura de notas a la
 *     solicitud pendiente correspondiente; resuelve packaging.md y RE-LANZA el job.
 *  2. (throttled) escanea packaging.md buscando decisiones nuevas que mandar.
 *
 * Idempotente (mutex interno). Lo invoca el poller en background de Electron
 * (startTelegramPoller) cada ~3s. Devuelve `conflict:true` si otro consumidor usa
 * getUpdates sobre el mismo bot (señal de migrar a token dedicado).
 */
export async function POST() {
  const res = await runTelegramPoll();
  if (!res.ok) {
    return NextResponse.json(res, { status: res.conflict ? 409 : 500 });
  }
  return NextResponse.json(res);
}
