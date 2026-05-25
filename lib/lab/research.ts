/**
 * CRUD de investigaciones de mercado del lab. Persistencia en
 * `~/.yt-content-pipeline/lab/research.json`.
 *
 * Sólo se guarda lo del modo "deep". El modo "quick" pinta resultado en
 * pantalla y NO toca disco.
 */

import 'server-only';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Research, ResearchState } from './types';

const DIR = path.join(os.homedir(), '.yt-content-pipeline', 'lab');
const FILE = path.join(DIR, 'research.json');

function ensureDir(): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function emptyState(): ResearchState {
  return { version: 1, researches: [] };
}

function readState(): ResearchState {
  ensureDir();
  if (!existsSync(FILE)) return emptyState();
  try {
    const raw = readFileSync(FILE, 'utf-8');
    const parsed = JSON.parse(raw) as ResearchState;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.researches)) {
      return emptyState();
    }
    return parsed;
  } catch {
    return emptyState();
  }
}

function writeState(s: ResearchState): void {
  ensureDir();
  writeFileSync(FILE, JSON.stringify(s, null, 2), 'utf-8');
}

export function listResearch(): Research[] {
  return readState().researches.sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
}

export function getResearch(id: string): Research | null {
  return readState().researches.find((r) => r.id === id) ?? null;
}

export type CreateResearchInput = Omit<Research, 'id' | 'createdAt'>;

export function createResearch(input: CreateResearchInput): Research {
  const research: Research = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...input,
  };
  const s = readState();
  s.researches.push(research);
  writeState(s);
  return research;
}

export function deleteResearch(id: string): boolean {
  const s = readState();
  const before = s.researches.length;
  s.researches = s.researches.filter((r) => r.id !== id);
  if (s.researches.length === before) return false;
  writeState(s);
  return true;
}
