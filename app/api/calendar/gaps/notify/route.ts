import { NextResponse } from 'next/server';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computeGapsWithDeficit } from '@/lib/calendar-gaps';
import { notifyContentGaps } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Dedupe persistente: misma "firma" de huecos no se re-avisa hasta pasadas
// MIN_GAP_MS. Evita spamear si el poller pega cada pocos minutos. El kill-switch
// YTCP_GAP_NOTIFY_ENABLED=0 desactiva el aviso por completo.
const STATE_DIR = path.join(os.homedir(), '.yt-content-pipeline');
const STATE_FILE = path.join(STATE_DIR, 'gap-notify-state.json');
const MIN_GAP_MS = 20 * 60 * 60 * 1000; // 20h: como mucho un aviso al día

interface NotifyState {
  signature: string;
  notifiedAt: string;
}

function readState(): NotifyState | null {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as NotifyState;
  } catch {
    return null;
  }
}

function writeState(s: NotifyState): void {
  try {
    if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(s, null, 2), 'utf-8');
  } catch {}
}

function fmtWeek(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'esta semana';
  return `semana del ${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
}

/**
 * POST /api/calendar/gaps/notify — si hay déficit de cadencia en la ventana
 * próxima, avisa a Pablo (Telegram + push). Idempotente y con dedupe diario por
 * firma. Lo dispara el poller de Electron y se puede llamar a mano.
 */
export async function POST() {
  if (process.env.YTCP_GAP_NOTIFY_ENABLED === '0') {
    return NextResponse.json({ ok: true, skipped: 'kill-switch' });
  }
  // Solo miramos la ventana inmediata (2 semanas) para los avisos: lo urgente.
  const deficits = computeGapsWithDeficit(2);
  if (!deficits.length) {
    return NextResponse.json({ ok: true, deficits: 0, notified: false });
  }

  // Firma: canal+semana+missing. Si no cambió y el último aviso es reciente, no
  // re-avisamos.
  const signature = deficits
    .map((g) => `${g.channel}@${g.weekStart.slice(0, 10)}:${g.missing}`)
    .sort()
    .join('|');
  const prev = readState();
  const now = Date.now();
  if (prev && prev.signature === signature && now - new Date(prev.notifiedAt).getTime() < MIN_GAP_MS) {
    return NextResponse.json({ ok: true, deficits: deficits.length, notified: false, reason: 'dedupe' });
  }

  const lines = deficits.map((g) => ({
    channelName: g.channelName,
    missing: g.missing,
    weekLabel: fmtWeek(g.weekStart),
  }));
  const res = await notifyContentGaps(lines);
  writeState({ signature, notifiedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true, deficits: deficits.length, notified: true, channels: res });
}
