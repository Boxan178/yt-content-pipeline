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
  /** Hora local sugerida de publicación (0-23). Default 12. */
  hour?: number;
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
