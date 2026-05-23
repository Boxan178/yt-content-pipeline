// Cola FIFO de jobs claude. Permite encolar varias acciones (típicamente LUIS,
// CALIOPE, etc.) y procesarlas secuencialmente. Útil para Pablo cuando tiene
// muchas sleep stories pendientes de render.
//
// Persistencia: ~/.yt-content-pipeline/queue.json
// Worker: lazy. Cada llamada al GET/POST de /api/queue invoca tickQueue() que
// avanza la cola si corresponde. No hay setInterval — el cliente polleia.

import 'server-only';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { startJob, readJob, jobsDirFor, isPidAlive } from './claude-jobs';

const DIR = path.join(os.homedir(), '.yt-content-pipeline');
const FILE = path.join(DIR, 'queue.json');

export type QueueItemStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export interface QueueItem {
  id: string;
  skill: string;
  label: string;
  videoFolder: string;
  videoTitle: string;
  prompt: string;
  cwd: string;
  model?: 'sonnet' | 'opus';
  effort?: 'low' | 'medium' | 'high' | 'max';
  timeoutMs: number;
  status: QueueItemStatus;
  addedAt: string;
  startedAt?: string;
  finishedAt?: string;
  /** jobId del ClaudeJob asociado (cuando status==='running' o terminado). */
  jobId?: string;
  /** PID del subprocess (referencia rápida). */
  pid?: number;
  /** Razón si fallo (claude exit code, timeout, etc.). */
  failReason?: string;
}

interface QueueState {
  version: 1;
  items: QueueItem[];
}

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function emptyQueue(): QueueState {
  return { version: 1, items: [] };
}

export function readQueue(): QueueState {
  if (!existsSync(FILE)) return emptyQueue();
  try {
    const raw = readFileSync(FILE, 'utf-8');
    const parsed = JSON.parse(raw) as QueueState;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items)) return emptyQueue();
    return parsed;
  } catch {
    return emptyQueue();
  }
}

function saveQueue(q: QueueState) {
  ensureDir();
  writeFileSync(FILE, JSON.stringify(q, null, 2), 'utf-8');
}

export interface EnqueueOptions {
  skill: string;
  label: string;
  videoFolder: string;
  videoTitle: string;
  prompt: string;
  cwd: string;
  timeoutMs: number;
  model?: 'sonnet' | 'opus';
  effort?: 'low' | 'medium' | 'high' | 'max';
}

export function enqueue(opts: EnqueueOptions): QueueItem {
  const q = readQueue();
  const item: QueueItem = {
    id: randomUUID(),
    skill: opts.skill,
    label: opts.label,
    videoFolder: opts.videoFolder,
    videoTitle: opts.videoTitle,
    prompt: opts.prompt,
    cwd: opts.cwd,
    model: opts.model,
    effort: opts.effort,
    timeoutMs: opts.timeoutMs,
    status: 'pending',
    addedAt: new Date().toISOString(),
  };
  q.items.push(item);
  saveQueue(q);
  // Avanzar la cola por si no había nada corriendo
  tickQueue();
  return item;
}

export function removeItem(id: string): boolean {
  const q = readQueue();
  const before = q.items.length;
  q.items = q.items.filter((it) => {
    if (it.id !== id) return true;
    // Si está corriendo, no podemos quitarlo sin cancelar el job aparte
    if (it.status === 'running') return true;
    return false;
  });
  if (q.items.length !== before) {
    saveQueue(q);
    return true;
  }
  return false;
}

/**
 * Reordena un item dentro de la cola (sólo dentro de la lista pending).
 * El item en posición `from` (índice global) se mueve a posición `to`.
 * No se puede mover por encima de items con status no-pending.
 */
