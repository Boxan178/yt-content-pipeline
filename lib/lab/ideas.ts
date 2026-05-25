/**
 * CRUD del banco de ideas del lab. Persistencia en
 * `~/.yt-content-pipeline/lab/ideas.json`.
 */

import 'server-only';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Idea, IdeasState, IdeaStatus } from './types';

const DIR = path.join(os.homedir(), '.yt-content-pipeline', 'lab');
const FILE = path.join(DIR, 'ideas.json');

function ensureDir(): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function emptyState(): IdeasState {
  return { version: 1, ideas: [] };
}

function readState(): IdeasState {
  ensureDir();
  if (!existsSync(FILE)) return emptyState();
  try {
    const raw = readFileSync(FILE, 'utf-8');
    const parsed = JSON.parse(raw) as IdeasState;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.ideas)) {
      return emptyState();
    }
    return parsed;
  } catch {
    return emptyState();
  }
}

function writeState(s: IdeasState): void {
  ensureDir();
  writeFileSync(FILE, JSON.stringify(s, null, 2), 'utf-8');
}

export function listIdeas(opts?: { channelId?: string | null }): Idea[] {
  const ideas = readState().ideas;
  if (opts && 'channelId' in opts) {
    return ideas.filter((i) => i.channelId === opts.channelId);
  }
  return ideas.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getIdea(id: string): Idea | null {
  return readState().ideas.find((i) => i.id === id) ?? null;
}

export interface CreateIdeaInput {
  title: string;
  description: string;
  tags?: string[];
  channelId?: string | null;
  priority?: 1 | 2 | 3 | 4 | 5;
  status?: IdeaStatus;
  sourceResearchId?: string | null;
  replicatedFromIdeaId?: string | null;
}

export function createIdea(input: CreateIdeaInput): Idea {
  const idea: Idea = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    title: input.title,
    description: input.description,
    tags: input.tags ?? [],
    channelId: input.channelId ?? null,
    priority: input.priority ?? 3,
    status: input.status ?? 'raw',
    sourceResearchId: input.sourceResearchId ?? null,
    replicatedFromIdeaId: input.replicatedFromIdeaId ?? null,
  };
  const s = readState();
  s.ideas.push(idea);
  writeState(s);
  return idea;
}

export function updateIdea(id: string, patch: Partial<Idea>): Idea | null {
  const s = readState();
  const idx = s.ideas.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  const merged: Idea = {
    ...s.ideas[idx],
    ...patch,
    id: s.ideas[idx].id,
    createdAt: s.ideas[idx].createdAt,
  };
  s.ideas[idx] = merged;
  writeState(s);
  return merged;
}

export function deleteIdea(id: string): boolean {
  const s = readState();
  const before = s.ideas.length;
  s.ideas = s.ideas.filter((i) => i.id !== id);
  if (s.ideas.length === before) return false;
  writeState(s);
  return true;
}
