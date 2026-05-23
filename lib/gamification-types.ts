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

// ── Títulos según nivel — basados en la jerarquía formal del Jedi Order
// (Wookieepedia, canon Disney + Legends). Bloque A puro (7 rangos canónicos)
// + intercalado con un sub-rango Sentinel a mitad de Knight para tener 8
// escalones distribuidos. NO se inventa nada — todos son nombres canónicos.
// Más info: lib/gamification-types.ts → JEDI_RANKS_REFERENCE.

export interface JediRank {
  minLevel: number;
  /** Título mostrado en UI (es). */
  title: string;
  /** Nombre original en inglés. */
  titleEn: string;
  /** Descripción breve canon-correct para tooltip / vista perfil. */
  description: string;
}

const TITLES: JediRank[] = [
  {
    minLevel: 1,
    title: 'Iniciado',
    titleEn: 'Jedi Initiate',
    description: 'Force-sensible recién llegado al Templo. Vives en un clan de younglings, aprendiendo los fundamentos. Espera la Reunión en Ilum para conseguir tu cristal kyber.',
  },
  {
    minLevel: 2,
    title: 'Padawan',
    titleEn: 'Padawan',
    description: 'Has superado los Initiate Trials y un Caballero o Maestro te ha tomado como aprendiz. Llevas la trenza Padawan. Empiezas a acompañar misiones reales.',
  },
  {
    minLevel: 4,
    title: 'Caballero Jedi',
    titleEn: 'Jedi Knight',
    description: 'Has superado los Jedi Trials (Skill, Courage, Flesh, Spirit, Insight). Tu trenza Padawan se corta. La mayoría de Jedi permanecen Knight toda su vida.',
  },
  {
    minLevel: 7,
    title: 'Centinela Jedi',
    titleEn: 'Jedi Sentinel',
    description: 'Knight especializado en el equilibrio: combate moderado + habilidades no-Force (sigilo, investigación, demolición). Eres la rama versátil de la Orden.',
  },
  {
    minLevel: 10,
    title: 'Maestro Jedi',
    titleEn: 'Jedi Master',
    description: 'Has entrenado a un Padawan hasta Knighthood. Reconocimiento formal de tu dominio de la Fuerza. Prerequisito para entrar en cualquiera de los cuatro Consejos.',
  },
  {
    minLevel: 14,
    title: 'Miembro del Consejo',
    titleEn: 'Council Member',
    description: 'Has sido elegido para uno de los cuatro Consejos. El Alto Consejo (12 miembros) es el órgano supremo. Tu voto guía a la Orden entera.',
  },
  {
    minLevel: 18,
    title: 'Maestro de la Orden',
    titleEn: 'Master of the Order',
    description: 'Presides las reuniones del Alto Consejo y gestionas la administración del Templo. Eres la voz de la Orden ante el Senado. Mace Windu ostentaba este cargo durante las Guerras Clon.',
  },
  {
    minLevel: 22,
    title: 'Gran Maestro Jedi',
    titleEn: 'Grand Jedi Master',
    description: 'Cabeza espiritual de toda la Orden. Marcas la dirección general y supervisas a los younglings cerrando el círculo del entrenamiento. Yoda en las precuelas, Luke post-RotJ.',
  },
];

export function titleForLevel(level: number): string {
  let title = TITLES[0].title;
  for (const t of TITLES) {
    if (level >= t.minLevel) title = t.title;
  }
  return title;
}

/**
 * Devuelve el rank entero (título + en + descripción) correspondiente al nivel
 * actual + el siguiente rank (para mostrar "siguiente nivel desbloquea …").
 */
export function rankInfoForLevel(level: number): { current: JediRank; next: JediRank | null } {
  let current = TITLES[0];
  let next: JediRank | null = null;
  for (let i = 0; i < TITLES.length; i++) {
    if (level >= TITLES[i].minLevel) {
      current = TITLES[i];
      next = TITLES[i + 1] ?? null;
    }
  }
  return { current, next };
}

/** Lista entera de rangos para mostrar en vista perfil. */
export const JEDI_RANKS = TITLES;

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
