import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createAndSendRequest } from '@/lib/approvals';
import { getChannel } from '@/lib/channels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function fmtSlot(daysFromNow: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return `${DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} · ${String(hour).padStart(2, '0')}:00`;
}

/** Primera carpeta real de producción del canal (para que el gate de prueba tenga
 *  un videoFolder válido en disco). */
function firstProductionFolder(slug: string): string | null {
  const ch = getChannel(slug);
  if (!ch?.rootPath || !ch.stateFolders?.production) return null;
  const base = path.join(ch.rootPath, ch.stateFolders.production);
  try {
    for (const name of readdirSync(base)) {
      if (ch.ignoreFolders?.includes(name)) continue;
      const f = path.join(base, name);
      if (statSync(f).isDirectory()) return f.replace(/\\/g, '/');
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * POST /api/telegram/test-gate — manda gates de PRUEBA a Telegram para que Pablo
 * vea cómo se verán los mensajes reales. Body: { kind?: 'greenlight'|'schedule'|'both' }.
 * Las respuestas (tap) sólo disparan un job mínimo que confirma — no tocan nada.
 */
export async function POST(req: NextRequest) {
  let body: { kind?: string } = {};
  try {
    body = await req.json();
  } catch {
    // defaults
  }
  const kind = body.kind || 'both';
  const folder = firstProductionFolder('moderni-stoici') || 'H:/YOUTUBE/CANALES ESTOICISMO/MODERNI STOICI/_EN PRODUCCIÓN';
  const sent: string[] = [];
  try {
    if (kind === 'greenlight' || kind === 'both') {
      await createAndSendRequest({
        videoFolder: folder,
        channel: 'moderni-stoici',
        skill: 'sara',
        label: 'Luz verde edición (PRUEBA)',
        question:
          '🚦 PRUEBA — ¿Luz verde para empezar la EDICIÓN de los vídeos? Así EXACTAMENTE te llegará el mensaje real cuando los 6 estén listos para editar.',
        resumePromptOverride: 'PRUEBA (no real). Responde en UNA frase: "OK, recibí tu luz verde = {{CHOICE}}". NO toques ningún archivo.',
        resumeModel: 'sonnet',
        resumeTimeoutMs: 60000,
      });
      sent.push('greenlight');
    }
    if (kind === 'schedule' || kind === 'both') {
      const slots = [fmtSlot(1, 12), fmtSlot(1, 18), fmtSlot(2, 12), fmtSlot(3, 12), fmtSlot(4, 12)];
      await createAndSendRequest({
        videoFolder: folder,
        channel: 'moderni-stoici',
        skill: 'sara',
        label: 'Fecha publicación (PRUEBA)',
        question:
          '📅 PRUEBA — ¿Cuándo publico este vídeo? Toca un hueco de abajo, o pulsa 📝 y escríbeme la fecha y hora EXACTAS que quieras (ej: "viernes 13 a las 17:30"). Así programaré el contenido a la fecha/hora que me digas.',
        options: slots,
        title: slots[0],
        scheduleGate: true,
        resumePromptOverride:
          'PRUEBA (no real). Responde en UNA frase: "OK, programaría para: {{CHOICE}} {{NOTES}}". NO toques ningún archivo.',
        resumeModel: 'sonnet',
        resumeTimeoutMs: 60000,
      });
      sent.push('schedule');
    }
    return NextResponse.json({ ok: true, sent, folder });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
