// Modo de RENDER, persistido server-side (igual que lib/working-mode.ts) para
// que el poller del backend lo lea.
//
// Semántica (Pablo, 2026-06-03):
//   'manual' = los renders los dispara Pablo a mano desde la columna «Cola de
//              render» del Kanban. Nada se renderiza solo. (DEFAULT, seguro.)
//   'auto'   = el poller arranca el render (LUIS) en cuanto un vídeo tiene todo
//              menos el render, UNO A UNO (renders secuenciales por estabilidad).

import 'server-only';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type RenderMode = 'auto' | 'manual';

const DIR = path.join(os.homedir(), '.yt-content-pipeline');
const FILE = path.join(DIR, 'render-mode.json');

/** Modo actual. Default 'manual' — auto-render es opt-in. */
export function getRenderMode(): RenderMode {
  try {
    const parsed = JSON.parse(readFileSync(FILE, 'utf-8')) as { mode?: string };
    if (parsed.mode === 'auto') return 'auto';
    if (parsed.mode === 'manual') return 'manual';
  } catch {
    // archivo ausente / inválido → default
  }
  return 'manual';
}

export function setRenderMode(mode: RenderMode): RenderMode {
  try {
    if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
    writeFileSync(
      FILE,
      JSON.stringify({ mode, updatedAt: new Date().toISOString() }, null, 2),
      'utf-8',
    );
  } catch {
    // best-effort
  }
  return mode;
}
