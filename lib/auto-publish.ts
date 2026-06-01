// Detector de auto-subida OCULTA (unlisted) — 100% hands-off.
//
// Recorre los canales con `autoPublishUnlisted` (solo moderni-stoici de momento)
// y, en cuanto un vídeo está COMPLETO (render + miniatura + packaging), IDLE (sin
// jobs claude vivos) y con el render estable, lo encola para subir a YouTube como
// `unlisted` con todo el packaging. El motor de subida (lib/upload-schedule.ts)
// hace la subida real vía upload.py y, al terminar, avisa a Pablo por Telegram
// para que lo programe desde el móvil.
//
// Idempotente: no re-encola un vídeo ya publicado (marcador + dedupe por carpeta).
// Disparado por el poller de Electron (/api/auto-publish/tick) y, como backstop,
// por el GET de la lista de vídeos del kanban.

import 'server-only';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CHANNELS, type Channel } from './channels';
import { computeProgress, THUMB_MIN_ASPECT } from './progress';
import { readImageSize } from './image-size';
import { listActiveJobsForFolder } from './claude-jobs';
import { extractMetadata } from './extract-metadata';
import { addUpload, hasUploadForFolder } from './upload-schedule';
import { sendTelegram, escapeHtml } from './notify';

/** Marcador (en _PACKAGING/) de que el vídeo ya se encoló para auto-subida. */
const MARKER = '.auto-published.json';
/** Marcador de "saltado" (p.ej. sin título extraíble) para no spamear avisos. */
const SKIP_MARKER = '.auto-publish-skipped';
/** El render debe llevar quieto este tiempo (no estar a medio escribir). */
const RENDER_STABLE_MS = 90 * 1000;
const RENDER_MIN_BYTES = 50 * 1024 * 1024;
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv']);
/** Carpeta donde LUÍS deja los renders terminados (fuera de los estados del kanban). */
const REVIEW_FOLDER = 'PENDIENTE DE REVISAR';

const STATE_DIR = path.join(os.homedir(), '.yt-content-pipeline');
/** Flag de "ya se hizo el baseline de la primera activación". */
const STATE_FILE = path.join(STATE_DIR, 'auto-publish-state.json');

function isEnabled(): boolean {
  return process.env.YTCP_AUTOPUBLISH_ENABLED !== '0';
}
function isDryRun(): boolean {
  return process.env.YTCP_AUTOPUBLISH_DRYRUN === '1';
}

export interface AutoPublishResult {
  channel: string;
  videoTitle: string;
  videoFolder: string;
  action: 'enqueued' | 'skipped-no-title' | 'dry-run';
  uploadId?: string;
  title?: string;
}

/** Carpetas (no terminales) donde puede aparecer un vídeo terminado. */
function candidateStateFolders(channel: Channel): string[] {
  const set = new Set<string>();
  for (const key of ['pending_locution', 'production', 'ready'] as const) {
    const f = channel.stateFolders[key];
    if (f) set.add(f);
  }
  set.add(REVIEW_FOLDER);
  return [...set];
}

async function newestRender(videoFolder: string): Promise<{ path: string; mtimeMs: number } | null> {
  const renderDir = path.join(videoFolder, 'RENDER');
  let files: string[];
  try {
    files = await readdir(renderDir);
  } catch {
    return null;
  }
  let best: { path: string; mtimeMs: number } | null = null;
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (!VIDEO_EXT.has(ext)) continue;
    if (/^Short\s+\d/i.test(f)) continue;
    const p = path.join(renderDir, f);
    const s = await stat(p).catch(() => null);
    if (!s || !s.isFile() || s.size < RENDER_MIN_BYTES) continue;
    if (!best || s.mtimeMs > best.mtimeMs) best = { path: p, mtimeMs: s.mtimeMs };
  }
  return best;
}

/** ¿La imagen es landscape (≈16:9)? No medible → true (fallback conservador, no
 *  descartar). Medible y por debajo del umbral (cuadrada 1:1 / vertical) → false. */
async function isLandscapeThumb(filePath: string): Promise<boolean> {
  const size = await readImageSize(filePath);
  if (!size || size.height <= 0) return true;
  return size.width / size.height >= THUMB_MIN_ASPECT;
}