export function moveItem(id: string, direction: 'up' | 'down'): boolean {
  const q = readQueue();
  const idx = q.items.findIndex((it) => it.id === id);
  if (idx < 0) return false;
  if (q.items[idx].status !== 'pending') return false;
  const target = direction === 'up' ? idx - 1 : idx + 1;
  if (target < 0 || target >= q.items.length) return false;
  if (q.items[target].status !== 'pending') return false;
  [q.items[idx], q.items[target]] = [q.items[target], q.items[idx]];
  saveQueue(q);
  return true;
}

/**
 * Tick: comprueba running, marca terminados, y lanza el siguiente pending si
 * no hay nada corriendo. Idempotente y seguro de llamar muy seguido.
 */
export function tickQueue(): QueueState {
  const q = readQueue();
  let dirty = false;

  // 1) Estado del item en running
  const running = q.items.find((it) => it.status === 'running');
  if (running) {
    if (!running.jobId) {
      // Inconsistencia: marcamos failed
      running.status = 'failed';
      running.failReason = 'No jobId asociado';
      running.finishedAt = new Date().toISOString();
      dirty = true;
    } else {
      const jobPath = path.join(jobsDirFor(running.videoFolder), `${running.jobId}.json`);
      const job = readJob(jobPath);
      if (!job) {
        running.status = 'failed';
        running.failReason = 'Job desapareció del disco';
        running.finishedAt = new Date().toISOString();
        dirty = true;
      } else if (job.status === 'done') {
        running.status = 'done';
        running.finishedAt = job.finishedAt ?? new Date().toISOString();
        dirty = true;
      } else if (job.status === 'failed' || job.status === 'timeout' || job.status === 'cancelled') {
        running.status = 'failed';
        running.failReason = job.status;
        running.finishedAt = job.finishedAt ?? new Date().toISOString();
        dirty = true;
      } else {
        // status === 'running' en el .json, doble check PID
        if (!isPidAlive(job.pid)) {
          // Murió sin que readJob lo notara (raro). Lo marcamos done aproximado
          running.status = 'done';
          running.finishedAt = new Date().toISOString();
          dirty = true;
        }
      }
    }
  }

  // 2) Si nadie corre ahora, lanzar el primer pending
  const nowRunning = q.items.find((it) => it.status === 'running');
  if (!nowRunning) {
    const next = q.items.find((it) => it.status === 'pending');
    if (next) {
      try {
        const job = startJob({
          skill: next.skill,
          label: next.label,
          prompt: next.prompt,
          cwd: next.cwd,
          timeoutMs: next.timeoutMs,
          videoFolder: next.videoFolder,
          model: next.model,
          effort: next.effort,
        });
        next.status = 'running';
        next.jobId = job.jobId;
        next.pid = job.pid;
        next.startedAt = job.startedAt;
        dirty = true;
      } catch (e) {
        next.status = 'failed';
        next.failReason = e instanceof Error ? e.message : String(e);
        next.finishedAt = new Date().toISOString();
        dirty = true;
      }
    }
  }

  if (dirty) saveQueue(q);
  return q;
}

export function cancelItem(id: string): boolean {
  const q = readQueue();
  const item = q.items.find((it) => it.id === id);
  if (!item) return false;
  if (item.status === 'pending') {
    item.status = 'cancelled';
    item.finishedAt = new Date().toISOString();
    saveQueue(q);
    return true;
  }
  if (item.status === 'running' && item.jobId) {
    // Cancelar via claude-jobs
    try {
      const { cancelJob, jobsDirFor: jdir } = require('./claude-jobs') as typeof import('./claude-jobs');
      const jobPath = path.join(jdir(item.videoFolder), `${item.jobId}.json`);
      cancelJob(jobPath);
    } catch {}
    item.status = 'cancelled';
    item.finishedAt = new Date().toISOString();
    saveQueue(q);
    // Avanzar al siguiente
    tickQueue();
    return true;
  }
  return false;
}

export function clearFinished(): number {
  const q = readQueue();
  const before = q.items.length;
  q.items = q.items.filter((it) => it.status === 'pending' || it.status === 'running');
  const removed = before - q.items.length;
  if (removed > 0) saveQueue(q);
  return removed;
}
