// Tipos puros browser-safe para el sistema de gamificación.
// El módulo server-only (lib/gamification.ts) los reusa.

export type XPEventKind =
  | 'job_done'
  | 'job_approved'
  | 'job_rejected'
  | 'video_uploaded'      // movido a _SUBIDOS
  | 'video_ready'         // movido a _LISTOS
  | 'thumbnail_added'     // nueva miniatura final
  | 'checklist_resolved'  // item del checklist marcado
  | 'streak_day';         // bonus diario por mantener racha

export interface XPEvent {
  kind: XPEventKind;
  /** XP otorgado por este evento. */
  xp: number;
  /** Timestamp ISO. */
  at: string;
  /** Contexto humano (skill, vídeo, canal). */
  label?: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  /** XP bonus al desbloquearlo. */
  xpReward: number;
  /** Icono emoji. */
  icon: string;
}

export interface UnlockedAchievement {
  id: string;
  at: string;
}

export interface StreakState {
  /** Días consecutivos con al menos un evento. */
  current: number;
  /** Récord histórico. */
  longest: number;
  /** Último día con evento, formato YYYY-MM-DD. */
  lastDay: string | null;
}

export interface Counters {
  jobs_done: number;
  jobs_approved: number;
  jobs_rejected: number;
  videos_uploaded: number;
  videos_ready: number;
  thumbnails_added: number;
  checklist_resolved: number;
}

export interface Stats {
  version: 1;
  xp: number;
  level: number;
  createdAt: string;
  updatedAt: string;
  /** Últimos N eventos (cap 200). */
  events: XPEvent[];
  /** IDs de logros desbloqueados con timestamp. */
  achievements: UnlockedAchievement[];
  streak: StreakState;
  counters: Counters;
}

// ── XP / nivel — fórmula y helpers ────────────────────────────────────

/**
 * XP necesaria para llegar al nivel L (acumulada desde 0).
 * Curva tipo videojuego: `100 * L^1.5`. Level 1=100, L5=1118, L10=3162, L20=8944.
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(100 * Math.pow(level - 1, 1.5));
}

/**
 * Dado un total de XP acumulado, calcula nivel actual y progreso al siguiente.
 */
export function deriveLevel(xp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  intoLevel: number;
  needed: number;
  percent: number;
} {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const intoLevel = xp - currentLevelXp;
  const needed = nextLevelXp - currentLevelXp;
  const percent = needed > 0 ? Math.min(100, Math.floor((intoLevel / needed) * 100)) : 100;
  return { level, currentLevelXp, nextLevelXp, intoLevel, needed, percent };
}

// ── XP por evento (tabla fija) ────────────────────────────────────────

export const XP_BY_EVENT: Record<XPEventKind, number> = {
  job_done: 10,
  job_approved: 25,
  job_rejected: 0, // no penaliza, simplemente no premia
  video_uploaded: 200,
  video_ready: 80,
  thumbnail_added: 50,
  checklist_resolved: 5,
  streak_day: 20,
};

// ── Catálogo de logros ────────────────────────────────────────────────

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_step',
    title: 'Primer paso',
    description: 'Ejecutaste tu primer job de skill.',
    xpReward: 25,
    icon: '🌱',
  },
  {
    id: 'first_approval',
    title: 'Visto bueno',
    description: 'Aprobaste tu primer resultado de skill.',
    xpReward: 50,
    icon: '✅',
  },
  {
    id: 'ten_jobs',
    title: 'En racha de trabajo',
    description: '10 jobs completados en total.',
    xpReward: 100,
    icon: '⚙️',
  },
  {
    id: 'fifty_jobs',
    title: 'Maquinero',
    description: '50 jobs completados.',
    xpReward: 250,
    icon: '🛠️',
  },
  {
    id: 'first_video_uploaded',
    title: 'Subido a YouTube',
    description: 'Tu primer vídeo movido a _SUBIDOS.',
    xpReward: 100,
    icon: '📤',
  },
  {
    id: 'ten_videos_uploaded',
    title: 'Productor',
    description: '10 vídeos publicados.',
    xpReward: 500,
    icon: '🎬',
  },
  {
    id: 'streak_3',
    title: 'Trabajador constante',
    description: 'Racha de 3 días seguidos.',
    xpReward: 75,
    icon: '🔥',
  },
  {
    id: 'streak_7',
    title: 'Una semana entera',
    description: 'Racha de 7 días seguidos.',
    xpReward: 200,
    icon: '🔥',
  },
  {
    id: 'streak_30',
    title: 'Estoico de verdad',
    description: 'Racha de 30 días seguidos.',
    xpReward: 1000,
    icon: '🏛️',
  },
  {
    id: 'level_5',
    title: 'Aprendiz',
    description: 'Alcanzaste nivel 5.',
    xpReward: 50,
    icon: '⭐',
  },
  {
    id: 'level_10',
    title: 'Discípulo de Marco Aurelio',
    description: 'Alcanzaste nivel 10.',
    xpReward: 200,
    icon: '👑',
  },
  {
    id: 'level_20',
    title: 'Director',
    description: 'Alcanzaste nivel 20.',
    xpReward: 500,
    icon: '🎖️',
  },
];

// ── Títulos según nivel ───────────────────────────────────────────────

const TITLES: Array<{ minLevel: number; title: string }> = [
  { minLevel: 1, title: 'Aprendiz estoico' },
  { minLevel: 3, title: 'Pasante' },
  { minLevel: 5, title: 'Productor' },
  { minLevel: 8, title: 'Editor' },
  { minLevel: 12, title: 'Director' },
  { minLevel: 16, title: 'Maestro' },
  { minLevel: 20, title: 'Marco Aurelio' },
];

export function titleForLevel(level: number): string {
  let title = TITLES[0].title;
  for (const t of TITLES) {
    if (level >= t.minLevel) title = t.title;
  }
  return title;
}

// ── Stats vacío (defaults) ────────────────────────────────────────────

export function emptyStats(): Stats {
  const now = new Date().toISOString();
  return {
    version: 1,
    xp: 0,
    level: 1,
    createdAt: now,
    updatedAt: now,
    events: [],
    achievements: [],
    streak: { current: 0, longest: 0, lastDay: null },
    counters: {
      jobs_done: 0,
      jobs_approved: 0,
      jobs_rejected: 0,
      videos_uploaded: 0,
      videos_ready: 0,
      thumbnails_added: 0,
      checklist_resolved: 0,
    },
  };
}
