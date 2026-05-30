// Cola FIFO de jobs claude. Permite encolar varias acciones (típicamente LUIS,
// CALIOPE, etc.) y procesarlas secuencialmente. Útil para Pablo cuando tiene
// muchas sleep stories pendientes de render.
//
// Persistencia: ~/.yt-content-pipeline/queue.json
// Worker: lazy. Cada llamada al GET/POST de /api/queue invoca tickQueue() que
// avanza la cola si corresponde. No hay setInterval — el cliente polleia.

import 'server-only';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { startJob, readJob, jobsDirFor, isPidAlive, cancelJob } from './claude-jobs';
import { computeProgress, type Progress } from './progress';
import { CHANNELS } from './channels';
import { buildSaraResume, QUEUE_COMPLETION_INSTRUCTION, type VideoContext } from './prompts';
import { extractAssistantText } from './lab/parse-engine-output';

const DIR = path.join(os.homedir(), '.yt-content-pipeline');
const FILE = path.join(DIR, 'queue.json');

export type QueueItemStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled' | 'blocked';

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
  /**
   * Feature "vídeo de principio a fin": si true, el item NO avanza al terminar
   * un turno de SARA; se re-lanza sobre el mismo vídeo hasta que el progreso
   * llega a 100% (listo) o queda bloqueado/sin progreso. Default cuando no se
   * especifica: skill === 'sara'. Las skills de un solo paso (LUIS, ELENA…)
   * NO loopean.
   */
  loopUntilComplete?: boolean;
  /** Turnos de SARA ejecutados sobre este vídeo. */
  attempts?: number;
  /** Tope de turnos antes de marcar bloqueado (default 6). */
  maxAttempts?: number;
  /** Último % de progreso observado (para detectar estancamiento). */
  lastPercent?: number;
  /** Turnos consecutivos sin avance de %. */
  stalledRuns?: number;
  /** Motivo si quedó bloqueado (decisión de Pablo / sin progreso / máx turnos). */
  blockReason?: string;
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
  /** Ver QueueItem.loopUntilComplete. */
  loopUntilComplete?: boolean;
  maxAttempts?: number;
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
    loopUntilComplete: opts.loopUntilComplete,
    maxAttempts: opts.maxAttempts,
  };
  q.items.push(item);
  saveQueue(q);
  // Avanzar la cola por si no había nada corriendo (fire-and-forget; el driver
  // autoritativo es el GET /api/queue que sí await-ea).
  void tickQueue().catch(() => {});
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

/** Localiza el canal de un videoFolder por prefijo de rootPath. */
function findChannelForFolder(videoFolder: string) {
  const norm = videoFolder.replace(/\\/g, '/');
  return CHANNELS.find((c) => c.enabled && c.rootPath && norm.startsWith(c.rootPath.replace(/\\/g, '/')));
}

const SHARED_VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv']);
const SHARED_IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/** Progreso real del vídeo, propagando sharedBrutosAvailable como el kanban. */
async function progressOfVideo(videoFolder: string): Promise<Progress> {
  const channel = findChannelForFolder(videoFolder);
  let sharedBrutosAvailable = false;
  if (channel?.sharedBrutosLibrary) {
    try {
      sharedBrutosAvailable = readdirSync(channel.sharedBrutosLibrary).some((f) => {
        const e = path.extname(f).toLowerCase();
        return SHARED_VIDEO_EXT.has(e) || SHARED_IMG_EXT.has(e);
      });
    } catch {}
  }
  return computeProgress(videoFolder, { sharedBrutosAvailable });
}

/** Lee los marcadores de estado que SARA deja al cerrar su turno. */
function detectMarkers(logPath: string): { done: boolean; blocked: string | null } {
  try {
    const text = extractAssistantText(readFileSync(logPath, 'utf-8'));
    const done = /<<<\s*VIDEO_DONE\s*>>>/i.test(text);
    const bm = text.match(/<<<\s*VIDEO_BLOCKED\s*:?\s*([^>]*)>>>/i);
    return { done, blocked: bm ? (bm[1] || '').trim().slice(0, 240) || 'SARA declaró un bloqueo' : null };
  } catch {
    return { done: false, blocked: null };
  }
}

/** Re-lanza SARA sobre el mismo vídeo (turno de continuación del loop). */
function relaunchSara(item: QueueItem, progress: Progress): void {
  const channel = findChannelForFolder(item.videoFolder);
  const title = item.videoTitle || item.videoFolder.replace(/\\/g, '/').split('/').pop() || 'vídeo';
  const vctx: VideoContext = {
    channel: channel?.slug ?? '',
    title,
    state: 'production',
    folderPath: item.videoFolder,
    progress: { hits: progress.hits, total: progress.total, percent: progress.percent, details: progress.details },
  };
  const resume = buildSaraResume(vctx);
  const job = startJob({
    skill: 'sara',
    label: item.label,
    prompt: resume.prompt + QUEUE_COMPLETION_INSTRUCTION,
    cwd: resume.cwd,
    timeoutMs: resume.timeoutMs,
    videoFolder: item.videoFolder,
    model: resume.model,
  });
  item.jobId = job.jobId;
  item.pid = job.pid;
  // startedAt se mantiene (primer turno) para reflejar el tiempo total del vídeo.
}

