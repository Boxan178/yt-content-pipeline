// Persistencia de gamificación. Single-user PC → JSON en ~/.yt-content-pipeline/stats.json.
// Server-only (toca node:fs). Browser consume via /api/stats.

import 'server-only';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ACHIEVEMENTS,
  XP_BY_EVENT,
  deriveLevel,
  emptyStats,
  type Stats,
  type XPEventKind,
  type Achievement,
} from './gamification-types';

const STATS_DIR = path.join(os.homedir(), '.yt-content-pipeline');
const STATS_PATH = path.join(STATS_DIR, 'stats.json');
const MAX_EVENTS_KEPT = 200;

function ensureDir() {
  if (!existsSync(STATS_DIR)) mkdirSync(STATS_DIR, { recursive: true });
}

export function readStats(): Stats {
  try {
    ensureDir();
    if (!existsSync(STATS_PATH)) return emptyStats();
    const raw = readFileSync(STATS_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Stats;
    if (!parsed || parsed.version !== 1) return emptyStats();
    return parsed;
  } catch {
    return emptyStats();
  }
}

function saveStats(stats: Stats) {
  ensureDir();
  stats.updatedAt = new Date().toISOString();
  writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2), 'utf-8');
}

function todayYMD(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ams = Date.UTC(ay, am - 1, ad);
  const bms = Date.UTC(by, bm - 1, bd);
  return Math.round((ams - bms) / (24 * 60 * 60 * 1000));
}

function bumpStreak(stats: Stats): { brokeStreak: boolean; gainedStreakDay: boolean } {
  const today = todayYMD();
  if (stats.streak.lastDay === today) {
    return { brokeStreak: false, gainedStreakDay: false }; // ya contado hoy
  }
  if (stats.streak.lastDay === null) {
    stats.streak.current = 1;
    stats.streak.longest = Math.max(stats.streak.longest, 1);
    stats.streak.lastDay = today;
    return { brokeStreak: false, gainedStreakDay: true };
  }
  const diff = dayDiff(today, stats.streak.lastDay);
  if (diff === 1) {
    stats.streak.current += 1;
    stats.streak.longest = Math.max(stats.streak.longest, stats.streak.current);
    stats.streak.lastDay = today;
    return { brokeStreak: false, gainedStreakDay: true };
  }
  // Se perdió racha
  stats.streak.current = 1;
  stats.streak.lastDay = today;
  return { brokeStreak: true, gainedStreakDay: true };
}

function bumpCounters(stats: Stats, kind: XPEventKind) {
  const k = kind as keyof Stats['counters'];
  if (k in stats.counters) {
    stats.counters[k]++;
  }
}

/**
 * Comprueba todos los logros y desbloquea los que apliquen ahora. Devuelve los
 * recién desbloqueados (para mostrar notif al usuario).
 */
function checkAchievements(stats: Stats): Achievement[] {
  const unlocked = new Set(stats.achievements.map((a) => a.id));
  const justUnlocked: Achievement[] = [];
  for (const ach of ACHIEVEMENTS) {
    if (unlocked.has(ach.id)) continue;
    if (qualifies(ach.id, stats)) {
      stats.achievements.push({ id: ach.id, at: new Date().toISOString() });
      stats.xp += ach.xpReward;
      justUnlocked.push(ach);
    }
  }
  return justUnlocked;
}

function qualifies(achId: string, stats: Stats): boolean {
  switch (achId) {
    case 'first_step':
      return stats.counters.jobs_done >= 1;
    case 'first_approval':
      return stats.counters.jobs_approved >= 1;
    case 'ten_jobs':
      return stats.counters.jobs_done >= 10;
    case 'fifty_jobs':
      return stats.counters.jobs_done >= 50;
    case 'first_video_uploaded':
      return stats.counters.videos_uploaded >= 1;
    case 'ten_videos_uploaded':
      return stats.counters.videos_uploaded >= 10;
    case 'streak_3':
      return stats.streak.current >= 3;
    case 'streak_7':
      return stats.streak.current >= 7;
    case 'streak_30':
      return stats.streak.current >= 30;
    case 'level_5':
      return stats.level >= 5;
    case 'level_10':
      return stats.level >= 10;
    case 'level_20':
      return stats.level >= 20;
    default:
      return false;
  }
}

export interface AwardResult {
  stats: Stats;
  xpGained: number;
  leveledUp: boolean;
  oldLevel: number;
  newLevel: number;
  achievementsUnlocked: Achievement[];
  streakUpdated: boolean;
}

/**
 * Procesa un evento de gamificación. Idempotente NO — cada llamada otorga XP.
 * El caller es responsable de no dispararlo dos veces (por ejemplo, marcar el
 * job con un flag tras el primer reporte).
 */
export function recordEvent(kind: XPEventKind, label?: string): AwardResult {
  const stats = readStats();
  const oldLevel = stats.level;
  const xp = XP_BY_EVENT[kind] ?? 0;

  // 1) Counters + evento en el log
  bumpCounters(stats, kind);
  stats.events.unshift({ kind, xp, at: new Date().toISOString(), label });
  if (stats.events.length > MAX_EVENTS_KEPT) {
    stats.events.length = MAX_EVENTS_KEPT;
  }

  // 2) XP base
  stats.xp += xp;

  // 3) Streak (sólo eventos "reales", no streak_day para evitar bucle)
  let streakUpdated = false;
  if (kind !== 'streak_day') {
    const { gainedStreakDay } = bumpStreak(stats);
    if (gainedStreakDay && stats.streak.lastDay) {
      // Bonus de streak: si subió la racha, también es un día nuevo
      stats.xp += XP_BY_EVENT.streak_day;
      stats.events.unshift({
        kind: 'streak_day',
        xp: XP_BY_EVENT.streak_day,
        at: new Date().toISOString(),
        label: `racha día ${stats.streak.current}`,
      });
      streakUpdated = true;
    }
  }

  // 4) Recalcular nivel
  const { level } = deriveLevel(stats.xp);
  stats.level = level;

  // 5) Logros (puede dar más XP, y eso puede subir nivel otra vez)
  const achievementsUnlocked = checkAchievements(stats);
  if (achievementsUnlocked.length > 0) {
    const { level: lvl2 } = deriveLevel(stats.xp);
    stats.level = lvl2;
  }

  const newLevel = stats.level;
  saveStats(stats);

  return {
    stats,
    xpGained: stats.xp - (stats.xp - xp - achievementsUnlocked.reduce((s, a) => s + a.xpReward, 0) - (streakUpdated ? XP_BY_EVENT.streak_day : 0)),
    leveledUp: newLevel > oldLevel,
    oldLevel,
    newLevel,
    achievementsUnlocked,
    streakUpdated,
  };
}

/**
 * Reset total (para debugging / botón "empezar de cero" si lo hay).
 */
export function resetStats(): Stats {
  const empty = emptyStats();
  saveStats(empty);
  return empty;
}
