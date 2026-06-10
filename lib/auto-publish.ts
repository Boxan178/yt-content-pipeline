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
import { existsSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CHANNELS, type Channel } from './channels';
import { computeProgress, THUMB_MIN_ASPECT } from './progress';
import { readImageSize } from './image-size';
import { listActiveJobsForFolder } from './claude-jobs';
import { extractMetadata, looksLikeFilename } from './extract-metadata';
import { getVaultSeo } from './vault-seo';
import { ensureVaultPackagingSynced } from './vault-sync';
import { addUpload, hasUploadForFolder, type Privacy } from './upload-schedule';
import { readScheduleCache } from './youtube-schedule';
import { sendTelegram, escapeHtml } from './notify';
import { readContentCalendar, updatePlanned } from './content-calendar';
import { getCadence } from './channel-cadence';
import { cadenceSlots, type PlannedItem } from './calendar-types';

/** Marcador (en _PACKAGING/) de que el vídeo ya se encoló para auto-subida. */
const MARKER = '.auto-published.json';
/** Marcador de "saltado" (p.ej. sin título extraíble) para no spamear avisos. */
const SKIP_MARKER = '.auto-publish-skipped';
/** Marcador "listo pero SIN descripción SEO" (throttle del aviso, NO bloquea:
 *  cada tick reintenta y, en cuanto aparezca el SEO, se sube). Evita publicar
 *  público un vídeo sin descripción/tags (caso real: 90 días, 2026-06-08). */
const NO_SEO_MARKER = '.pending-seo.json';
/** Marcador de "listo pero SIN fecha de publicación" (throttle del aviso al CEO).
 *  NO bloquea: cada tick reintenta y, en cuanto hay fecha en el calendario, sube. */
const PENDING_MARKER = '.pending-schedule';
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
/** Kill-switch de la programación NATIVA por calendario. Si '0', el detector
 *  NUNCA programa público por calendario → todo cae a OCULTO (comportamiento
 *  seguro previo). Permite desactivar la auto-publicación pública de golpe. */
function calendarScheduleEnabled(): boolean {
  return process.env.YTCP_CALENDAR_SCHEDULE_ENABLED !== '0';
}
/** Margen mínimo: si la fecha planificada está a menos de esto en el futuro, se
 *  trata como "pasada/demasiado próxima" — upload.py rechaza publishAt <= now y
 *  la subida tarda varios minutos, así que no daría tiempo. */
const OVERDUE_MARGIN_MS = 10 * 60 * 1000;
/** Marcador (en _PACKAGING/) de "su fecha ya pasó, pendiente de reprogramar".
 *  Dedupe del aviso para no repetirlo en cada tick mientras la fecha no cambie. */
const RESCHEDULE_MARKER = '.reschedule-pending.json';

