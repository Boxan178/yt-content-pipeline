// Detección de HUECOS editoriales (Fase 3). Server-only. Cruza la cadencia
// objetivo por canal (lib/channel-cadence.ts) con lo que ya está en el
// calendario (subidas reales de scheduled-uploads.json + plan editorial de
// content-calendar.json) y devuelve, semana a semana, cuánto falta para cumplir
// la cadencia y en qué días concretos.
//
// Es solo lectura/cálculo: no produce ni programa nada.

import 'server-only';
import { readSchedule } from './upload-schedule';
import { readContentCalendar } from './content-calendar';
import { readCadence } from './channel-cadence';
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
  for (const u of readSchedule().items) {
    // Las canceladas/fallidas no cuentan como "cubierto".
    if (u.status === 'cancelled' || u.status === 'failed') continue;
    push(u.channel, u.publishAt ?? u.scheduledFor);
  }
  for (const p of readContentCalendar().items) push(p.channel, p.date);
  return map;
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
