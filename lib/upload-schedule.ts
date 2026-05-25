// Scheduler local de uploads a YouTube. La app se encarga de subir el vídeo
// cuando llega la hora; YouTube NO lo programa. Esto sortea el límite de 30
// días y la restricción `private → public` del scheduling nativo.
//
// Persistencia: ~/.yt-content-pipeline/scheduled-uploads.json
// Worker: lazy. El tick ocurre al pedir GET /api/uploads (cliente polleia).

import 'server-only';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { startJob, readJob, jobsDirFor, cancelJob } from './claude-jobs';
import { JARVIS_ROOT } from './config';

const DIR = path.join(os.homedir(), '.yt-content-pipeline');
const FILE = path.join(DIR, 'scheduled-uploads.json');

export type UploadStatus = 'pending' | 'uploading' | 'done' | 'failed' | 'cancelled';
export type Privacy = 'public' | 'unlisted' | 'private';

export interface ScheduledUpload {
  id: string;
  videoFolder: string;
  videoTitle: string;
  channel: string;
  /** Metadata final que se aplica al subir. */
  title: string;
  description: string;
  tags: string[];
  /** Nombre del archivo de miniatura en _PACKAGING/MINIATURAS/, sin path. */
  thumbnailFilename: string;
  privacyOnPublish: Privacy;
  /** ISO 8601. Si es <= now al tick, se sube. */
  scheduledFor: string;
  status: UploadStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  jobId?: string;
  youtubeVideoId?: string;
  failReason?: string;
}

interface State {
  version: 1;
  items: ScheduledUpload[];
}

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function empty(): State {
  return { version: 1, items: [] };
}

export function readSchedule(): State {
  if (!existsSync(FILE)) return empty();
  try {
    const raw = readFileSync(FILE, 'utf-8');
    const parsed = JSON.parse(raw) as State;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items)) return empty();
    return parsed;
  } catch {
    return empty();
  }
}

function save(s: State) {
  ensureDir();
  writeFileSync(FILE, JSON.stringify(s, null, 2), 'utf-8');
}

export interface AddUploadOptions {
  videoFolder: string;
  videoTitle: string;
  channel: string;
  title: string;
  description: string;
  tags: string[];
  thumbnailFilename: string;
  privacyOnPublish: Privacy;
  scheduledFor: string;
}

