// Persistencia de estados "vistos" por vídeo. Permite detectar transiciones
// (un vídeo movido a _SUBIDOS por primera vez = celebrar + XP). Vive en
// ~/.yt-content-pipeline/seen-states.json.
//
// La primera vez que el archivo no existe, marcamos los current states sin
// disparar transiciones — "empezar limpio" según decisión de Pablo.

import 'server-only';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = path.join(os.homedir(), '.yt-content-pipeline');
const FILE = path.join(DIR, 'seen-states.json');

type SeenMap = Record<string, string>;

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

export function readSeen(): { map: SeenMap; isFirstRun: boolean } {
  if (!existsSync(FILE)) return { map: {}, isFirstRun: true };
  try {
    const raw = readFileSync(FILE, 'utf-8');
    return { map: JSON.parse(raw) as SeenMap, isFirstRun: false };
  } catch {
    return { map: {}, isFirstRun: true };
  }
}

function writeSeen(map: SeenMap) {
  ensureDir();
  writeFileSync(FILE, JSON.stringify(map, null, 2), 'utf-8');
}

export interface Transition {
  videoFolder: string;
  videoTitle: string;
  from: string | null;
  to: string;
}

/**
 * Recibe la foto actual del filesystem (vídeo → estado). Devuelve las
 * transiciones detectadas (a estados "premiables": uploaded, ready).
 *
 * Política:
 *  - First run: marcamos todos como vistos SIN devolver transiciones.
 *  - Run normal: para cada vídeo, si su estado cambió respecto a la última vez
 *    Y el nuevo estado es 'uploaded' o 'ready', se devuelve como transición.
 *  - Estados que no son uploaded/ready se actualizan sin devolver transición
 *    (siguen registrándose para que la próxima vez podamos detectar el salto).
 */
export function diffAndUpdate(
  current: Array<{ videoFolder: string; videoTitle: string; state: string }>,
): Transition[] {
  const { map, isFirstRun } = readSeen();
  const transitions: Transition[] = [];
  const next: SeenMap = { ...map };

  for (const v of current) {
    const prev = map[v.videoFolder] ?? null;
    if (prev !== v.state) {
      // estado cambió
      if (!isFirstRun && (v.state === 'uploaded' || v.state === 'ready')) {
        transitions.push({
          videoFolder: v.videoFolder,
          videoTitle: v.videoTitle,
          from: prev,
          to: v.state,
        });
      }
      next[v.videoFolder] = v.state;
    }
  }

  // Limpieza: si un vídeo desapareció del filesystem, lo borramos del map
  const currentFolders = new Set(current.map((v) => v.videoFolder));
  for (const key of Object.keys(next)) {
    if (!currentFolders.has(key)) {
      delete next[key];
    }
  }

  writeSeen(next);
  return transitions;
}