async function pickThumbnail(packagingDir: string): Promise<string | null> {
  const minisDir = path.join(packagingDir, 'MINIATURAS');
  // 1) miniatura marcada como elegida (.selected-thumb) — SOLO si es landscape.
  try {
    const sel = (await readFile(path.join(minisDir, '.selected-thumb'), 'utf-8')).trim();
    const selPath = path.join(minisDir, sel);
    if (sel && existsSync(selPath) && (await isLandscapeThumb(selPath))) return sel;
  } catch {}
  // 2) la más reciente que sea LANDSCAPE. CLAVE: en una subida 100% hands-off NO
  //    podemos subir una miniatura CUADRADA (1:1). El hito 'miniaturaFinal' valida
  //    que EXISTE una landscape, pero antes esto cogía la más reciente por mtime
  //    aunque fuera 1:1 → validaba una imagen y subía otra inválida. Ahora filtra.
  let files: string[];
  try {
    files = await readdir(minisDir);
  } catch {
    return null;
  }
  let best: { name: string; mtimeMs: number } | null = null;
  for (const f of files) {
    if (!IMAGE_EXT.has(path.extname(f).toLowerCase())) continue;
    const full = path.join(minisDir, f);
    const s = await stat(full).catch(() => null);
    if (!s || !s.isFile()) continue;
    if (!(await isLandscapeThumb(full))) continue; // descarta cuadradas/verticales medibles
    if (!best || s.mtimeMs > best.mtimeMs) best = { name: f, mtimeMs: s.mtimeMs };
  }
  return best?.name ?? null;
}

async function considerVideo(
  channel: Channel,
  videoFolder: string,
  name: string,
): Promise<AutoPublishResult | null> {
  const st = await stat(videoFolder).catch(() => null);
  if (!st || !st.isDirectory()) return null;

  const packagingDir = path.join(videoFolder, '_PACKAGING');
  if (existsSync(path.join(packagingDir, MARKER))) return null; // ya encolado
  if (existsSync(path.join(packagingDir, SKIP_MARKER))) return null; // saltado antes

  const normFolder = videoFolder.replace(/\\/g, '/');
  if (hasUploadForFolder(normFolder)) return null; // ya hay subida para esta carpeta

  // ¿Completo? render principal + miniatura + packaging.md
  if (!(await isComplete(videoFolder))) return null;

  // ¿Idle? Sin jobs claude vivos (SARA/LUÍS/etc. trabajando todavía).
  if (listActiveJobsForFolder(normFolder).length > 0) return null;

  // ¿Render estable? (no a medio escribir)
  const render = await newestRender(videoFolder);
  if (!render || Date.now() - render.mtimeMs < RENDER_STABLE_MS) return null;

  // Metadata: título + miniatura viven en packaging.md; descripción + tags suelen
  // vivir en seo-package.md / descripcion-seo.md (raíz del vídeo). Combinamos ambos
  // (packaging primero → su título ELEGIDO gana) para que extractMetadata saque todo.
  const packagingMd = await readFile(path.join(packagingDir, 'packaging.md'), 'utf-8').catch(() => '');
  let seoMd = '';
  for (const fname of ['seo-package.md', 'descripcion-seo.md', 'seo.md']) {
    const s = await readFile(path.join(videoFolder, fname), 'utf-8').catch(() => '');
    if (s) { seoMd = s; break; }
  }
  const meta = extractMetadata(seoMd ? `${packagingMd}\n\n${seoMd}` : packagingMd);
  if (!meta.title || meta.title.trim().length < 3) {
    // Degradación segura: avisar UNA vez y no volver a intentarlo.
    if (!isDryRun()) {
      try {
        writeFileSync(
          path.join(packagingDir, SKIP_MARKER),
          JSON.stringify({ at: new Date().toISOString(), reason: 'no-title' }, null, 2),
          'utf-8',
        );
      } catch {}
      await sendTelegram(
        `⚠️ <b>${escapeHtml(name)}</b> (${escapeHtml(channel.name)}) está listo para subir pero no pude ` +
          `extraer el título del packaging.md. Súbelo a mano desde la app.`,
      );
    }
    return { channel: channel.slug, videoTitle: name, videoFolder: normFolder, action: 'skipped-no-title' };
  }

  const thumb = await pickThumbnail(packagingDir);
  if (!thumb) return null; // por seguridad (miniaturaFinal era true)

  if (isDryRun()) {
    return {
      channel: channel.slug,
      videoTitle: name,
      videoFolder: normFolder,
      action: 'dry-run',
      title: meta.title,
    };
  }

  const item = addUpload({
    videoFolder: normFolder,
    videoTitle: name,
    channel: channel.slug,
    title: meta.title,
    description: meta.description,
    tags: meta.tags,
    thumbnailFilename: thumb,
    privacyOnPublish: 'unlisted',
    scheduledFor: new Date().toISOString(),
    auto: true,
  });

  try {
    writeFileSync(
      path.join(packagingDir, MARKER),
      JSON.stringify(
        { enqueuedAt: new Date().toISOString(), uploadId: item.id, title: meta.title, privacy: 'unlisted' },
        null,
        2,
      ),
      'utf-8',
    );
  } catch {}

  return {
    channel: channel.slug,
    videoTitle: name,
    videoFolder: normFolder,
    action: 'enqueued',
    uploadId: item.id,
    title: meta.title,
  };
}

