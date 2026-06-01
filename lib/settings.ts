// Settings de la app, persistidos en ~/.yt-content-pipeline/settings.json.
// Server-only — el cliente los consume via /api/settings.

import 'server-only';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = path.join(os.homedir(), '.yt-content-pipeline');
const FILE = path.join(DIR, 'settings.json');

export interface AppSettings {
  enableConfetti: boolean;
  enableNativeNotifications: boolean;
  pollIntervalMs: number;
  showCompilationBadge: boolean;
  /** Si true, los jobs nuevos arrancan con effort='max' por defecto. */
  defaultEffortMax: boolean;
  /**
   * Por canal: ruta destino en el NAS donde mover la carpeta cuando un vídeo
   * pasa a estado `archived`. Ej: { "moderni-stoici": "Z:/ARCHIVO/MS" }.
   * Si está vacío para un canal, el archive solo mueve a `_ARCHIVO` local.
   */
  channelNasPaths: Record<string, string>;
  /** Si true, al mover a archived hace copy+delete; si false, solo copy. */
  archiveMoveDeleteLocal: boolean;
}

const DEFAULTS: AppSettings = {
  enableConfetti: true,
  enableNativeNotifications: true,
  pollIntervalMs: 60000,
  showCompilationBadge: true,
  defaultEffortMax: false,
  channelNasPaths: {},
  archiveMoveDeleteLocal: false,
};

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

export function readSettings(): AppSettings {
  if (!existsSync(FILE)) return { ...DEFAULTS };
  try {
    const raw = readFileSync(FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeSettings(next: Partial<AppSettings>): AppSettings {
  ensureDir();
  const current = readSettings();
  const merged: AppSettings = { ...current, ...next };
  // Saneado defensivo: el POST acepta JSON arbitrario. Sin esto, un
  // pollIntervalMs=0/NaN dispararía un bucle de polling caliente y un
  // channelNasPaths no-objeto rompería los consumidores `?.[slug]`.
  if (typeof merged.pollIntervalMs !== 'number' || !Number.isFinite(merged.pollIntervalMs)) {
    merged.pollIntervalMs = DEFAULTS.pollIntervalMs;
  }
  merged.pollIntervalMs = Math.min(300000, Math.max(5000, Math.round(merged.pollIntervalMs)));
  if (!merged.channelNasPaths || typeof merged.channelNasPaths !== 'object' || Array.isArray(merged.channelNasPaths)) {
    merged.channelNasPaths = {};
  }
  merged.enableConfetti = !!merged.enableConfetti;
  merged.enableNativeNotifications = !!merged.enableNativeNotifications;
  merged.showCompilationBadge = !!merged.showCompilationBadge;
  merged.defaultEffortMax = !!merged.defaultEffortMax;
  merged.archiveMoveDeleteLocal = !!merged.archiveMoveDeleteLocal;
  writeFileSync(FILE, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}