export function addUpload(opts: AddUploadOptions): ScheduledUpload {
  const s = readSchedule();
  const item: ScheduledUpload = {
    id: randomUUID(),
    videoFolder: opts.videoFolder,
    videoTitle: opts.videoTitle,
    channel: opts.channel,
    title: opts.title,
    description: opts.description,
    tags: opts.tags,
    thumbnailFilename: opts.thumbnailFilename,
    privacyOnPublish: opts.privacyOnPublish,
    scheduledFor: opts.scheduledFor,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  s.items.push(item);
  save(s);
  tickScheduler();
  return item;
}

export function cancelUpload(id: string): boolean {
  const s = readSchedule();
  const item = s.items.find((i) => i.id === id);
  if (!item) return false;
  if (item.status === 'pending') {
    item.status = 'cancelled';
    item.finishedAt = new Date().toISOString();
    save(s);
    return true;
  }
  if (item.status === 'uploading' && item.jobId) {
    try {
      const jobPath = path.join(jobsDirFor(item.videoFolder), `${item.jobId}.json`);
      cancelJob(jobPath);
    } catch {}
    item.status = 'cancelled';
    item.finishedAt = new Date().toISOString();
    save(s);
    return true;
  }
  return false;
}

export function removeUpload(id: string): boolean {
  const s = readSchedule();
  const before = s.items.length;
  s.items = s.items.filter((i) => i.id !== id || i.status === 'uploading');
  if (s.items.length !== before) {
    save(s);
    return true;
  }
  return false;
}

function buildUploadPrompt(item: ScheduledUpload): string {
  return `Sube el vídeo "${item.videoTitle}" del canal ${item.channel} a YouTube usando la skill \`youtube-seo-optimizer\`.

Carpeta del proyecto: ${item.videoFolder}

METADATA EXACTA A APLICAR (NO modifiques, ya está validada por el usuario):

**Título YouTube**:
${item.title}

**Descripción**:
${item.description}

**Tags**:
${item.tags.join(', ')}

**Miniatura**: ${item.videoFolder}/_PACKAGING/MINIATURAS/${item.thumbnailFilename}

**Privacy**: ${item.privacyOnPublish}

Pasos:
1. Verifica OAuth válido de YouTube. Si falta, aborta con error claro.
2. Localiza el render principal en ${item.videoFolder}/RENDER/ (.mp4 > 50MB, NO los Shorts).
3. Sube el vídeo con la metadata exacta de arriba. Privacy: ${item.privacyOnPublish}.
4. Sube la miniatura indicada.
5. Devuelve el video ID y la URL.

NO modifiques la metadata. Si tienes dudas sobre algún campo, repórtalas y aborta.

Termina tu respuesta con:
\`\`\`
<<<YOUTUBE_VIDEO_ID: el-id-aquí>>>
<<<DONE>>>
\`\`\``;
}

/**
 * Tick: para cada upload pendiente cuya fecha ya llegó, lanza el upload.
 * Para los uploading, comprueba estado y marca done/failed.
 */
export function tickScheduler(): State {
  const s = readSchedule();
  let dirty = false;
  const now = Date.now();

  // 1) Estado de los uploading
  for (const item of s.items) {
    if (item.status !== 'uploading') continue;
    if (!item.jobId) {
      item.status = 'failed';
      item.failReason = 'sin jobId';
      item.finishedAt = new Date().toISOString();
      dirty = true;
      continue;
    }
    const jobPath = path.join(jobsDirFor(item.videoFolder), `${item.jobId}.json`);
    const job = readJob(jobPath);
    if (!job) {
      item.status = 'failed';
      item.failReason = 'job desapareció';
      item.finishedAt = new Date().toISOString();
      dirty = true;
      continue;
    }
    if (job.status === 'done') {
      // Intentar extraer YOUTUBE_VIDEO_ID del log si está
      try {
        const log = readFileSync(job.logPath, 'utf-8');
        const m = log.match(/<<<YOUTUBE_VIDEO_ID:\s*([a-zA-Z0-9_-]{6,32})\s*>>>/);
        if (m) item.youtubeVideoId = m[1];
      } catch {}
      item.status = 'done';
      item.finishedAt = job.finishedAt ?? new Date().toISOString();
      dirty = true;
    } else if (job.status === 'failed' || job.status === 'timeout' || job.status === 'cancelled') {
      item.status = 'failed';
      item.failReason = job.status;
      item.finishedAt = job.finishedAt ?? new Date().toISOString();
      dirty = true;
    }
  }

  // 2) Lanzar pending cuya fecha ya llegó
  for (const item of s.items) {
    if (item.status !== 'pending') continue;
    const scheduledMs = new Date(item.scheduledFor).getTime();
    if (Number.isNaN(scheduledMs) || scheduledMs > now) continue;
    try {
      const job = startJob({
        skill: 'upload-youtube',
        label: `Upload: ${item.videoTitle}`,
        prompt: buildUploadPrompt(item),
        cwd: JARVIS_ROOT,
        timeoutMs: 30 * 60 * 1000,
        videoFolder: item.videoFolder,
        model: 'sonnet',
      });
      item.status = 'uploading';
      item.jobId = job.jobId;
      item.startedAt = job.startedAt;
      dirty = true;
    } catch (e) {
      item.status = 'failed';
      item.failReason = e instanceof Error ? e.message : String(e);
      item.finishedAt = new Date().toISOString();
      dirty = true;
    }
  }

  if (dirty) save(s);
  return s;
}
