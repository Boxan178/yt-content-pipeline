// Scheduler local de uploads a YouTube. La app se encarga de subir el vídeo
// cuando llega la hora; YouTube NO lo programa. Esto sortea el límite de 30
// días y la restricción `private → public` del scheduling nativo.
//
// Motor: invoca DIRECTO el engine de la skill youtube-uploader
// (lab/youtube-uploader/upload.py vía su venv) — sin pasar por `claude -p`.
// Determinista, barato y fiable: sube título + descripción + tags + miniatura
// en una sola llamada. Ver lib/config.ts (YOUTUBE_UPLOADER_*).
//
// Persistencia: ~/.yt-content-pipeline/scheduled-uploads.json
// Worker: lazy. El tick ocurre al pedir GET /api/uploads (cliente polleia) y
// desde el poller en background de Electron (/api/auto-publish/tick).

import 'server-only';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { rename } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isPidAlive, killPid } from './claude-jobs';
import { getChannel } from './channels';
import { notifyUploadDone, notifyUploadFailed } from './notify';
import { YOUTUBE_UPLOADER_DIR, YOUTUBE_UPLOADER_PY, YOUTUBE_UPLOADER_PYTHON } from './config';

const DIR = path.join(os.homedir(), '.yt-content-pipeline');
const FILE = path.join(DIR, 'scheduled-uploads.json');

const RENDER_MIN_BYTES = 50 * 1024 * 1024;
const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv']);

// Engine youtube-uploader: defaults desde config + overrides por env (tests).
const UPLOADER_DIR = process.env.YOUTUBE_UPLOADER_DIR || YOUTUBE_UPLOADER_DIR;
const UPLOADER_PY = process.env.YOUTUBE_UPLOADER_PY || YOUTUBE_UPLOADER_PY;
const UPLOADER_PYTHON = process.env.YOUTUBE_UPLOADER_PYTHON || YOUTUBE_UPLOADER_PYTHON;

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
  /** ISO 8601. Si es <= now al tick, se sube (cuándo la APP sube el archivo). */
  scheduledFor: string;
  /**
   * ISO 8601 opcional — PROGRAMACIÓN NATIVA de YouTube. Si está, el vídeo se
   * sube como `private` con `publishAt` y YouTube lo hace público SOLO a esta
   * hora, SIN necesidad de que el PC esté encendido a esa hora (lo hace YouTube).
   * Fuerza privacy 'public' (publishAt es incompatible con unlisted en upload.py).
   */
  publishAt?: string;
  status: UploadStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  /** PID del proceso upload.py (motor directo). */
  pid?: number;
  /** Path del log del proceso de subida. */
  logPath?: string;
  /** Subida creada por el detector automático (lib/auto-publish.ts). */
  auto?: boolean;
  /** Ya se mandó la notificación de cierre (evita avisos duplicados). */
  notified?: boolean;
  youtubeVideoId?: string;
  failReason?: string;
  /** @deprecated motor antiguo basado en `claude -p`. Solo lectura legacy. */
  jobId?: string;
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
  /** ISO 8601 opcional: publishAt nativo de YouTube (ver ScheduledUpload). */
  publishAt?: string;
  /** Marca la subida como creada por el detector automático. */
  auto?: boolean;
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
    publishAt: opts.publishAt,
    status: 'pending',
    createdAt: new Date().toISOString(),
    auto: opts.auto,
  };
  s.items.push(item);
  save(s);
  void tickScheduler().catch(() => {});
  return item;
}

/**
 * ¿Hay ya una subida para esta carpeta en alguno de los estados dados? Lo usa el
 * detector automático para no encolar dos veces el mismo vídeo.
 */
