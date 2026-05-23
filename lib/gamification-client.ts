// Cliente browser-safe para registrar eventos de gamificación desde el renderer.
// Usa localStorage para de-duplicar (evita disparar varias veces el mismo evento
// para el mismo jobId / acción).

import type { Stats, XPEventKind, Achievement } from './gamification-types';

const DEDUP_KEY = 'ytcp:gamification:fired';

interface FiredMap {
  [key: string]: number; // timestamp ms
}

function loadFiredMap(): FiredMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(DEDUP_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as FiredMap;
  } catch {
    return {};
  }
}

function saveFiredMap(map: FiredMap) {
  if (typeof window === 'undefined') return;
  try {
    // Mantener solo los últimos 500 keys para no engordar localStorage
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 500);
    window.localStorage.setItem(DEDUP_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {}
}

function dedupKey(uniqueId: string, kind: XPEventKind): string {
  return `${uniqueId}::${kind}`;
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

export interface AwardOptions {
  /** ID único para de-duplicación (ej. jobId, videoFolder+kind). */
  dedupId: string;
  kind: XPEventKind;
  label?: string;
  /** Si true, dispara la notif del OS al subir de nivel / desbloquear. */
  notifyOnUnlock?: boolean;
}

/**
 * Dispara un evento de gamificación, pero solo una vez por (dedupId, kind).
 * Devuelve el AwardResult o null si ya se había disparado / hubo error.
 */
export async function awardOnce(opts: AwardOptions): Promise<AwardResult | null> {
  const key = dedupKey(opts.dedupId, opts.kind);
  const map = loadFiredMap();
  if (map[key]) return null;
  // Marcar antes de la petición para evitar carrera con doble click
  map[key] = Date.now();
  saveFiredMap(map);

  try {
    const r = await fetch('/api/stats/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: opts.kind, label: opts.label }),
    });
    const data = await r.json();
    if (!r.ok || !data.ok) {
      // Si falla, revertir el flag para que se pueda reintentar
      delete map[key];
      saveFiredMap(map);
      return null;
    }
    const result = data.result as AwardResult;
    if (opts.notifyOnUnlock !== false) {
      surfaceUnlocks(result);
    }
    return result;
  } catch {
    delete map[key];
    saveFiredMap(map);
    return null;
  }
}

function surfaceUnlocks(result: AwardResult) {
  if (typeof window === 'undefined') return;
  const api = window.electronAPI?.notify;
  if (result.leveledUp) {
    // Toast en-app
    window.dispatchEvent(
      new CustomEvent('ytcp:level-up', {
        detail: { newLevel: result.newLevel },
      }),
    );
    // Notif OS
    if (api) {
      api({
        title: `¡Nivel ${result.newLevel}!`,
        body: `Has subido de nivel. ¡Sigue así!`,
        kind: 'level-up',
      });
    }
  }
  for (const ach of result.achievementsUnlocked) {
    window.dispatchEvent(
      new CustomEvent('ytcp:achievement-unlocked', { detail: ach }),
    );
    if (api) {
      api({
        title: `${ach.icon} ${ach.title}`,
        body: ach.description,
        kind: 'achievement',
      });
    }
  }
}

/**
 * Fetch del estado actual. Útil para la TopBar / vista perfil.
 */
export async function fetchStats(): Promise<Stats | null> {
  try {
    const r = await fetch('/api/stats', { cache: 'no-store' });
    const data = await r.json();
    if (data.ok) return data.stats as Stats;
  } catch {}
  return null;
}