/** ¿El vídeo está completo para subir? render principal + miniatura + packaging.md. */
async function isComplete(videoFolder: string): Promise<boolean> {
  const prog = await computeProgress(videoFolder);
  return !!(prog.details.renderPrincipal && prog.details.miniaturaFinal && prog.details.hasPackagingMd);
}

/**
 * Primera activación: NO subir el backlog ya existente. Marca como baseline los
 * vídeos que YA están completos al activar la feature, para que solo se auto-suban
 * los que se COMPLETEN a partir de ahora. Misma filosofía "empezar limpio" que
 * lib/seen-states.ts. Devuelve true si baseló en este tick (el caller corta).
 */
async function ensureBaseline(): Promise<boolean> {
  if (isDryRun()) return false; // dry-run no escribe nada
  if (existsSync(STATE_FILE)) return false;
  let marked = 0;
  for (const channel of CHANNELS) {
    if (!channel.enabled || !channel.autoPublishUnlisted) continue;
    for (const stateFolder of candidateStateFolders(channel)) {
      const base = path.join(channel.rootPath, stateFolder);
      let names: string[];
      try {
        names = await readdir(base);
      } catch {
        continue;
      }
      for (const name of names) {
        if (channel.ignoreFolders.includes(name)) continue;
        const packagingDir = path.join(base, name, '_PACKAGING');
        if (!existsSync(packagingDir)) continue;
        if (existsSync(path.join(packagingDir, MARKER))) continue;
        try {
          if (await isComplete(path.join(base, name))) {
            writeFileSync(
              path.join(packagingDir, MARKER),
              JSON.stringify({ baseline: true, at: new Date().toISOString() }, null, 2),
              'utf-8',
            );
            marked++;
          }
        } catch {}
      }
    }
  }
  try {
    if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(
      STATE_FILE,
      JSON.stringify({ baselinedAt: new Date().toISOString(), marked }, null, 2),
      'utf-8',
    );
  } catch {}
  return true;
}

/**
 * Escanea todos los canales con `autoPublishUnlisted` y encola la subida oculta
 * de los vídeos completos+idle que aún no se hayan publicado. Idempotente.
 */
export async function runAutoPublishTick(): Promise<AutoPublishResult[]> {
  if (!isEnabled()) return [];
  // Primera activación: solo baseline del backlog existente, sin subir nada.
  if (await ensureBaseline()) return [];
  const results: AutoPublishResult[] = [];
  for (const channel of CHANNELS) {
    if (!channel.enabled || !channel.autoPublishUnlisted) continue;
    for (const stateFolder of candidateStateFolders(channel)) {
      const base = path.join(channel.rootPath, stateFolder);
      let names: string[];
      try {
        names = await readdir(base);
      } catch {
        continue; // carpeta no existe en este canal
      }
      for (const name of names) {
        if (channel.ignoreFolders.includes(name)) continue;
        try {
          const r = await considerVideo(channel, path.join(base, name), name);
          if (r) results.push(r);
        } catch {
          // un vídeo problemático no debe tumbar el tick entero
        }
      }
    }
  }
  return results;
}