export function hasUploadForFolder(
  videoFolder: string,
  statuses: UploadStatus[] = ['pending', 'uploading', 'done'],
): boolean {
  // normalize('NFC') porque el dominio está lleno de acentos/em-dash (Ó, —) y la
  // misma carpeta puede llegar en distinta forma Unicode (readdir vs string del
  // cliente de subida manual). Sin esto el dedupe falla → 2ª subida a YouTube.
  const norm = videoFolder.replace(/\\/g, '/').normalize('NFC');
  return readSchedule().items.some(
    (i) => i.videoFolder.replace(/\\/g, '/').normalize('NFC') === norm && statuses.includes(i.status),
  );
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
  if (item.status === 'uploading') {
    if (item.pid) {
      try { killPid(item.pid); } catch {}
    }
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

/** Localiza el render principal de la carpeta: .mp4/.mov/.mkv ≥ 50MB, no "Short N". */
function findRenderPrincipal(videoFolder: string): string | null {
  const renderDir = path.join(videoFolder, 'RENDER');
  let files: string[];
  try {
    files = readdirSync(renderDir);
  } catch {
    return null;
  }
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (!VIDEO_EXT.has(ext)) continue;
    if (/^Short\s+\d/i.test(f)) continue;
    try {
      const s = statSync(path.join(renderDir, f));
      if (s.isFile() && s.size >= RENDER_MIN_BYTES) return path.join(renderDir, f);
    } catch {}
  }
  return null;
}

/**
 * YouTube rechaza el upload (`invalidTags`, HTTP 400) si el total EFECTIVO de tags
 * supera ~500 chars; los tags con espacios cuentan +2 (YouTube los envuelve en
 * comillas). Recorta por orden (los primeros son los más relevantes en el seo) con
 * margen de seguridad. Sin esto, un vídeo con muchos tags multi-palabra (caso real:
 * 25 tags ≈ 509 efectivos) tumba la subida automática entera.
 */
function trimTagsForYouTube(tags: string[]): string[] {
  const eff = (t: string) => t.length + (t.includes(' ') ? 2 : 0);
  const out: string[] = [];
  let total = 0;
  for (const t of tags) {
    const add = eff(t) + (out.length ? 1 : 0); // +1 por la coma separadora
    if (total + add > 450) break;
    out.push(t);
    total += add;
  }
  return out;
}

/** Spawnea upload.py detached. Devuelve pid + logPath. Lanza si falta el render. */
function launchUpload(item: ScheduledUpload): { pid: number; logPath: string } {
  const jobsDir = path.join(item.videoFolder, '.upload-jobs');
  if (!existsSync(jobsDir)) mkdirSync(jobsDir, { recursive: true });
  const logPath = path.join(jobsDir, `${item.id}.log`);
  const descPath = path.join(jobsDir, `${item.id}.description.txt`);
  writeFileSync(descPath, item.description ?? '', 'utf-8');

  const renderFile = findRenderPrincipal(item.videoFolder);
  if (!renderFile) throw new Error('No se encontró render principal (.mp4 ≥ 50MB) en RENDER/');

  // publishAt = programación NATIVA de YouTube: se sube como private + --publish-at
  // y YouTube lo flipa a público a esa hora (sin PC). Exige privacidad 'public'.
  const effectivePrivacy: Privacy = item.publishAt ? 'public' : item.privacyOnPublish;
  const args: string[] = [
    UPLOADER_PY,
    '--channel', item.channel,
    '--file', renderFile,
    '--title', item.title || item.videoTitle,
    '--description-file', descPath,
    '--privacy', effectivePrivacy,
  ];
  if (item.publishAt) args.push('--publish-at', item.publishAt);
  const ytTags = trimTagsForYouTube(item.tags ?? []);
  if (ytTags.length) args.push('--tags', ytTags.join(','));
  const thumbPath = item.thumbnailFilename
    ? path.join(item.videoFolder, '_PACKAGING', 'MINIATURAS', item.thumbnailFilename)
    : '';
  if (thumbPath && existsSync(thumbPath)) args.push('--thumbnail', thumbPath);

  writeFileSync(
    logPath,
    `[ytcp upload] startedAt=${new Date().toISOString()}\n` +
      `[ytcp upload] channel=${item.channel} privacy=${effectivePrivacy}${item.publishAt ? ` publishAt=${item.publishAt}` : ''} auto=${!!item.auto}\n` +
      `[ytcp upload] file=${renderFile}\n` +
      `[ytcp upload] thumb=${thumbPath && existsSync(thumbPath) ? thumbPath : '(none)'}\n\n` +
      `--- upload.py output ---\n\n`,
    'utf-8',
  );
  const out = openSync(logPath, 'a');
  const err = openSync(logPath, 'a');
  let child;
  try {
    child = spawn(UPLOADER_PYTHON, args, {
      cwd: UPLOADER_DIR,
      shell: false,
      detached: false,
      windowsHide: true,
      stdio: ['ignore', out, err],
    });
  } catch (e) {
    try { closeSync(out); closeSync(err); } catch {}
    throw new Error(`spawn upload.py falló: ${e instanceof Error ? e.message : String(e)}`);
  }
  try { closeSync(out); closeSync(err); } catch {}
  if (!child.pid) throw new Error('spawn upload.py no devolvió PID');
  child.unref();
  return { pid: child.pid, logPath };
}

/** Parsea el log de upload.py buscando el video_id. */
function parseUploadLog(logPath?: string): { videoId?: string; error?: string } {
  if (!logPath) return { error: 'sin log' };
  let log: string;
  try {
    log = readFileSync(logPath, 'utf-8');
  } catch {
    return { error: 'log no legible' };
  }
  const m =
    log.match(/Done\.\s*Video ID:\s*([A-Za-z0-9_-]{6,})/) ||
    log.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (m) return { videoId: m[1] };
  const tail = log.split(/\r?\n/).filter(Boolean).slice(-6).join(' ').slice(-300);
  return { error: tail || 'upload.py terminó sin video_id' };
}

/** Mueve la carpeta a `_LISTOS PARA SUBIR` si no está ya ahí. Devuelve la nueva ruta. */
async function moveToReady(item: ScheduledUpload): Promise<string | null> {
  const channel = getChannel(item.channel);
  if (!channel) return null;
  const readyFolder = channel.stateFolders.ready;
  if (!readyFolder) return null;
  const src = item.videoFolder;
  const normSrc = src.replace(/\\/g, '/');
  const parentName = path.basename(path.dirname(normSrc));
  if (parentName === readyFolder) return null; // ya está en ready
  const folderName = path.basename(normSrc);
  const dst = path.join(channel.rootPath, readyFolder, folderName);
  if (existsSync(dst)) return null; // no pisar
  await rename(src, dst);
  return dst.replace(/\\/g, '/');
}

/** Cierre tras subida OK: notifica a Pablo (solo auto) y mueve a ready. */
async function onUploadDone(item: ScheduledUpload): Promise<void> {
  // Notificación + movimiento SOLO para subidas automáticas (las manuales las
  // conduce Pablo desde la app; no metemos ruido ni movemos sus carpetas).
  if (!item.auto) return;
  if (!item.notified) {
    const channel = getChannel(item.channel);
    try {
      await notifyUploadDone({
        channelName: channel?.name ?? item.channel,
        videoTitle: item.title || item.videoTitle,
        youtubeVideoId: item.youtubeVideoId,
        privacy: item.privacyOnPublish,
        publishAt: item.publishAt,
      });
    } catch {}
    item.notified = true;
  }
  // Mover a "ready" los que NO salen públicos de inmediato: ocultos, privados y
  // los PROGRAMADOS (public + publishAt, que están privados hasta su hora). Solo
  // el público-inmediato (sin publishAt) se queda donde está.
  if (item.privacyOnPublish !== 'public' || item.publishAt) {
    try {
      const newFolder = await moveToReady(item);
      if (newFolder) item.videoFolder = newFolder;
    } catch {}
  }
}

// Mutex simple: evita ticks reentrantes (poller Electron 60s + GET kanban +
// GET /api/uploads pollean a la vez) que con los await internos podrían
// doble-lanzar upload.py para el mismo vídeo → subida DUPLICADA a YouTube.
// Mismo patrón que lib/job-queue.ts. Todas las rutas API corren en el mismo
// proceso Next, así que un mutex module-level es efectivo.
let schedulerTicking = false;

/**
 * Tick: para cada upload pendiente cuya fecha ya llegó, lanza upload.py.
 * Para los uploading, comprueba el pid y marca done/failed parseando el log.
 * Reentrada protegida por mutex (evita doble subida).
 */
export async function tickScheduler(): Promise<State> {
  if (schedulerTicking) return readSchedule();
  schedulerTicking = true;
  try {
    return await tickSchedulerInner();
  } finally {
    schedulerTicking = false;
  }
}

async function tickSchedulerInner(): Promise<State> {
  const s = readSchedule();
  let dirty = false;
  const now = Date.now();
  const postActions: Array<() => Promise<void>> = [];

  // 1) Estado de los uploading
  for (const item of s.items) {
    if (item.status !== 'uploading') continue;
    if (!item.pid) {
      item.status = 'failed';
      item.failReason = 'sin pid (subida no lanzada)';
      item.finishedAt = new Date().toISOString();
      dirty = true;
      continue;
    }
    if (isPidAlive(item.pid)) continue; // sigue subiendo
    const parsed = parseUploadLog(item.logPath);
    if (parsed.videoId) {
      item.status = 'done';
      item.youtubeVideoId = parsed.videoId;
      item.finishedAt = new Date().toISOString();
      dirty = true;
      postActions.push(() => onUploadDone(item));
    } else {
      item.status = 'failed';
      item.failReason = parsed.error;
      item.finishedAt = new Date().toISOString();
      dirty = true;
      // Aviso de fallo SOLO para subidas automáticas (hands-off): sin esto una
      // subida auto que falla (OAuth caducado, render movido…) se queda en
      // silencio y Pablo no se entera de que el vídeo no se publicó. Las manuales
      // las conduce él desde la UI, donde ya ve el fallo.
      if (item.auto && !item.notified) {
        item.notified = true;
        const ch = getChannel(item.channel);
        const failTitle = item.title || item.videoTitle;
        const failReason = item.failReason ?? 'desconocido';
        postActions.push(() =>
          notifyUploadFailed({ channelName: ch?.name ?? item.channel, videoTitle: failTitle, reason: failReason }).then(() => undefined),
        );
      }
    }
  }

  // 2) Lanzar pending cuya fecha ya llegó
  for (const item of s.items) {
    if (item.status !== 'pending') continue;
    const scheduledMs = new Date(item.scheduledFor).getTime();
    if (Number.isNaN(scheduledMs) || scheduledMs > now) continue;
    try {
      const { pid, logPath } = launchUpload(item);
      item.status = 'uploading';
      item.pid = pid;
      item.logPath = logPath;
      item.startedAt = new Date().toISOString();
      dirty = true;
      // Persistir YA: si el proceso muere entre el spawn y el save final, este
      // item no debe re-lanzarse como 'pending' en el próximo tick (= 2ª subida).
      save(s);
    } catch (e) {
      item.status = 'failed';
      item.failReason = e instanceof Error ? e.message : String(e);
      item.finishedAt = new Date().toISOString();
      dirty = true;
    }
  }

  if (dirty) save(s);
  // Acciones post-cierre (notificar + mover). Mutan item.videoFolder → re-guardar.
  if (postActions.length) {
    for (const a of postActions) {
      try { await a(); } catch {}
    }
    save(s);
  }
  return s;
}
