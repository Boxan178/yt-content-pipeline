// Tipos y constantes del calendario de contenidos. Browser-safe: SIN imports
// de node:* ni `server-only`, para que lo importen tanto las API routes
// (app/api/calendar) como la página client (app/calendar). Mismo patrón
// browser-safe vs server-only que lib/progress-types.ts ↔ lib/progress.ts.

/** Estado de la subida asociada (espejo de UploadStatus, duplicado aquí porque
 *  lib/upload-schedule.ts es server-only y no se puede importar desde cliente). */
export type CalendarItemStatus = 'pending' | 'uploading' | 'done' | 'failed' | 'cancelled';

/** Estado de un item del PLAN EDITORIAL (content-calendar.json, Fase 2):
 *  'planned' = hueco/idea colocado en una fecha, aún sin programar subida;
 *  'scheduled' = ya convertido en una subida programada (publishAt). */
export type PlannedStatus = 'planned' | 'scheduled';

/** Origen del item del calendario. 'upload' = scheduled-uploads.json (subidas
 *  reales/programadas). 'planned' = content-calendar.json (plan editorial).
 *  'youtube' = horario REAL leído del canal (RSS publicados + API programados),
 *  lib/youtube-schedule.ts. */
export type CalendarItemSource = 'upload' | 'planned' | 'youtube';

export interface CalendarItem {
  id: string;
  /** slug del canal (clave en lib/channels.ts). */
  channel: string;
  channelName: string;
  /** Color de marca (hex) resuelto vía channelColor(). */
  channelColor: string;
  title: string;
  /** ISO 8601 — fecha/hora de publicación efectiva (publishAt ?? scheduledFor)
   *  para uploads, o la fecha planificada para items 'planned'. */
  date: string;
  status: CalendarItemStatus | PlannedStatus;
  source: CalendarItemSource;
  /** true si usa programación NATIVA de YouTube (publishAt): YouTube publica solo
   *  a esa hora sin PC. false = subida local programada o item planificado. */
  nativeSchedule: boolean;
  videoFolder?: string;
  youtubeVideoId?: string;
  /** Solo source 'planned': id del item en content-calendar.json (para mover/borrar). */
  plannedId?: string;
  /** Solo source 'planned': id de la idea vinculada (lib/lab/ideas.ts), si la hay. */
  ideaId?: string;
}

/** Item persistido del plan editorial (content-calendar.json). */
export interface PlannedItem {
  id: string;
  /** slug del canal. */
  channel: string;
  /** ISO 8601 — fecha (y hora opcional) planificada de publicación. */
  date: string;
  title: string;
  /** Idea vinculada (lib/lab/ideas.ts), si se arrastró desde el banco. */
  ideaId?: string;
  /** Carpeta de vídeo vinculada, si se planificó sobre un vídeo existente. */
  videoFolder?: string;
  status: PlannedStatus;
  createdAt: string;
  updatedAt?: string;
}

/** Etiqueta + clases Tailwind por estado (coherente con app/scheduled/page.tsx). */
export const CALENDAR_STATUS_STYLE: Record<CalendarItemStatus | PlannedStatus, { label: string; cls: string }> = {
  planned: { label: 'Planificado', cls: 'bg-white/5 text-zinc-300 border-white/15 border-dashed' },
  scheduled: { label: 'Programado', cls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  pending: { label: 'Pendiente', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  uploading: { label: 'Subiendo', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  done: { label: 'Subido', cls: 'bg-green-500/15 text-green-300 border-green-500/30' },
  failed: { label: 'Fallido', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
  cancelled: { label: 'Cancelado', cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
};

/** Etiquetas de día (lunes→domingo) compartidas entre la rejilla del mes
 *  (MonthGrid) y el editor de cadencia (app/calendar/page.tsx) para que no
 *  discrepen. Single-letter porque los botones de cadencia son de 24×24px. */
export const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Payload que viaja en el dataTransfer del drag-drop del calendario. */
export type CalendarDragPayload =
  | { kind: 'idea'; ideaId: string; title: string; channel: string | null }
  | { kind: 'video'; channel: string; title: string; videoFolder: string }
  | { kind: 'planned'; plannedId: string };

// ── Fase 3: cadencia objetivo por canal + huecos ───────────────────────────

/**
 * Cadencia editorial objetivo de un canal. Browser-safe. Persistida server-side
 * en ~/.yt-content-pipeline/channel-cadence.json (lib/channel-cadence.ts).
 */
export interface ChannelCadence {
  /** slug del canal (clave en lib/channels.ts). */
  channel: string;
  /** Si false, el canal se ignora en la detección de huecos y avisos. */
  enabled: boolean;
  /** Vídeos objetivo por semana. */
  targetPerWeek: number;
  /**
   * Días preferidos de publicación (0=Lun … 6=Dom). Opcional: si está, los
   * huecos se señalan en esos días concretos; si no, solo se reporta el déficit
   * semanal. Longitud típica === targetPerWeek, pero no se fuerza.
   */
  preferredWeekdays?: number[];
  /** Hora local sugerida de publicación (0-23). Default 12. Se usa cuando no hay
   *  `slots` (compatibilidad: 1 publicación/día). */
  hour?: number;
  /**
   * Franjas locales de publicación del día, en "HH:MM" (ej. ["10:00","17:30"]).
   * Si tiene ≥2 entradas → ese canal publica VARIAS veces al día (una por franja).
   * Tiene prioridad sobre `hour`. Permite cadencias tipo 2/día.
   */
  slots?: string[];
}

/**
 * Franjas horarias de publicación de un canal, normalizadas y ordenadas.
 * Prioriza `slots` ("HH:MM"); cae a `hour` (1 franja); si no hay nada devuelve [].
 * Browser-safe (lógica pura). El caller decide el default si vuelve vacío.
 */
export function cadenceSlots(cad: Pick<ChannelCadence, 'hour' | 'slots'>): Array<{ h: number; m: number }> {
  if (Array.isArray(cad.slots) && cad.slots.length) {
    const seen = new Set<string>();
    const out: Array<{ h: number; m: number }> = [];
    for (const raw of cad.slots) {
      const mm = String(raw).match(/^\s*(\d{1,2}):(\d{2})\s*$/);
      if (!mm) continue;
      const h = Math.max(0, Math.min(23, Number(mm[1])));
      const m = Math.max(0, Math.min(59, Number(mm[2])));
      const key = `${h}:${m}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ h, m });
    }
    out.sort((a, b) => a.h - b.h || a.m - b.m);
    if (out.length) return out;
  }
  if (cad.hour != null) return [{ h: Math.max(0, Math.min(23, Math.round(cad.hour))), m: 0 }];
  return [];
}

/** Un día concreto donde la cadencia pide contenido y no hay nada planificado. */
export interface CalendarGapDay {
  /** ISO 8601 (fecha + hora preferida) del hueco. */
  date: string;
  channel: string;
  channelName: string;
  channelColor: string;
}

/** Resumen de déficit de una semana para un canal. */
export interface CalendarGapWeek {
  channel: string;
  channelName: string;
  channelColor: string;
  /** ISO del lunes de la semana (00:00 local). */
  weekStart: string;
  target: number;
  /** Items (subidas + planificados) ya colocados esa semana. */
  scheduled: number;
  /** max(0, target - scheduled). */
  missing: number;
  /** Días concretos sugeridos para los huecos (si hay preferredWeekdays). */
  gapDays: CalendarGapDay[];
}
