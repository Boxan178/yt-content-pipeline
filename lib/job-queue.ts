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
import { buildSaraResume, QUEUE_COMPLETION_INSTRUCTION, QUEUE_PREEDIT_COMPLETION_INSTRUCTION, type VideoContext } from './prompts';
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
  /**
   * Fase 1 de la prueba de lava (2026-06-02): si true, el loop completa cuando el
   * vídeo está LISTO PARA EDITAR (todos los hitos MENOS renderPrincipal) o SARA emite
   * <<<VIDEO_READY_FOR_EDIT>>>. SARA recibe el prompt en modo "stopBeforeRender" (no
   * renderiza, no sube). El render lo dispara Pablo después, vídeo a vídeo, tras luz verde.
   */
  stopBeforeRender?: boolean;
  /** Turnos de SARA ejecutados sobre este vídeo. */
  attempts?: number;
  /** Backstop anti-runaway de turnos TOTALES (default 20). El detector real de
   *  atasco es stalledRuns>=2 (2 turnos seguidos sin avance de %); este tope solo
   *  corta un bucle que ni progresa ni se estanca de forma detectable. Antes era 6
   *  y estrangulaba pipelines largos sanos (los bloqueaba a 1 hito del final). */
  maxAttempts?: number;
  /** Último % de progreso observado (para detectar estancamiento). */
  lastPercent?: number;
  /** Turnos consecutivos sin avance de %. Detector PRIMARIO de atasco (>=2 → blocked). */
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
  /** Ver QueueItem.stopBeforeRender. */
  stopBeforeRender?: boolean;
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
    stopBeforeRender: opts.stopBeforeRender,
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
  // normalize('NFC') + separador final: el dominio tiene acentos/em-dash y un
  // rootPath podría ser prefijo de otro. Comparar forma Unicode canónica y con
  // '/' final evita falsos match y fallos por formas Unicode distintas.
  const norm = videoFolder.replace(/\\/g, '/').normalize('NFC');
  return CHANNELS.find((c) => {
    if (!c.enabled || !c.rootPath) return false;
    const root = c.rootPath.replace(/\\/g, '/').normalize('NFC');
    return norm === root || norm.startsWith(root + '/');
  });
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
function detectMarkers(logPath: string): { done: boolean; readyForEdit: boolean; blocked: string | null } {
  try {
    const text = extractAssistantText(readFileSync(logPath, 'utf-8'));
    const done = /<<<\s*VIDEO_DONE\s*>>>/i.test(text);
    const readyForEdit = /<<<\s*VIDEO_READY_FOR_EDIT\s*>>>/i.test(text);
    const bm = text.match(/<<<\s*VIDEO_BLOCKED\s*:?\s*([^>]*)>>>/i);
    return { done, readyForEdit, blocked: bm ? (bm[1] || '').trim().slice(0, 240) || 'SARA declaró un bloqueo' : null };
  } catch {
    return { done: false, readyForEdit: false, blocked: null };
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
  const stop = item.stopBeforeRender === true;
  const resume = buildSaraResume(vctx, { stopBeforeRender: stop });
  const job = startJob({
    skill: 'sara',
    label: item.label,
    prompt: resume.prompt + (stop ? QUEUE_PREEDIT_COMPLETION_INSTRUCTION : QUEUE_COMPLETION_INSTRUCTION),
    cwd: resume.cwd,
    timeoutMs: resume.timeoutMs,
    videoFolder: item.videoFolder,
    // Conservar el modelo y effort que eligió Pablo al encolar — antes la
    // continuación caía siempre al default del modelo (perdía el effort y, si
    // había override de modelo, lo degradaba a mitad del pipeline).
    model: item.model ?? resume.model,
    effort: item.effort,
  });
  item.jobId = job.jobId;
  item.pid = job.pid;
  // startedAt se mantiene (primer turno) para reflejar el tiempo total del vídeo.
}

/**
 * Re-encola un vídeo en modo Fase 1 (pre-edit) para que LA COLA sea el único
 * driver que lo conduce tras una decisión de Pablo (título/miniatura aprobados por
 * Telegram). Idempotente: si ya hay un item pending/running para esa carpeta NO
 * duplica (devuelve null). La usa approvals.ts en lugar de spawnear un SARA suelto,
 * que podría renderizar o duplicar el render (incidente 2026-06-01).
 */
export function enqueuePreEditResume(videoFolder: string): QueueItem | null {
  const norm = videoFolder.replace(/\\/g, '/').normalize('NFC');
  const q = readQueue();
  const active = q.items.find(
    (it) =>
      (it.status === 'pending' || it.status === 'running') &&
      it.videoFolder.replace(/\\/g, '/').normalize('NFC') === norm,
  );
  if (active) return null;
  const channel = findChannelForFolder(videoFolder);
  const title = videoFolder.replace(/\\/g, '/').split('/').pop() || 'vídeo';
  const vctx: VideoContext = { channel: channel?.slug ?? '', title, state: 'production', folderPath: videoFolder };
  const resume = buildSaraResume(vctx, { stopBeforeRender: true });
  return enqueue({
    skill: 'sara',
    label: `SARA pre-edit — ${title.slice(0, 40)}`,
    videoFolder,
    videoTitle: title,
    prompt: resume.prompt + QUEUE_PREEDIT_COMPLETION_INSTRUCTION,
    cwd: resume.cwd,
    timeoutMs: resume.timeoutMs,
    model: resume.model,
    loopUntilComplete: true,
    stopBeforeRender: true,
    maxAttempts: 12,
  });
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
        // 20 = backstop anti-runaway (era 6 → estrangulaba pipelines largos sanos).
        // El atasco real lo detecta stalledRuns>=2 mucho antes.
        const maxAttempts = running.maxAttempts ?? 20;
        const markers = detectMarkers(job.logPath);
        // Fase 1 (stopBeforeRender): "hecho" = LISTO PARA EDITAR DE VERDAD = todos los
        // hitos menos renderPrincipal (incluida miniatura 16:9 válida). NO basta con que
        // SARA emita VIDEO_READY_FOR_EDIT: el 2026-06-02 SARA marcó "listo" con una
        // miniatura CUADRADA (B-REST-RISE-v1.png 2048x2048) que progress.ts no cuenta.
        // Si SARA dice ready pero faltan hitos reales → BLOQUEAR y avisar, NO dar por bueno.
        const d = progress.details;
        const preEditReady = !!(
          d.hasPackagingMd && d.scriptWritten && d.locucionReady && d.brutosVisuales && d.miniaturaFinal
        );
        const realDone =
          running.stopBeforeRender === true ? preEditReady : percent >= 100 || markers.done;
        const falseReady = running.stopBeforeRender === true && !preEditReady && markers.readyForEdit;
        if (realDone) {
          running.status = 'done';
          running.lastPercent = percent;
          running.finishedAt = new Date().toISOString();
          dirty = true;
        } else if (falseReady) {
          const missing = [
            !d.miniaturaFinal ? 'miniatura 16:9 válida' : null,
            !d.locucionReady ? 'locución' : null,
            !d.scriptWritten ? 'guion' : null,
            !d.hasPackagingMd ? 'packaging.md' : null,
            !d.brutosVisuales ? 'brutos' : null,
          ]
            .filter(Boolean)
            .join(', ');
          running.status = 'blocked';
          running.blockReason = `SARA declaró READY_FOR_EDIT pero faltan hitos reales: ${missing}. No se da por listo (revisar miniatura 16:9).`;
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
