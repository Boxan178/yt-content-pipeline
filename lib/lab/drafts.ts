/**
 * CRUD de channel drafts del lab. Persistencia JSON local en
 * `~/.yt-content-pipeline/lab/channels.json`.
 *
 * Patrón calcado de `lib/upload-schedule.ts` y `lib/job-queue.ts`:
 *   - lectura idempotente (si falta el archivo, devuelve estado vacío)
 *   - escritura síncrona (write-through) tras cada mutación
 *   - sin lock — single-user, fricción mínima
 */

import 'server-only';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ChannelDraft,
  ChannelsState,
  DraftLanguage,
  WizardStep,
} from './types';

const DIR = path.join(os.homedir(), '.yt-content-pipeline', 'lab');
const FILE = path.join(DIR, 'channels.json');

function ensureDir(): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function emptyState(): ChannelsState {
  return { version: 1, drafts: [] };
}

function readState(): ChannelsState {
  ensureDir();
  if (!existsSync(FILE)) return emptyState();
  try {
    const raw = readFileSync(FILE, 'utf-8');
    const parsed = JSON.parse(raw) as ChannelsState;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.drafts)) {
      return emptyState();
    }
    return parsed;
  } catch {
    return emptyState();
  }
}

function writeState(s: ChannelsState): void {
  ensureDir();
  writeFileSync(FILE, JSON.stringify(s, null, 2), 'utf-8');
}

export function listDrafts(): ChannelDraft[] {
  return readState().drafts.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getDraft(id: string): ChannelDraft | null {
  return readState().drafts.find((d) => d.id === id) ?? null;
}

export interface CreateDraftInput {
  referenceChannelUrl: string;
  language: DraftLanguage;
  initialTopic: string;
  transcripts?: string[];
}

export function createDraft(input: CreateDraftInput): ChannelDraft {
  const now = new Date().toISOString();
  const draft: ChannelDraft = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    currentStep: 1,
    referenceChannelUrl: input.referenceChannelUrl,
    language: input.language,
    initialTopic: input.initialTopic,
    transcripts: input.transcripts ?? [],
    sampleFrameUrls: [],
    thumbnailSampleUrls: [],
    jobIds: [],
  };
  const s = readState();
  s.drafts.push(draft);
  writeState(s);
  return draft;
}

export function updateDraft(
  id: string,
  patch: Partial<ChannelDraft>,
): ChannelDraft | null {
  const s = readState();
  const idx = s.drafts.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  const merged: ChannelDraft = {
    ...s.drafts[idx],
    ...patch,
    id: s.drafts[idx].id,
    createdAt: s.drafts[idx].createdAt,
    updatedAt: new Date().toISOString(),
  };
  s.drafts[idx] = merged;
  writeState(s);
  return merged;
}

export function deleteDraft(id: string): boolean {
  const s = readState();
  const before = s.drafts.length;
  s.drafts = s.drafts.filter((d) => d.id !== id);
  if (s.drafts.length === before) return false;
  writeState(s);
  return true;
}

export function advanceStep(id: string, step: WizardStep): ChannelDraft | null {
  return updateDraft(id, { currentStep: step });
}

export function appendJobId(id: string, jobId: string): ChannelDraft | null {
  const draft = getDraft(id);
  if (!draft) return null;
  if (draft.jobIds.includes(jobId)) return draft;
  return updateDraft(id, { jobIds: [...draft.jobIds, jobId] });
}

/** Path absoluto a la carpeta dedicada del draft en disco (drafts/<id>/). */
export function draftDiskPath(id: string): string {
  return path.join(DIR, 'drafts', id);
}

/** Crea la carpeta si no existe y devuelve el path. */
export function ensureDraftDiskPath(id: string): string {
  const p = draftDiskPath(id);
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
  return p;
}