// Mutex simple: evita ticks reentrantes (home + /queue pollean a la vez) que con
// los await internos podrían doble-lanzar o pisarse al escribir queue.json.
let ticking = false;

/**
 * Tick: evalúa el item en curso y lanza el siguiente pending si la cola está
 * libre. Con loopUntilComplete (default para SARA), un vídeo NO libera la cola
 * hasta estar LISTO (progreso 100% o marcador VIDEO_DONE) o quedar BLOQUEADO —
 * se re-lanza SARA turno a turno. Un vídeo bloqueado/fallido NO frena la cola:
 * se deja y se avanza al siguiente. Async (cómputo de progreso); reentrada
 * protegida por mutex.
 */
export async function tickQueue(): Promise<QueueState> {
  if (ticking) return readQueue();
  ticking = true;
  try {
    return await tickInner();
  } finally {
    ticking = false;
  }
}

async function tickInner(): Promise<QueueState> {
  const q = readQueue();
  let dirty = false;

  // 1) Item en curso
  const running = q.items.find((it) => it.status === 'running');
  if (running) {
    const shouldLoop = running.loopUntilComplete ?? (running.skill === 'sara');
    if (!running.jobId) {
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
      } else if (job.status === 'running' && isPidAlive(job.pid)) {
        // Sigue trabajando: no tocar.
      } else if (job.status === 'cancelled') {
        running.status = 'cancelled';
        running.finishedAt = job.finishedAt ?? new Date().toISOString();
        dirty = true;
      } else if (!shouldLoop) {
        // Skill de un solo paso (LUIS, ELENA, bulk no-SARA…): comportamiento clásico.
        if (job.status === 'done') {
          running.status = 'done';
        } else {
          running.status = 'failed';
          running.failReason = job.status;
        }
        running.finishedAt = job.finishedAt ?? new Date().toISOString();
        dirty = true;
      } else {
        // Loop "vídeo hasta el final": decidir por progreso real + marcadores.
        const progress = await progressOfVideo(running.videoFolder);
        const percent = progress.percent;
        const attempts = running.attempts ?? 1;
        const maxAttempts = running.maxAttempts ?? 6;
        const markers = detectMarkers(job.logPath);
        if (percent >= 100 || markers.done) {
          running.status = 'done';
          running.lastPercent = percent;
          running.finishedAt = new Date().toISOString();
          dirty = true;
        } else if (markers.blocked) {
          running.status = 'blocked';
          running.blockReason = markers.blocked;
          running.lastPercent = percent;
          running.finishedAt = new Date().toISOString();
          dirty = true;
        } else {
          const stalled = running.lastPercent !== undefined && percent <= running.lastPercent;
          const stalledRuns = stalled ? (running.stalledRuns ?? 0) + 1 : 0;
          running.lastPercent = percent;
          running.stalledRuns = stalledRuns;
          if (stalledRuns >= 2) {
            running.status = 'blocked';
            running.blockReason = `Sin avance tras ${stalledRuns + 1} turnos (${percent}%). Requiere intervención manual.`;
            running.finishedAt = new Date().toISOString();
            dirty = true;
          } else if (attempts >= maxAttempts) {
            running.status = 'blocked';
            running.blockReason = `Máximo de ${maxAttempts} turnos sin completar (${percent}%).`;
            running.finishedAt = new Date().toISOString();
            dirty = true;
          } else {
            try {
              relaunchSara(running, progress);
              running.attempts = attempts + 1;
              dirty = true;
            } catch (e) {
              running.status = 'failed';
              running.failReason = `Re-lanzar SARA falló: ${e instanceof Error ? e.message : String(e)}`;
              running.finishedAt = new Date().toISOString();
              dirty = true;
            }
          }
        }
      }
    }
  }

  // 2) Si nadie corre, lanzar el primer pending
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
        next.attempts = 1;
        next.stalledRuns = 0;
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
    try {
      const jobPath = path.join(jobsDirFor(item.videoFolder), `${item.jobId}.json`);
      cancelJob(jobPath);
    } catch {}
    item.status = 'cancelled';
    item.finishedAt = new Date().toISOString();
    saveQueue(q);
    // Avanzar al siguiente (fire-and-forget; tickQueue es async).
    void tickQueue().catch(() => {});
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
