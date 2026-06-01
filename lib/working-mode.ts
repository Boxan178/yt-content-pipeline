// Modo de trabajo de Pablo, persistido SERVER-SIDE para que lo lea el backend
// (el toggle de la UI guardaba solo en localStorage del cliente, que el poller
// server-side no puede ver).
//
// Semántica (decisión de Pablo, 2026-06-01 — modo MIXTO):
//   Las APROBACIONES (título, miniatura…) van SIEMPRE por Telegram, esté en el
//   modo que esté. El toggle NO las apaga.
//   'home' = "En el PC": presente. Solo recibe las decisiones por Telegram.
//   'away' = "Fuera del PC": además, recibe avisos de COMPLETADOS (renders,
//            subidas, etc. — "ponme al día"). [Avisos de completados: tarea
//            siguiente; de momento el flag solo cambia el mensaje del toggle.]
// Al cambiar de modo se manda un aviso a Telegram (ver app/api/working-mode).

import 'server-only';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type WorkingMode = 'home' | 'away';

const DIR = path.join(os.homedir(), '.yt-content-pipeline');
const FILE = path.join(DIR, 'working-mode.json');

/** Modo actual. Default 'home' (en el PC) — Telegram es opt-in. */
export function getWorkingMode(): WorkingMode {
  try {
    const parsed = JSON.parse(readFileSync(FILE, 'utf-8')) as { mode?: string };
    if (parsed.mode === 'away') return 'away';
    if (parsed.mode === 'home') return 'home';
  } catch {
    // archivo ausente / inválido → default
  }
  return 'home';
}

export function setWorkingMode(mode: WorkingMode): WorkingMode {
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
