// Detección de HUECOS editoriales (Fase 3). Server-only. Cruza la cadencia
// objetivo por canal (lib/channel-cadence.ts) con lo que ya está en el
// calendario (subidas reales de scheduled-uploads.json + plan editorial de
// content-calendar.json) y devuelve, semana a semana, cuánto falta para cumplir
// la cadencia y en qué días concretos.
//
// Es solo lectura/cálculo: no produce ni programa nada.

import 'server-only';
import { readSchedule } from './upload-schedule';
import { readContentCalendar, addPlanned, updatePlanned } from './content-calendar';
import { readCadence, getCadence } from './channel-cadence';
import { getChannel, channelColor } from './channels';
import type { CalendarGapWeek, CalendarGapDay } from './calendar-types';

/** Lunes 00:00 local de la semana que contiene `d`. */
function weekStart(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (r.getDay() + 6) % 7; // domingo=0 → 6, lunes=1 → 0
  r.setDate(r.getDate() - offset);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Todas las fechas (ISO) ocupadas por canal: subidas + planificados. */
function occupiedDatesByChannel(): Map<string, Date[]> {
  const map = new Map<string, Date[]>();
  const push = (channel: string, iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return;
    const arr = map.get(channel) ?? [];
    arr.push(d);
    map.set(channel, arr);
  };
  const schedule = readSchedule().items;
  for (const u of schedule) {
    // Las canceladas/fallidas no cuentan como "cubierto".
    if (u.status === 'cancelled' || u.status === 'failed') continue;
    push(u.channel, u.publishAt ?? u.scheduledFor);
  }
  // Dedup planificado↔subida (misma lógica que GET /api/calendar): un item del
  // plan editorial que YA es una subida real (misma carpeta) NO debe contar otra
  // vez — si no, infla `scheduled` y oculta huecos reales que sí hay que cubrir.
  const baseOf = (f?: string) =>
    (f || '').replace(/\\/g, '/').split('/').filter(Boolean).pop()?.normalize('NFC') ?? '';
  const uploadFolderBases = new Set(schedule.map((u) => baseOf(u.videoFolder)).filter(Boolean));
  for (const p of readContentCalendar().items) {
    if (p.videoFolder && uploadFolderBases.has(baseOf(p.videoFolder))) continue;
    push(p.channel, p.date);
  }
  return map;
}

/** 'YYYY-MM-DD' local de una fecha. */
function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** basename normalizado de una carpeta (dedupe plan↔vídeo). */
function folderBase(f?: string): string {
  return (f || '').replace(/\\/g, '/').split('/').filter(Boolean).pop()?.normalize('NFC') ?? '';
}

/**
 * Próximo hueco libre 1/día para un canal: el primer día FUTURO (desde mañana)
 * sin nada ocupado (subida real o planificado). Devuelve ISO local
 * 'YYYY-MM-DDTHH:MM:00'. Base de "programar desde la idea": cada idea recibe el
 * hueco más cercano libre, llenando del más próximo al más lejano.
 */
export function nextFreeSlotForChannel(channel: string): string {
  const occupied = new Set((occupiedDatesByChannel().get(channel) ?? []).map(ymdLocal));
  const cad = getCadence(channel);
  const hh = cad?.hour != null ? String(Math.max(0, Math.min(23, cad.hour))).padStart(2, '0') : '19';
  const mm = cad?.hour != null ? '00' : '30'; // sin cadencia → 19:30 por defecto (tarde, público USA)
  const today = new Date();
  let d = addDays(new Date(today.getFullYear(), today.getMonth(), today.getDate()), 1); // mañana
  for (let i = 0; i < 400; i++) {
    if (!occupied.has(ymdLocal(d))) return `${ymdLocal(d)}T${hh}:${mm}:00`;
    d = addDays(d, 1);
  }
  return `${ymdLocal(d)}T${hh}:${mm}:00`;
}

export interface EnsureSlotInput {
  channel: string;
  title: string;
  ideaId?: string;
  videoFolder?: string;
}

/**
 * Garantiza que un vídeo/idea tiene hueco de publicación en el calendario.
 * Idempotente: si ya hay un planificado para esa idea o carpeta, lo enlaza y
 * marca 'scheduled' (no duplica). Si no, crea uno en el próximo hueco libre.
 * Núcleo de "programar desde la idea": se llama al arrancar el pipeline.
 */
export function ensurePlannedSlot(input: EnsureSlotInput): { date: string; planId: string; created: boolean } {
  const items = readContentCalendar().items;
  const existing = items.find(
    (p) =>
      (input.ideaId && p.ideaId === input.ideaId) ||
      (input.videoFolder && folderBase(p.videoFolder) === folderBase(input.videoFolder)),
  );
  if (existing) {
    updatePlanned(existing.id, {
      status: 'scheduled',
      videoFolder: input.videoFolder ?? existing.videoFolder,
    });
    return { date: existing.date, planId: existing.id, created: false };
  }
  const date = nextFreeSlotForChannel(input.channel);
  const p = addPlanned({
    channel: input.channel,
    date,
    title: input.title,
    ideaId: input.ideaId,
    videoFolder: input.videoFolder,
    status: 'scheduled',
  });
  return { date, planId: p.id, created: true };
}

/**
 * Calcula los huecos para las próximas `weeks` semanas (incluida la actual).
 * Solo canales con cadencia `enabled` y `targetPerWeek > 0`. Los días-hueco
 * concretos solo se emiten para canales con `preferredWeekdays` y solo si caen
 * en el futuro (no tiene sentido sugerir producir para un día ya pasado).
 */
export function computeGaps(weeks = 4): CalendarGapWeek[] {
  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const firstMonday = weekStart(now);
  const occupied = occupiedDatesByChannel();
  const cadences = readCadence().items.filter((c) => c.enabled && c.targetPerWeek > 0);

  const result: CalendarGapWeek[] = [];
  for (const cad of cadences) {
    const ch = getChannel(cad.channel);
    if (!ch || !ch.enabled) continue;
    const channelName = ch.name;
    const color = channelColor(cad.channel);
    const dates = occupied.get(cad.channel) ?? [];

    for (let w = 0; w < weeks; w++) {
      const ws = addDays(firstMonday, w * 7);
      const we = addDays(ws, 7);
      const inWeek = dates.filter((d) => d >= ws && d < we);
      const scheduled = inWeek.length;
      const missing = Math.max(0, cad.targetPerWeek - scheduled);

      const gapDays: CalendarGapDay[] = [];
      if (missing > 0 && cad.preferredWeekdays?.length) {
        const hour = cad.hour ?? 12;
        for (const wd of cad.preferredWeekdays) {
          if (gapDays.length >= missing) break;
          const day = addDays(ws, wd); // wd: 0=Lun
          if (day < today0) continue; // hueco en el pasado: no accionable
          // ¿Ya hay algo ese día concreto?
          const taken = inWeek.some(
            (d) => d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate(),
          );
          if (taken) continue;
          const dd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0);
          gapDays.push({ date: dd.toISOString(), channel: cad.channel, channelName, channelColor: color });
        }
      }

      result.push({
        channel: cad.channel,
        channelName,
        channelColor: color,
        weekStart: ws.toISOString(),
        target: cad.targetPerWeek,
        scheduled,
        missing,
        gapDays,
      });
    }
  }
  return result;
}

/** Solo las semanas con déficit (para avisos y para el panel "Próximos huecos"). */
export function computeGapsWithDeficit(weeks = 4): CalendarGapWeek[] {
  return computeGaps(weeks).filter((g) => g.missing > 0);
}