export interface AutoPublishResult {
  channel: string;
  videoTitle: string;
  videoFolder: string;
  action: 'enqueued' | 'skipped-no-title' | 'skipped-no-seo' | 'skipped-already-on-youtube' | 'dry-run' | 'scheduled' | 'overdue-reschedule' | 'pending-schedule';
  uploadId?: string;
  title?: string;
  /** Si se programó nativo en YouTube: ISO (UTC) en que sale público. */
  publishAt?: string;
  /** Privacidad con la que se encoló ('unlisted' por defecto, 'public' si programado). */
  privacy?: Privacy;
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

// ── Anti-duplicado contra YouTube ────────────────────────────────────────────

/** Clave de título normalizada para comparar contra YouTube (sin acentos ni
 *  puntuación, espacios colapsados). */
function ytTitleKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** ¿Existe ya en el canal un vídeo con alguno de estos títulos? Compara contra el
 *  cache real de YouTube (RSS + Data API, lib/youtube-schedule.ts). Red de
 *  seguridad contra RE-SUBIR un vídeo ya publicado (caso real 2026-06-10: Pablo
 *  movió a "_LISTOS PARA SUBIR" un vídeo ya en YouTube y la app subió un
 *  duplicado). Cache vacío/no sincronizado → no bloquea (no inventa). */
function alreadyOnYouTube(channelSlug: string, candidates: Array<string | undefined>): string | null {
  const entry = readScheduleCache().channels[channelSlug];
  if (!entry || !entry.items.length) return null;
  const published = new Map<string, string>();
  for (const it of entry.items) {
    if (it.title) published.set(ytTitleKey(it.title), it.title);
  }
  for (const c of candidates) {
    if (!c) continue;
    const k = ytTitleKey(c);
    if (k.length >= 8 && published.has(k)) return published.get(k) ?? c;
  }
  return null;
}

// ── Programación calendar-aware (publishAt NATIVO de YouTube) ───────────────

/** Clave de título normalizada (sin caracteres ilegales de carpeta, minúsculas)
 *  para casar planificado ↔ carpeta de vídeo sin falsos negativos por mayúsculas. */
function normalizeTitleKey(title: string): string {
  return title.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** ISO (UTC Z) que upload.py acepta, desde la fecha planificada. Solo-fecha →
 *  hora de cadencia del canal (default 12) en LOCAL. datetime sin tz → LOCAL (tz
 *  del PC de Pablo). datetime con tz → se respeta. null si no parsea. */
function plannedDateToUtc(dateStr: string, channelSlug: string): string | null {
  let s = (dateStr || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const cad = getCadence(channelSlug);
    const slot = cadenceSlots(cad ?? {}).at(0) ?? { h: 12, m: 0 };
    s = `${s}T${String(slot.h).padStart(2, '0')}:${String(slot.m).padStart(2, '0')}:00`; // local, sin tz
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString(); // UTC Z
}

/** Item planificado del calendario para esta carpeta. PRIMARIO: por videoFolder
 *  (lo enlaza start-pipeline; sobrevive a cambios de título de MARCOS/Pablo).
 *  FALLBACK: canal + título normalizado (carpeta o título final), SOLO sobre
 *  planificados aún SIN carpeta enlazada (p.ej. producidos fuera del calendario). */
function findPlanForVideo(normFolder: string, channelSlug: string, finalTitle: string): PlannedItem | null {
  const norm = normFolder.normalize('NFC');
  const folderBase = norm.split('/').pop() ?? '';
  const items = readContentCalendar().items;
  const byFolder = items.find(
    (p) => p.videoFolder && p.videoFolder.replace(/\\/g, '/').normalize('NFC') === norm,
  );
  if (byFolder) return byFolder;
  const wantA = normalizeTitleKey(folderBase);
  const wantB = normalizeTitleKey(finalTitle);
  return (
    items.find(
      (p) =>
        p.channel === channelSlug &&
        !p.videoFolder &&
        (normalizeTitleKey(p.title) === wantA || normalizeTitleKey(p.title) === wantB),
    ) ?? null
  );
}

/** Red de seguridad: la fecha planificada ya pasó (o está demasiado próxima). NO
 *  se publica a deshora; se avisa a Pablo (una vez por fecha, dedupe con marker)
 *  para que dé una hora nueva o lo mueva en /calendar. */
async function handleOverduePlan(channel: Channel, packagingDir: string, name: string, plan: PlannedItem): Promise<void> {
  const markerPath = path.join(packagingDir, RESCHEDULE_MARKER);
  try {
    const prev = JSON.parse(await readFile(markerPath, 'utf-8')) as { plannedDate?: string };
    if (prev?.plannedDate === plan.date) return; // ya avisado para esta misma fecha
  } catch {}
  try {
    writeFileSync(
      markerPath,
      JSON.stringify({ plannedDate: plan.date, at: new Date().toISOString() }, null, 2),
      'utf-8',
    );
  } catch {}
  let whenLocal = plan.date;
  try {
    const d = new Date(plan.date);
    if (!Number.isNaN(d.getTime())) {
      whenLocal = d.toLocaleString('es-ES', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  } catch {}
  await sendTelegram(
    `⏰ <b>${escapeHtml(name)}</b> (${escapeHtml(channel.name)}) está listo, pero su fecha ` +
      `planificada (<b>${escapeHtml(whenLocal)}</b>) ya pasó o está demasiado próxima para subirlo a tiempo.\n` +
      `Lo dejo SIN publicar para no sacarlo a deshora.\n` +
      `📌 Dame una fecha/hora futura (o muévelo en /calendar) y lo programo solo en YouTube.`,
  );
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

  // Sync vault → _PACKAGING (no destructivo): asegura packaging.md + descripcion-seo.md
  // en H: antes de leer metadata, por si el pipeline solo escribió en la vault.
  ensureVaultPackagingSynced(channel.slug, videoFolder);

  const normFolder = videoFolder.replace(/\\/g, '/');
  if (hasUploadForFolder(normFolder)) return null; // ya hay subida para esta carpeta

  // ¿Completo? render principal + miniatura + packaging.md
  if (!(await isComplete(videoFolder))) return null;

  // ¿Idle? Sin jobs claude vivos (SARA/LUÍS/etc. trabajando todavía).
  if (listActiveJobsForFolder(normFolder).length > 0) return null;

  // ¿Render estable? (no a medio escribir)
  const render = await newestRender(videoFolder);
  if (!render || Date.now() - render.mtimeMs < RENDER_STABLE_MS) return null;

  // Metadata: título + miniatura viven en packaging.md; descripción + tags viven en
  // descripcion-seo.md / seo-package.md DENTRO de _PACKAGING/ (convención real del
  // pipeline). Combinamos ambos (packaging primero → su título ELEGIDO gana) para
  // que extractMetadata saque todo.
  // FIX C2/B5 (auditoría 2026-06-05): el SEO real vive en `_PACKAGING/descripcion-seo.md`,
  // NO en la raíz del videoFolder. Antes esto buscaba en la raíz → la auto-subida
  // perdía descripción y tags (vídeos publicados SIN SEO). Buscamos en _PACKAGING/
  // primero y caemos a la raíz como fallback (vídeos antiguos), con búsqueda
  // multi-nombre (descripcion-seo.md y seo-package.md).
  const packagingMd = await readFile(path.join(packagingDir, 'packaging.md'), 'utf-8').catch(() => '');
  let seoMd = '';
  for (const dir of [packagingDir, videoFolder]) {
    for (const fname of ['descripcion-seo.md', 'seo-package.md', 'seo.md']) {
      const s = await readFile(path.join(dir, fname), 'utf-8').catch(() => '');
      if (s) { seoMd = s; break; }
    }
    if (seoMd) break;
  }
  let meta = extractMetadata(seoMd ? `${packagingMd}\n\n${seoMd}` : packagingMd);

  // ── Fallback a la VAULT ───────────────────────────────────────────────────
  // El SEO definitivo (título final + descripción + tags) lo escribe SARA en la
  // vault, no siempre en `_PACKAGING/`. Si el título parece basura (filename de
  // miniatura colado en el ELEGIDO) o falta la descripción, resolvemos el SEO de
  // la vault por pipeline_item_id. Ver lib/vault-seo.ts. Bug raíz: 90 días, 2026-06-08.
  const titleBad = !meta.title || meta.title.trim().length < 3 || looksLikeFilename(meta.title);
  const descMissing = !meta.description || meta.description.trim().length < 20;
  if (titleBad || descMissing) {
    const vault = getVaultSeo(channel.slug, videoFolder);
    if (vault) {
      meta = {
        title: titleBad ? (vault.title || meta.title) : meta.title,
        description: descMissing ? (vault.description || meta.description) : meta.description,
        tags: meta.tags.length ? meta.tags : vault.tags,
      };
    }
  }

  if (!meta.title || meta.title.trim().length < 3 || looksLikeFilename(meta.title)) {
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
          `extraer un título válido (ni del packaging ni de la vault). Súbelo a mano desde la app.`,
      );
    }
    return { channel: channel.slug, videoTitle: name, videoFolder: normFolder, action: 'skipped-no-title' };
  }

  // RED DE SEGURIDAD: el vídeo (mismo título) YA está en YouTube → marcar con el
  // MARKER y no volver a considerarlo NUNCA. Compara el título extraído Y el
  // nombre de carpeta contra el cache real del canal.
  const dupTitle = alreadyOnYouTube(channel.slug, [meta.title, name]);
  if (dupTitle) {
    if (!isDryRun()) {
      try {
        writeFileSync(
          path.join(packagingDir, MARKER),
          JSON.stringify(
            { baseline: true, reason: `already-on-youtube: ${dupTitle}`, at: new Date().toISOString() },
            null,
            2,
          ),
          'utf-8',
        );
      } catch {}
      await sendTelegram(
        `🛑 <b>${escapeHtml(name)}</b> (${escapeHtml(channel.name)}) NO se sube: en YouTube ya existe ` +
          `un vídeo con ese título ("${escapeHtml(dupTitle)}"). Lo marco para no reintentarlo. ` +
          `Si de verdad quieres subirlo otra vez, borra _PACKAGING/${MARKER} y cámbiale el título.`,
      );
    }
    return {
      channel: channel.slug,
      videoTitle: name,
      videoFolder: normFolder,
      action: 'skipped-already-on-youtube',
      title: meta.title,
    };
  }

  // RED DE SEGURIDAD: nunca publicar PÚBLICO un vídeo sin descripción SEO. Antes
  // esto subía con descripción vacía (vídeo público sin SEO). NO es permanente:
  // se avisa como mucho cada 6h y se reintenta cada tick — en cuanto el SEO
  // aparezca (en _PACKAGING o en la vault), se sube solo.
  if (!meta.description || meta.description.trim().length < 20) {
    if (!isDryRun()) {
      const noSeoPath = path.join(packagingDir, NO_SEO_MARKER);
      const recentlyWarned =
        existsSync(noSeoPath) && Date.now() - statSync(noSeoPath).mtimeMs < 6 * 60 * 60 * 1000;
      if (!recentlyWarned) {
        try {
          writeFileSync(
            noSeoPath,
            JSON.stringify({ at: new Date().toISOString(), reason: 'no-seo', title: meta.title }, null, 2),
            'utf-8',
          );
        } catch {}
        await sendTelegram(
          `📝 <b>${escapeHtml(name)}</b> (${escapeHtml(channel.name)}) está listo pero NO tiene descripción SEO ` +
            `(ni en _PACKAGING ni en la vault). No lo publico sin descripción. Genera el SEO o súbelo a mano.`,
        );
      }
    }
    return { channel: channel.slug, videoTitle: name, videoFolder: normFolder, action: 'skipped-no-seo', title: meta.title };
  }

  const thumb = await pickThumbnail(packagingDir);
  if (!thumb) return null; // por seguridad (miniaturaFinal era true)

  // ── Programación NATIVA de YouTube desde el calendario editorial ──────────
  // NUEVA ARQUITECTURA (Bug C): YA NO se sube a OCULTO por defecto. Un vídeo solo
  // se sube cuando tiene FECHA de publicación asignada (privado + publishAt →
  // YouTube lo hace público solo a esa hora). "Programar desde la idea" asigna el
  // hueco al arrancar el pipeline, así que para cuando el render termina la fecha
  // ya existe. Si la fecha pasó → red de seguridad (no publicar a deshora). Sin
  // fecha futura → NO se sube: se avisa al CEO para que le dé hueco en el calendario.
  let publishAt: string | undefined;
  let matchedPlan: PlannedItem | null = null;
  if (calendarScheduleEnabled()) {
    const plan = findPlanForVideo(normFolder, channel.slug, meta.title);
    if (plan && plan.date) {
      const utc = plannedDateToUtc(plan.date, channel.slug);
      if (utc && Date.parse(utc) > Date.now() + OVERDUE_MARGIN_MS) {
        publishAt = utc;
        matchedPlan = plan;
      } else if (utc) {
        // Fecha pasada o demasiado próxima: no publicar a deshora.
        if (!isDryRun()) await handleOverduePlan(channel, packagingDir, name, plan);
        return {
          channel: channel.slug,
          videoTitle: name,
          videoFolder: normFolder,
          action: 'overdue-reschedule',
          title: meta.title,
        };
      }
    }
  }

  // Sin fecha futura → NO subir (nada de oculto). Avisar al CEO como mucho cada 6h
  // y reintentar cada tick: en cuanto el calendario tenga fecha, se programa solo.
  if (!publishAt) {
    const pendPath = path.join(packagingDir, PENDING_MARKER);
    const recentlyWarned =
      existsSync(pendPath) && Date.now() - statSync(pendPath).mtimeMs < 6 * 60 * 60 * 1000;
    if (!isDryRun() && !recentlyWarned) {
      try {
        writeFileSync(
          pendPath,
          JSON.stringify({ at: new Date().toISOString(), reason: 'no-schedule', title: meta.title }, null, 2),
          'utf-8',
        );
      } catch {}
      await sendTelegram(
        `📅 <b>${escapeHtml(name)}</b> (${escapeHtml(channel.name)}) está listo pero NO tiene fecha de ` +
          `publicación asignada. Dale un hueco en el calendario y se programará solo.`,
      );
    }
    return {
      channel: channel.slug,
      videoTitle: name,
      videoFolder: normFolder,
      action: 'pending-schedule',
      title: meta.title,
    };
  }

  const privacy: Privacy = 'public'; // siempre programado: private + publishAt en YouTube

  if (isDryRun()) {
    return {
      channel: channel.slug,
      videoTitle: name,
      videoFolder: normFolder,
      action: 'dry-run',
      title: meta.title,
      publishAt,
      privacy,
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
    privacyOnPublish: privacy,
    scheduledFor: new Date().toISOString(),
    publishAt,
    auto: true,
  });

  // Enlazar + marcar el planificado 'scheduled' (refleja en /calendar + dedupe).
  if (matchedPlan) {
    try {
      updatePlanned(matchedPlan.id, { status: 'scheduled', videoFolder: normFolder });
    } catch {}
  }

  try {
    writeFileSync(
      path.join(packagingDir, MARKER),
      JSON.stringify(
        {
          enqueuedAt: new Date().toISOString(),
          uploadId: item.id,
          title: meta.title,
          privacy,
          ...(publishAt ? { publishAt, scheduled: true } : {}),
        },
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
    action: publishAt ? 'scheduled' : 'enqueued',
    uploadId: item.id,
    title: meta.title,
    publishAt,
    privacy,
  };
}

/** Rango de timestamps tipo (0:00–0:45): andamiaje seguro, jamás texto narrable. */
const SCAFFOLD_TIMESTAMP = /\(\s*\d{1,2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2}\s*\)/;
/** Corchetes con contenido: [PAUSE], [1]... tags que no se narran. */
const SCAFFOLD_BRACKET = /\[[^\]]+\]/;

/** Audita on-the-fly los subtítulos quemados (.ass) buscando andamiaje del guion.
 *  Fallback cuando no hay sello .render-qa.json (vídeos renderizados ANTES del gate
 *  de core/qa_subs.py). Replica el discriminador fiable: timestamps + corchetes.
 *  Devuelve true solo si está LIMPIO. */
async function assSubsClean(renderDir: string): Promise<boolean> {
  let files: string[];
  try {
    files = await readdir(renderDir);
  } catch {
    return false;
  }
  const ass = files.find((f) => f.toLowerCase().endsWith('.ass'));
  if (!ass) return false; // sin subtítulos no se puede verificar → no apto
  let content: string;
  try {
    content = await readFile(path.join(renderDir, ass), 'utf-8');
  } catch {
    return false;
  }
  for (const line of content.split(/\r?\n/)) {
    if (!line.startsWith('Dialogue:')) continue;
    const parts = line.slice('Dialogue:'.length).split(',');
    if (parts.length < 10) continue;
    const text = parts.slice(9).join(',').replace(/\{[^}]*\}/g, '');
    if (SCAFFOLD_TIMESTAMP.test(text) || SCAFFOLD_BRACKET.test(text)) return false;
  }
  return true;
}

/** ¿El render pasó la QA de subtítulos? Fuente primaria: RENDER/.render-qa.json
 *  (lo escribe el motor auto-edit vía core/qa_subs.py al final de cada render).
 *  Si no hay sello, auditamos el .ass al vuelo. Conservador: sin sello y sin .ass
 *  legible → NO apto (no subir lo no verificado). Bug que lo motiva: 2026-06-01,
 *  andamiaje del guion quemado en pantalla. Ver PLAN-AUTOAUDIT-2026-06-02.md. */
async function renderQaPassed(videoFolder: string): Promise<boolean> {
  const renderDir = path.join(videoFolder, 'RENDER');
  try {
    const raw = await readFile(path.join(renderDir, '.render-qa.json'), 'utf-8');
    const data = JSON.parse(raw) as { passed?: boolean };
    return data?.passed === true;
  } catch {
    // Sin sello legible → fallback: auditar el .ass directamente.
    return assSubsClean(renderDir);
  }
}

/** ¿El vídeo está completo para subir? render principal + miniatura + packaging.md
 *  + QA de subtítulos OK (sin andamiaje del guion quemado en pantalla). */
async function isComplete(videoFolder: string): Promise<boolean> {
  const prog = await computeProgress(videoFolder);
  if (!(prog.details.renderPrincipal && prog.details.miniaturaFinal && prog.details.hasPackagingMd)) {
    return false;
  }
  return renderQaPassed(videoFolder);
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
// Mutex de proceso: el poller de Electron (POST /api/auto-publish/tick) y el
// backstop del GET del kanban pueden entrar a la vez. Sin esto, ambos pasan el
// `hasUploadForFolder()` (check) y, varios await después, hacen `addUpload()`
// (act) del MISMO vídeo → subida DUPLICADA a YouTube. El scheduler serializa el
// LANZAMIENTO, pero no el ENCOLADO; este guard cierra esa ventana.
let autoPublishTicking = false;

export async function runAutoPublishTick(): Promise<AutoPublishResult[]> {
  if (!isEnabled()) return [];
  if (autoPublishTicking) return [];
  autoPublishTicking = true;
  try {
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
  } finally {
    autoPublishTicking = false;
  }
}
