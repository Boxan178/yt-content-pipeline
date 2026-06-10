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
import { getOccupiedYouTubeDates } from './youtube-schedule';
import { cadenceSlots, type CalendarGapWeek, type CalendarGapDay, type ChannelCadence } from './calendar-types';

/** Franjas del canal con fallback al default histórico (19:30, USA prime). */
function slotsFor(cad: Pick<ChannelCadence, 'hour' | 'slots'> | null): Array<{ h: number; m: number }> {
  const s = cad ? cadenceSlots(cad) : [];
  return s.length ? s : [{ h: 19, m: 30 }];
}

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
  // Horario REAL del canal de YouTube (RSS publicados + API programados privados).
  // Es la fuente que arregla los huecos "falsos": un día con vídeo ya publicado o
  // programado nativamente en YouTube (fuera de la app) deja de contar como hueco.
  for (const [channel, dates] of getOccupiedYouTubeDates()) {
    const arr = map.get(channel) ?? [];
    for (const d of dates) arr.push(d);
    map.set(channel, arr);
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
  // Ocupación a nivel (día, HORA): así un canal con 2 franjas/día (p.ej. 10:00 y
  // 17:30) puede colocar DOS vídeos el mismo día sin pisarse. Antes la ocupación
  // era por día → solo cabía 1/día aunque la cadencia pidiera 2.
  const occByDay = new Map<string, Set<number>>();
  for (const d of occupiedDatesByChannel().get(channel) ?? []) {
    const k = ymdLocal(d);
    const set = occByDay.get(k) ?? new Set<number>();
    set.add(d.getHours());
    occByDay.set(k, set);
  }
  const slots = slotsFor(getCadence(channel));
  const fmt = (d: Date, s: { h: number; m: number }) =>
    `${ymdLocal(d)}T${String(s.h).padStart(2, '0')}:${String(s.m).padStart(2, '0')}:00`;
  const today = new Date();
  let d = addDays(new Date(today.getFullYear(), today.getMonth(), today.getDate()), 1); // mañana
  for (let i = 0; i < 400; i++) {
    const taken = occByDay.get(ymdLocal(d));
    for (const s of slots) {
      if (!taken || !taken.has(s.h)) return fmt(d, s);
    }
    d = addDays(d, 1);
  }
  return fmt(d, slots[0]);
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
        const slots = slotsFor(cad);
        for (const wd of cad.preferredWeekdays) {
          if (gapDays.length >= missing) break;
          const day = addDays(ws, wd); // wd: 0=Lun
          if (day < today0) continue; // día en el pasado: no accionable
          for (const s of slots) {
            if (gapDays.length >= missing) break;
            // ¿Ya hay algo ese día a esa franja (misma hora)?
            const taken = inWeek.some(
              (d) =>
                d.getFullYear() === day.getFullYear() &&
                d.getMonth() === day.getMonth() &&
                d.getDate() === day.getDate() &&
                d.getHours() === s.h,
            );
            if (taken) continue;
            const dd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), s.h, s.m, 0);
            if (dd < now) continue; // franja de hoy ya pasada: no accionable
            gapDays.push({ date: dd.toISOString(), channel: cad.channel, channelName, channelColor: color });
          }
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
