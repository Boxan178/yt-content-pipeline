// Store de la CADENCIA editorial objetivo por canal (Fase 3). Persistencia en
// ~/.yt-content-pipeline/channel-cadence.json. Server-only (toca fs); los tipos
// browser-safe viven en lib/calendar-types.ts.
//
// La cadencia es el "ritmo deseado" de publicación por canal (N vídeos/semana,
// días preferidos). NO produce nada por sí sola: la usan la detección de huecos
// (lib/calendar-gaps.ts) y los avisos. Es puramente declarativa.

import 'server-only';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getChannel } from './channels';
import type { ChannelCadence } from './calendar-types';

const DIR = path.join(os.homedir(), '.yt-content-pipeline');
const FILE = path.join(DIR, 'channel-cadence.json');

interface State {
  version: 1;
  items: ChannelCadence[];
}

function ensureDir(): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function empty(): State {
  return { version: 1, items: [] };
}

export function readCadence(): State {
  if (!existsSync(FILE)) return empty();
  try {
    const parsed = JSON.parse(readFileSync(FILE, 'utf-8')) as State;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items)) return empty();
    return parsed;
  } catch {
    return empty();
  }
}

function save(s: State): void {
  ensureDir();
  writeFileSync(FILE, JSON.stringify(s, null, 2), 'utf-8');
}

/** Cadencia de un canal concreto, o null si no está configurada. */
export function getCadence(channel: string): ChannelCadence | null {
  return readCadence().items.find((c) => c.channel === channel) ?? null;
}

/** Normaliza/valida un cadence parcial a valores seguros. */
function sanitize(input: Partial<ChannelCadence> & { channel: string }): ChannelCadence {
  const target = Math.max(0, Math.min(14, Math.round(Number(input.targetPerWeek) || 0)));
  const weekdays = Array.isArray(input.preferredWeekdays)
    ? Array.from(new Set(input.preferredWeekdays.map((n) => Math.round(Number(n))).filter((n) => n >= 0 && n <= 6))).sort((a, b) => a - b)
    : undefined;
  const hour = input.hour == null ? 12 : Math.max(0, Math.min(23, Math.round(Number(input.hour))));
  return {
    channel: input.channel,
    enabled: input.enabled !== false,
    targetPerWeek: target,
    preferredWeekdays: weekdays && weekdays.length ? weekdays : undefined,
    hour,
  };
}

/** Crea o actualiza la cadencia de un canal. Devuelve el registro guardado o
 *  null si el canal no existe en lib/channels.ts. */
export function upsertCadence(input: Partial<ChannelCadence> & { channel: string }): ChannelCadence | null {
  if (!getChannel(input.channel)) return null;
  const s = readCadence();
  const idx = s.items.findIndex((c) => c.channel === input.channel);
  // Merge contra el registro previo ANTES de sanear: el PATCH del panel solo
  // manda {channel,enabled,targetPerWeek,preferredWeekdays} y sin merge se
  // perdería `hour` (sanitize lo forzaría a 12 en cada guardado).
  const prev = idx === -1 ? undefined : s.items[idx];
  const clean = sanitize({ ...prev, ...input });
  if (idx === -1) s.items.push(clean);
  else s.items[idx] = clean;
  save(s);
  return clean;
}

export function deleteCadence(channel: string): boolean {
  const s = readCadence();
  const before = s.items.length;
  s.items = s.items.filter((c) => c.channel !== channel);
  if (s.items.length === before) return false;
  save(s);
  return true;
}
