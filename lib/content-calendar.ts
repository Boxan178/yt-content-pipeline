// Store del PLAN EDITORIAL (Fase 2). Persistencia en
// ~/.yt-content-pipeline/content-calendar.json. Server-only (toca fs); los tipos
// browser-safe viven en lib/calendar-types.ts.
//
// A diferencia de scheduled-uploads.json (subidas REALES a YouTube), esto son
// items PLANIFICADOS: huecos e ideas colocados en fechas antes de producirse.
// Nada de aquí sube nada a YouTube; es la capa de planificación editorial.

import 'server-only';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PlannedItem, PlannedStatus } from './calendar-types';

const DIR = path.join(os.homedir(), '.yt-content-pipeline');
const FILE = path.join(DIR, 'content-calendar.json');

interface State {
  version: 1;
  items: PlannedItem[];
}

function ensureDir(): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function empty(): State {
  return { version: 1, items: [] };
}

export function readContentCalendar(): State {
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

/** Un item planificado por id, o null. */
export function getPlanned(id: string): PlannedItem | null {
  return readContentCalendar().items.find((i) => i.id === id) ?? null;
}

export interface AddPlannedInput {
  channel: string;
  date: string;
  title: string;
  ideaId?: string;
  videoFolder?: string;
  status?: PlannedStatus;
}

export function addPlanned(input: AddPlannedInput): PlannedItem {
  const s = readContentCalendar();
  const item: PlannedItem = {
    id: randomUUID(),
    channel: input.channel,
    date: input.date,
    title: input.title,
    ideaId: input.ideaId,
    videoFolder: input.videoFolder,
    status: input.status ?? 'planned',
    createdAt: new Date().toISOString(),
  };
  s.items.push(item);
  save(s);
  return item;
}

export type PlannedPatch = Partial<Pick<PlannedItem, 'date' | 'title' | 'channel' | 'status' | 'videoFolder' | 'ideaId'>>;

export function updatePlanned(id: string, patch: PlannedPatch): PlannedItem | null {
  const s = readContentCalendar();
  const idx = s.items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  s.items[idx] = {
    ...s.items[idx],
    ...patch,
    id: s.items[idx].id,
    createdAt: s.items[idx].createdAt,
    updatedAt: new Date().toISOString(),
  };
  save(s);
  return s.items[idx];
}

export function deletePlanned(id: string): boolean {
  const s = readContentCalendar();
  const before = s.items.length;
  s.items = s.items.filter((i) => i.id !== id);
  if (s.items.length === before) return false;
  save(s);
  return true;
}
