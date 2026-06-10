// Aprobaciones interactivas vía Telegram (gate real bloqueante).
//
// Modelo (opción b del TELEGRAM-APPROVALS-PLAN.md): el agente plantea la pregunta
// y MUERE; la app espera (coste cero, sin proceso vivo) y RE-LANZA un job con la
// decisión inyectada cuando Pablo responde por Telegram. La "espera" = no hay job
// corriendo + existe un ApprovalRequest pendiente en disco.
//
// Substrato reusado: los agentes ya escriben "**Estado:** ⏳ PENDIENTE ELECCIÓN
// DE PABLO" en packaging.md; parsePabloDecisions() lo detecta y /api/decisions
// (vía lib/decisions.applyDecision) lo resuelve. La respuesta de Telegram llama a
// la MISMA applyDecision → packaging.md + panel "Decisiones de Pablo" en sync.
//
// Persistencia global en ~/.yt-content-pipeline/approvals.json (mismo patrón que
// queue.json / scheduled-uploads.json). El poller de Electron pega cada ~3s a
// /api/telegram/poll → runTelegramPoll().

import 'server-only';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CHANNELS, getChannel } from './channels';
import { parsePabloDecisions, extractTitleOptions } from './parse-pablo-decisions';
import { ensureVaultPackagingSynced } from './vault-sync';
import { voicePrefix } from './agent-voices';
import {
  escapeHtml,
  getApprovalsChatId,
  sendInlineMessage,
  sendInlinePhoto,
  sendForceReply,
  telegramGetUpdates,
  telegramAnswerCallback,
  telegramEditMessageText,
  type TelegramUpdate,
} from './notify';
import { applyDecision } from './decisions';
import { startJob, listActiveJobsForFolder, type StartJobOptions } from './claude-jobs';
import { enqueuePreEditResume } from './job-queue';
import { regenerateMiniatura } from './miniatura-regen';
import { buildSaraResume, type VideoContext } from './prompts';
import { JARVIS_ROOT, YOUTUBE_UPLOADER_DIR, YOUTUBE_UPLOADER_PY, YOUTUBE_UPLOADER_PYTHON } from './config';
import { trackAndNotifyCompletions } from './completion-notify';

const DIR = path.join(os.homedir(), '.yt-content-pipeline');
const FILE = path.join(DIR, 'approvals.json');

/** Cada cuánto, como mucho, se escanea el disco buscando decisiones nuevas. */
const DETECT_INTERVAL_MS = 30_000;
/** Una solicitud sin responder más vieja que esto pasa a 'expired'. */
const EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;
/** Retención de solicitudes ya cerradas antes de purgarlas del JSON. */
const PRUNE_MS = 14 * 24 * 60 * 60 * 1000;

export type ApprovalStatus = 'open' | 'sent' | 'answered' | 'expired' | 'failed';
export type ApprovalChoice = 'approved' | 'rejected';

export interface ApprovalRequest {
  id: string;
  /** Token corto que viaja en callback_data (límite 64 bytes de Telegram). */
  token: string;
  createdAt: string;
  // — a qué pertenece —
  videoFolder: string;
  channel?: string;
  videoTitle?: string;
  // — la voz —
  skill: string;
  label: string;
  // — la pregunta —
  kind: 'approve_reject';
  /** Gate de PROGRAMACIÓN: los botones son huecos de fecha/hora y el 📝 captura una
   *  fecha/hora libre como RESPUESTA de Pablo (no como rechazo). */
  scheduleGate?: boolean;
  question: string;
  payload?: { title?: string; options?: string[] };
  /** Si está, se manda como FOTO (preview de miniatura) en vez de texto. */
  imagePath?: string;
  /** Modo REPACKAGING: al aprobar, aplicar por API a un vídeo YA PUBLICADO
   *  (upload.py --update: videos.update preservando desc+tags / thumbnails.set),
   *  en vez de relanzar SARA. */
  repackage?: { videoId: string; channel: string; kind: 'title' | 'thumbnail' };
  /** Línea "PENDIENTE ELECCIÓN DE PABLO" exacta a resolver vía applyDecision. */
  statusAnchor?: string;
  // — gobierno del re-lanzado —
  resumeSkill?: string;
  /** Override de prompt de reanudación (para tests / flujos a medida).
   *  Soporta {{CHOICE}} y {{NOTES}}. */
  resumePromptOverride?: string;
  resumeCwd?: string;
  resumeModel?: string;
  resumeTimeoutMs?: number;
  resumeJobId?: string;
  resumeError?: string;
  // — Telegram —
  chatId?: string | number;
  messageId?: number;
  awaitingNotes?: boolean;
  awaitingNotesMessageId?: number;
  // — resolución —
  status: ApprovalStatus;
  answer?: { choice: ApprovalChoice; notes?: string; answeredAt: string };
}

interface ApprovalState {
  version: 1;
  /** Próximo offset a pedir a getUpdates (ya +1 sobre el último update_id). */
  offset: number;
  lastDetectAt?: string;
  items: ApprovalRequest[];
}

// ── Persistencia ───────────────────────────────────────────────────────────

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function empty(): ApprovalState {
  return { version: 1, offset: 0, items: [] };
}

function readState(): ApprovalState {
  if (!existsSync(FILE)) return empty();
  try {
    const parsed = JSON.parse(readFileSync(FILE, 'utf-8')) as ApprovalState;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items)) return empty();
    if (typeof parsed.offset !== 'number') parsed.offset = 0;
    return parsed;
  } catch {
    return empty();
  }
}

function saveState(s: ApprovalState) {
  ensureDir();
  // Purga de solicitudes cerradas antiguas para que el JSON no crezca sin fin.
  const now = Date.now();
  s.items = s.items.filter((r) => {
    if (r.status === 'open' || r.status === 'sent') return true;
    const ref = r.answer?.answeredAt ?? r.createdAt;
    return now - new Date(ref).getTime() < PRUNE_MS;
  });
  writeFileSync(FILE, JSON.stringify(s, null, 2), 'utf-8');
}

export function listApprovals(): ApprovalRequest[] {
  return readState().items.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// ── Helpers de dominio ───────────────────────────────────────────────────────

function shortToken(): string {
  return randomUUID().replace(/-/g, '').slice(0, 8);
}

function normFolder(p: string): string {
  return p.replace(/\\/g, '/').normalize('NFC');
}

/** Clave de dedupe: una decisión = carpeta + TIPO (sección) + ancla exacta.
 *  El tipo es imprescindible: SARA usa el MISMO ancla literal "**Estado:** ⏳ PENDIENTE
 *  ELECCIÓN DE PABLO" para el título Y la miniatura del mismo vídeo. Sin el tipo, el
 *  gate de miniatura colisionaba con el de título (misma carpeta+ancla) y se deduplicaba
 *  → NUNCA se enviaba la miniatura a Pablo (bug 2026-06-02). */
function dedupeKey(videoFolder: string, anchor?: string, tag?: string): string {
  return `${normFolder(videoFolder)}::${(tag ?? '').trim().toLowerCase().normalize('NFC')}::${(anchor ?? '').normalize('NFC')}`;
}

/** Deriva la skill (voz) de una sección tipo "Títulos (MARCOS)". */
function skillFromSection(section: string): string {
  const s = section.toLowerCase();
  if (/marco aurelio/.test(s)) return 'marco-aurelio';
  if (/marcos/.test(s)) return 'marcos';
  if (/nora/.test(s)) return 'nora';
  if (/iris/.test(s)) return 'iris';
  if (/elena/.test(s)) return 'elena';
  return 'sara';
}

function isTitleDecision(section: string, label: string): boolean {
  return /t[íi]tulo/i.test(section) || /t[íi]tulo/i.test(label);
}

function isThumbnailDecision(section: string, label: string): boolean {
  return /miniatura|thumbnail|portada/i.test(section) || /miniatura|thumbnail|portada/i.test(label);
}

const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/** Candidata de miniatura: la marcada (.selected-thumb) o la más reciente en
 *  `_PACKAGING/MINIATURAS/`. Devuelve ruta absoluta o null si no hay imagen. */
function pickThumbnailCandidate(videoFolder: string): string | null {
  const dir = path.join(videoFolder, '_PACKAGING', 'MINIATURAS');
  try {
    const sel = readFileSync(path.join(dir, '.selected-thumb'), 'utf-8').trim();
    if (sel && existsSync(path.join(dir, sel))) return path.join(dir, sel);
  } catch {}
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  let best: { p: string; mtimeMs: number } | null = null;
  for (const f of names) {
    if (!IMG_EXT.has(path.extname(f).toLowerCase())) continue;
    const p = path.join(dir, f);
    try {
      const s = statSync(p);
      if (s.isFile() && (!best || s.mtimeMs > best.mtimeMs)) best = { p, mtimeMs: s.mtimeMs };
    } catch {}
  }
  return best?.p ?? null;
}

// ── Construcción del job de reanudación ─────────────────────────────────────

function buildResumeJob(req: ApprovalRequest, choice: ApprovalChoice, notes?: string): StartJobOptions {
  if (req.resumePromptOverride) {
    return {
      skill: req.resumeSkill ?? req.skill,
      label: req.label,
      prompt: req.resumePromptOverride
        .replace(/\{\{CHOICE\}\}/g, choice)
        .replace(/\{\{NOTES\}\}/g, notes ?? ''),
      cwd: req.resumeCwd ?? JARVIS_ROOT,
      videoFolder: req.videoFolder,
      timeoutMs: req.resumeTimeoutMs ?? 10 * 60 * 1000,
      model: req.resumeModel ?? 'sonnet',
    };
  }
  // Reanudación real: devolvemos las riendas a SARA con la decisión inyectada.
  const title = req.payload?.title ?? req.videoTitle ?? req.question;
  const decisionLine =
    choice === 'approved'
      ? `Pablo ha APROBADO «${title}». Continúa el pipeline desde este punto sin volver a preguntar por ello.`
      : `Pablo ha RECHAZADO la propuesta${notes ? `. Notas textuales de Pablo: «${notes}»` : ''}. Propón una nueva opción que tenga en cuenta su feedback y vuelve a dejar la sección en "PENDIENTE ELECCIÓN DE PABLO" para reaprobación.`;
  const v: VideoContext = {
    channel: req.channel ?? '',
    title: req.videoTitle ?? title,
    state: 'production',
    folderPath: req.videoFolder,
  };
  const built = buildSaraResume(v);
  return {
    skill: req.resumeSkill ?? 'sara',
    label: req.label,
    prompt: `DECISIÓN DE PABLO (recibida por Telegram): ${decisionLine}\n\n${built.prompt}`,
    cwd: built.cwd,
    videoFolder: req.videoFolder,
    timeoutMs: built.timeoutMs,
    model: built.model,
  };
}

/** ¿Está el vídeo en Fase 1 (pre-edit) de la prueba de lava? Marcador .pre-edit-only
 *  en la raíz de la carpeta. Mientras exista, SARA NO debe renderizar: las reanudaciones
 *  por aprobación se re-encolan en modo pre-edit en vez de spawnear un SARA suelto. */
function isPreEditVideo(videoFolder: string): boolean {
  try {
    return existsSync(`${videoFolder.replace(/\\/g, '/')}/.pre-edit-only`);
  } catch {
    return false;
  }
}

function launchResume(req: ApprovalRequest, choice: ApprovalChoice, notes?: string): void {
  try {
    // GUARD anti-doble-SARA (gaps cola↔resume / cola↔render): si YA hay un job
    // activo para este vídeo (p.ej. la cola con loopUntilComplete orquestando SARA),
    // NO spawneamos un 2º SARA suelto — provocaría renders DUPLICADOS (causa raíz del
    // incidente 2026-06-01: hubo que matar el pipeline → se saltó la QA). La decisión
    // ya quedó aplicada en packaging.md (+ .selected-thumb si es miniatura), así que el
    // job/cola activo la recoge en su siguiente turno. Solo reanudamos suelto cuando
    // NO hay nadie trabajando (modelo "el agente plantea la pregunta y muere").
    if (listActiveJobsForFolder(req.videoFolder).length > 0) return;
    // RECHAZO DE MINIATURA: NO re-encolar el pre-edit genérico — re-mandaría la MISMA
    // imagen (NORA la ve en MINIATURAS/ y la reusa → bucle "te mando lo mismo"). En su
    // lugar regeneramos un concepto DISTINTO: apartamos la descartada a backup + lanzamos
    // NORA+IRIS con instrucción de "algo diferente" + el feedback textual de Pablo.
    if (choice === 'rejected' && /miniatura/i.test(req.label ?? '')) {
      const res = regenerateMiniatura(req.videoFolder, {
        channel: req.channel,
        reason: 'rejected',
        notes,
      });
      req.resumeJobId = res.jobId ?? (res.ok ? 'regen:lanzado' : undefined);
      if (!res.ok) req.resumeError = res.error;
      return;
    }
    // Fase 1 (pre-edit): la cola es el ÚNICO driver. Re-encolamos en modo pre-edit en
    // vez de spawnear un SARA suelto que podría renderizar/subir. enqueuePreEditResume
    // es idempotente (no duplica si ya hay item pending/running para esa carpeta).
    if (isPreEditVideo(req.videoFolder)) {
      const item = enqueuePreEditResume(req.videoFolder);
      req.resumeJobId = item ? `queue:${item.id}` : 'queue:ya-activo';
      return;
    }
    const job = startJob(buildResumeJob(req, choice, notes));
    req.resumeJobId = job.jobId;
  } catch (e) {
    req.resumeError = e instanceof Error ? e.message : String(e);
  }
}

// ── Envío de una solicitud a Telegram ───────────────────────────────────────

/** Reparte botones en filas de `size`. */
function chunk<T>(arr: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < arr.length; i += size) rows.push(arr.slice(i, i + size));
  return rows;
}

async function sendRequest(req: ApprovalRequest): Promise<void> {
  const channelName = req.channel ? getChannel(req.channel)?.name ?? req.channel : '';
  const header = `${voicePrefix(req.skill, req.label)} pregunta${channelName ? ` · ${escapeHtml(channelName)}` : ''}`;
  const options = req.payload?.options ?? [];
  const recommended = req.payload?.title;
  // ELEGIR de una lista: solo cuando hay ≥2 títulos y NO es una foto (miniatura).
  const isPick = !req.imagePath && options.length >= 2;

  let text: string;
  let buttons: { text: string; callback_data: string }[][];

  if (isPick) {
    const recIdx = recommended ? options.findIndex((o) => o === recommended) : -1;
    const list = options
      .map((o, i) => `${i === recIdx ? '⭐ ' : ''}<b>${i + 1}.</b> ${escapeHtml(o)}`)
      .join('\n');
    text = `${header}\n\n${escapeHtml(req.question)} (⭐ = recomendado)\n\n${list}`;
    const numBtns = options.map((_, i) => ({
      text: `${i === recIdx ? '⭐' : ''}${i + 1}`,
      callback_data: `${req.token}:o:${i}`,
    }));
    buttons = chunk(numBtns, 4);
    if (req.scheduleGate) {
      // Gate de programación: el 📝 es para escribir una fecha/hora libre (= la RESPUESTA).
      buttons.push([{ text: '📝 Otra fecha/hora exacta', callback_data: `${req.token}:n` }]);
    } else {
      buttons.push([
        { text: '❌ Ninguno / pedir otra', callback_data: `${req.token}:r` },
        { text: '📝 Notas', callback_data: `${req.token}:n` },
      ]);
    }
  } else {
    const body = recommended ? `\n\n«${escapeHtml(recommended)}»` : '';
    text = `${header}${body}\n\n${escapeHtml(req.question)}`;
    buttons = [
      [
        { text: '✅ Aprobar', callback_data: `${req.token}:a` },
        { text: '❌ Rechazar', callback_data: `${req.token}:r` },
      ],
      [{ text: '📝 Rechazar con notas', callback_data: `${req.token}:n` }],
    ];
  }
  // Si hay miniatura, la mandamos como FOTO (preview) con los mismos botones.
  const res =
    req.imagePath && existsSync(req.imagePath)
      ? await sendInlinePhoto({ imagePath: req.imagePath, caption: text, buttons })
      : await sendInlineMessage({ text, buttons });
  if (res.ok) {
    req.messageId = res.messageId;
    req.chatId = res.chatId;
    req.status = 'sent';
  } else {
    req.status = 'failed';
    req.resumeError = `Telegram: ${res.error}`;
  }
}

export interface CreateApprovalInput {
  videoFolder: string;
  channel?: string;
  videoTitle?: string;
  skill: string;
  label?: string;
  question: string;
  title?: string;
  options?: string[];
  /** Gate de programación de fecha (📝 = fecha/hora libre como respuesta de Pablo). */
  scheduleGate?: boolean;
  /** Ruta absoluta de una imagen a mandar como preview (miniatura). */
  imagePath?: string;
  statusAnchor?: string;
  resumeSkill?: string;
  resumePromptOverride?: string;
  resumeCwd?: string;
  resumeModel?: string;
  resumeTimeoutMs?: number;
}

/** Crea una solicitud, la persiste y la manda a Telegram. Devuelve la solicitud. */
export async function createAndSendRequest(input: CreateApprovalInput): Promise<ApprovalRequest> {
  const s = readState();
  const req: ApprovalRequest = {
    id: randomUUID(),
    token: shortToken(),
    createdAt: new Date().toISOString(),
    videoFolder: normFolder(input.videoFolder),
    channel: input.channel,
    videoTitle: input.videoTitle,
    skill: input.skill,
    label: input.label ?? input.skill,
    kind: 'approve_reject',
    scheduleGate: input.scheduleGate,
    question: input.question,
    payload: { title: input.title, options: input.options },
    imagePath: input.imagePath,
    statusAnchor: input.statusAnchor,
    resumeSkill: input.resumeSkill,
    resumePromptOverride: input.resumePromptOverride,
    resumeCwd: input.resumeCwd,
    resumeModel: input.resumeModel,
    resumeTimeoutMs: input.resumeTimeoutMs,
    status: 'open',
  };
  await sendRequest(req);
  s.items.push(req);
  saveState(s);
  return req;
}

// ── Detección sobre packaging.md (Vía A, cero edición de skills) ─────────────

/** Escanea los canales activos y crea+envía solicitudes de aprobación de TÍTULO
 *  para las decisiones "PENDIENTE ELECCIÓN DE PABLO" que aún no se hayan mandado. */
async function detectAndSend(s: ApprovalState): Promise<number> {
  // Decisión de Pablo (2026-06-01): las aprobaciones van SIEMPRE por Telegram,
  // esté "En el PC" o "Fuera". El toggle NO apaga esto — solo controla los avisos
  // de completados (futuro). Por eso aquí NO hay gate por working-mode.
  // Dedupe: solo contra gates AÚN VIVOS (open/sent). NO incluimos los `answered`:
  //  - rechazado → SARA re-propone con el mismo ancla y debe re-enviarse.
  //  - aprobado → si el packaging vuelve a "PENDIENTE" (re-decisión: p.ej. Pablo
  //    mejora MARCOS y quiere re-elegir títulos), debe poder re-enviarse. El estado
  //    normal tras aprobar es "✅ ELEGIDO" en packaging.md → parsePabloDecisions ya no
  //    lo devuelve, así que NO hay re-envío espurio. Incluir `answered` aquí bloqueaba
  //    las re-decisiones legítimas (no llegaban opciones nuevas a Pablo).
  const existing = new Set(
    s.items
      .filter((r) => r.status === 'open' || r.status === 'sent')
      .map((r) => dedupeKey(r.videoFolder, r.statusAnchor, r.label)),
  );
  let sent = 0;

  for (const channel of CHANNELS) {
    if (!channel.enabled || !channel.rootPath) continue;
    const base = path.join(channel.rootPath, channel.stateFolders.production);
    let names: string[];
    try {
      names = readdirSync(base);
    } catch {
      continue;
    }
    for (const name of names) {
      if (channel.ignoreFolders.includes(name)) continue;
      const folder = path.join(base, name);
      // Sync vault → _PACKAGING (no destructivo): garantiza packaging.md + titulos.md
      // en H: para que el gate dispare con opciones aunque el pipeline solo escribiera
      // en la vault (causa raíz de los gates rotos del 2026-06-08).
      ensureVaultPackagingSynced(channel.slug, folder);
      const packaging = path.join(folder, '_PACKAGING', 'packaging.md');
      if (!existsSync(packaging)) continue;
      let md: string;
      try {
        md = readFileSync(packaging, 'utf-8');
      } catch {
        continue;
      }
      const decisions = parsePabloDecisions(md);
      for (const d of decisions) {
        const thumb = isThumbnailDecision(d.section, d.label);
        const titleDec = isTitleDecision(d.section, d.label);
        if (!thumb && !titleDec) continue;
        const key = dedupeKey(folder, d.anchor, d.section);
        if (existing.has(key)) continue;

        let imagePath: string | undefined;
        let question: string;
        let title: string | undefined;
        let options = d.options;
        if (thumb) {
          const img = pickThumbnailCandidate(folder);
          if (!img) continue; // sin imagen no hay preview que mandar
          imagePath = img;
          question = '¿Apruebas esta miniatura?';
        } else {
          // Si las opciones viven en un fichero externo (ej. marcos-titulos.md) y
          // aquí no tenemos suficientes, lo leemos para sacar la lista completa.
          let recommended = d.recommendation;
          if (d.optionsFile && options.length < 2) {
            try {
              const ext = extractTitleOptions(
                readFileSync(path.join(folder, '_PACKAGING', d.optionsFile), 'utf-8'),
              );
              if (ext.options.length) {
                options = ext.options;
                recommended = ext.recommended || recommended;
              }
            } catch {
              // fichero ausente/ilegible → seguimos con lo que haya
            }
          }
          // Fallback robusto: si seguimos sin ≥2 opciones, leemos titulos.md de
          // _PACKAGING/ directamente (sincronizado desde la vault por
          // ensureVaultPackagingSynced). Cubre los packagings cuyo título remite a
          // titulos.md sin un cue parseable — antes salía el gate a 1 opción.
          if (options.length < 2) {
            try {
              const ext = extractTitleOptions(
                readFileSync(path.join(folder, '_PACKAGING', 'titulos.md'), 'utf-8'),
              );
              if (ext.options.length >= 2) {
                options = ext.options;
                recommended = ext.recommended || recommended;
              }
            } catch {
              // sin titulos.md → seguimos con lo que haya
            }
          }
          // El recomendado debe estar en la lista para poder marcarlo con ⭐.
          if (recommended && !options.includes(recommended)) options = [recommended, ...options];
          // Pablo: EXACTAMENTE 3 opciones de título. Capamos a 3 garantizando que el
          // recomendado entre (packagings viejos o un MARCOS díscolo pueden traer más).
          if (options.length > 3) {
            const rest = options.filter((o) => o !== recommended);
            options = (recommended ? [recommended, ...rest] : rest).slice(0, 3);
          }
          title = recommended || options[0];
          // GUARD: sin un título real NO mandamos tarjeta (antes salía el churro de
          // la línea de Estado o el literal "Elegir título"). Se reintentará cuando
          // el packaging.md tenga las opciones en un formato legible.
          if (!title) continue;
          question = options.length >= 2 ? '¿Qué título eliges?' : '¿Apruebas este título?';
        }

        const req: ApprovalRequest = {
          id: randomUUID(),
          token: shortToken(),
          createdAt: new Date().toISOString(),
          videoFolder: normFolder(folder),
          channel: channel.slug,
          videoTitle: name,
          skill: skillFromSection(d.section),
          label: d.section,
          kind: 'approve_reject',
          question,
          payload: { title, options },
          imagePath,
          statusAnchor: d.anchor,
          status: 'open',
        };
        await sendRequest(req);
        s.items.push(req);
        existing.add(key);
        if (req.status === 'sent') sent++;
      }
    }
  }
  return sent;
}

// ── Modo REPACKAGING (vídeos YA publicados) ─────────────────────────────────
// Vía AISLADA del flujo de producción: escanea <rootPath>/_REPACKAGING/<video_id>/
// (NO _EN PRODUCCIÓN → invisible para SARA y para auto-publish). Manda las mismas
// tarjetas (título 3 botones + miniatura ✅/❌) y, al aprobar, aplica por API con
// `upload.py --update` (videos.update preservando descripción+tags / thumbnails.set)
// en lugar de relanzar SARA. La miniatura vive en <folder>/_PACKAGING/MINIATURAS/
// para reutilizar pickThumbnailCandidate() y el .selected-thumb de resolve().

const execFileAsync = promisify(execFile);

interface RepackageFile {
  video_id: string;
  channel?: string;
  currentTitle?: string;
  options?: string[];
  recommended?: string;
  status?: 'pending' | 'sent' | 'applied';
}

function makeRepackageRequest(
  folder: string,
  channelSlug: string,
  videoId: string,
  kind: 'title' | 'thumbnail',
  opts: { videoTitle?: string; options?: string[]; title?: string; imagePath?: string; question: string },
): ApprovalRequest {
  return {
    id: randomUUID(),
    token: shortToken(),
    createdAt: new Date().toISOString(),
    videoFolder: normFolder(folder),
    channel: channelSlug,
    videoTitle: opts.videoTitle,
    skill: kind === 'title' ? 'marcos' : 'nora',
    label: kind === 'title' ? 'Título (repackaging)' : 'Miniatura (repackaging)',
    kind: 'approve_reject',
    question: opts.question,
    payload: { title: opts.title, options: opts.options },
    imagePath: opts.imagePath,
    repackage: { videoId, channel: channelSlug, kind },
    status: 'open',
  };
}

/** Aplica el repackaging APROBADO al vídeo publicado vía `upload.py --update`
 *  (título preservando descripción+tags, o miniatura). Edita el mensaje de Telegram
 *  con el resultado. El rechazo no aplica nada (la regeneración se hace aparte). */
async function applyRepackage(req: ApprovalRequest, choice: ApprovalChoice): Promise<void> {
  if (!req.repackage || choice !== 'approved') return;
  const { videoId, channel, kind } = req.repackage;
  const args = [YOUTUBE_UPLOADER_PY, '--channel', channel, '--update', videoId];
  if (kind === 'title') {
    if (!req.payload?.title) return;
    args.push('--title', req.payload.title);
  } else {
    if (!req.imagePath || !existsSync(req.imagePath)) return;
    args.push('--thumbnail', req.imagePath);
  }
  let ok = false;
  let detail = '';
  try {
    const { stdout } = await execFileAsync(YOUTUBE_UPLOADER_PYTHON, args, {
      cwd: YOUTUBE_UPLOADER_DIR,
      windowsHide: true,
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
    ok = /Updated\s|Thumbnail updated|youtu\.be\//i.test(stdout);
    detail = ok ? 'aplicado' : (stdout.trim().split('\n').pop() ?? 'sin confirmación');
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    detail = (err.stderr || err.message || String(e)).toString().trim().split('\n').pop() ?? 'error';
  }
  if (req.chatId != null && req.messageId) {
    const what = kind === 'title' ? `Título: «${escapeHtml(req.payload?.title ?? '')}»` : 'Miniatura';
    const head = `${voicePrefix(req.skill, req.label)} · ${ok ? '✅ Aplicado a YouTube' : '⚠️ No se pudo aplicar'}`;
    const tail = ok ? `https://youtu.be/${videoId}` : escapeHtml(detail);
    await telegramEditMessageText({ chatId: req.chatId, messageId: req.messageId, text: `${head}\n${what}\n${tail}` }).catch(() => {});
  }
}

/** Escanea <rootPath>/_REPACKAGING/<video_id>/repackage.json por canal y manda las
 *  tarjetas (título + miniatura) aún no enviadas. Idempotente: marca el JSON 'sent'. */
async function detectRepackaging(s: ApprovalState): Promise<number> {
  const existing = new Set(
    s.items
      .filter((r) => (r.status === 'open' || r.status === 'sent') && r.repackage)
      .map((r) => `${normFolder(r.videoFolder)}::${r.repackage!.kind}`),
  );
  let sent = 0;
  for (const channel of CHANNELS) {
    if (!channel.enabled || !channel.rootPath) continue;
    const base = path.join(channel.rootPath, '_REPACKAGING');
    let ids: string[];
    try {
      ids = readdirSync(base);
    } catch {
      continue; // el canal no tiene carpeta _REPACKAGING
    }
    for (const id of ids) {
      const folder = path.join(base, id);
      const jsonPath = path.join(folder, 'repackage.json');
      if (!existsSync(jsonPath)) continue;
      let data: RepackageFile;
      try {
        data = JSON.parse(readFileSync(jsonPath, 'utf-8')) as RepackageFile;
      } catch {
        continue;
      }
      if (data.status && data.status !== 'pending') continue;
      const videoId = (data.video_id || id).trim();
      const videoTitle = data.currentTitle || id;

      const titleKey = `${normFolder(folder)}::title`;
      const options = Array.isArray(data.options) ? data.options.filter(Boolean).slice(0, 3) : [];
      if (!existing.has(titleKey) && options.length >= 2) {
        const req = makeRepackageRequest(folder, channel.slug, videoId, 'title', {
          videoTitle,
          options,
          title: data.recommended && options.includes(data.recommended) ? data.recommended : options[0],
          question: '¿Qué título eliges?',
        });
        await sendRequest(req);
        s.items.push(req);
        existing.add(titleKey);
        if (req.status === 'sent') sent++;
      }

      const thumbKey = `${normFolder(folder)}::thumbnail`;
      if (!existing.has(thumbKey)) {
        const img = pickThumbnailCandidate(folder);
        if (img) {
          const req = makeRepackageRequest(folder, channel.slug, videoId, 'thumbnail', {
            videoTitle,
            imagePath: img,
            question: '¿Apruebas esta miniatura?',
          });
          await sendRequest(req);
          s.items.push(req);
          existing.add(thumbKey);
          if (req.status === 'sent') sent++;
        }
      }

      // Marca 'sent' para no re-mandar cada tick (se regenera 'pending' si Pablo
      // quiere repreguntar editando el JSON a mano).
      try {
        data.status = 'sent';
        writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
      } catch {}
    }
  }
  return sent;
}

// ── Resolución de una solicitud ─────────────────────────────────────────────

async function resolve(req: ApprovalRequest, choice: ApprovalChoice, notes?: string): Promise<void> {
  req.answer = { choice, notes, answeredAt: new Date().toISOString() };
  req.status = 'answered';
  req.awaitingNotes = false;

  // packaging.md: solo en APROBADO marcamos el ancla como ✅ ELEGIDO (en rechazo
  // el título NO se elige; SARA reescribirá la sección al reanudar).
  if (choice === 'approved' && req.statusAnchor) {
    try {
      await applyDecision({
        folder: req.videoFolder,
        itemText: `${req.label}`,
        // BUG-A FIX: el VALOR elegido NO debe llevar la coletilla de aprobación.
        // Antes se concatenaba "— aprobado por Pablo vía Telegram" y acababa
        // dentro del título en packaging.md (ELEGIDO) → subido como título a YouTube.
        // La provenance va a `rationale`, que solo se escribe al histórico.
        decision: `${req.payload?.title ?? 'Aprobado'}`,
        rationale: 'Aprobado por Pablo vía Telegram',
        statusAnchor: req.statusAnchor,
      });
    } catch (e) {
      req.resumeError = `applyDecision: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // Miniatura APROBADA → marcarla como elegida (.selected-thumb) para que el motor
  // de subida (lib/upload-schedule.ts / auto-publish) use exactamente esta imagen.
  if (choice === 'approved' && req.imagePath) {
    const dir = path.dirname(req.imagePath);
    if (path.basename(dir).toUpperCase() === 'MINIATURAS') {
      try {
        writeFileSync(path.join(dir, '.selected-thumb'), path.basename(req.imagePath), 'utf-8');
      } catch {}
    }
  }

  // Telegram: reescribimos el mensaje para reflejar el resultado y quitar botones.
  if (req.chatId != null && req.messageId) {
    const title = req.payload?.title ?? req.question;
    const verdict = choice === 'approved' ? '✅ <b>Aprobado</b>' : '❌ <b>Rechazado</b>';
    const notesLine = notes ? `\n📝 ${escapeHtml(notes)}` : '';
    await telegramEditMessageText({
      chatId: req.chatId,
      messageId: req.messageId,
      text: `${voicePrefix(req.skill, req.label)} · ${verdict}\n«${escapeHtml(title)}»${notesLine}`,
    });
  }

  // Repackaging de un vídeo ya publicado: aplicar por API (upload.py --update),
  // NO relanzar SARA (no hay producción que continuar).
  if (req.repackage) {
    await applyRepackage(req, choice);
    return;
  }

  // Reanudar el flujo (re-lanzar el job con la decisión inyectada).
  launchResume(req, choice, notes);
}

// ── Manejo de updates entrantes ─────────────────────────────────────────────

async function handleUpdate(s: ApprovalState, update: TelegramUpdate, chatId: string | number | null): Promise<void> {
  const cq = update.callback_query;
  // FAIL-CLOSED: si no hay chat autorizado configurado (secreto del bot ausente o
  // inválido → getApprovalsChatId() == null), NO procesamos NINGÚN update. Sin esto
  // el guard de abajo se saltaba con chatId null y CUALQUIERA que diera con el bot
  // podía resolver decisiones e inyectar texto libre en el prompt de SARA.
  if (chatId == null) {
    if (cq) { try { await telegramAnswerCallback(cq.id, 'No configurado'); } catch {} }
    return;
  }
  // 1) Tap de botón inline.
  if (cq) {
    // Seguridad: solo el chat configurado. Ignoramos a cualquier otro.
    if (String(cq.from?.id) !== String(chatId)) {
      await telegramAnswerCallback(cq.id, 'No autorizado');
      return;
    }
    const [tok, choice, arg] = (cq.data ?? '').split(':');
    const req = s.items.find((r) => r.token === tok);
    if (!req) {
      await telegramAnswerCallback(cq.id, 'Solicitud no encontrada o caducada');
      return;
    }
    if (req.status === 'answered' || req.status === 'expired') {
      await telegramAnswerCallback(cq.id, 'Esta decisión ya estaba resuelta');
      return;
    }
    if (choice === 'o') {
      // Elección de un título concreto de la lista → se aprueba ESE.
      const opts = req.payload?.options ?? [];
      const idx = Number.parseInt(arg ?? '', 10);
      if (!Number.isInteger(idx) || idx < 0 || idx >= opts.length) {
        await telegramAnswerCallback(cq.id, 'Opción no válida');
        return;
      }
      req.payload = { ...req.payload, title: opts[idx] };
      await telegramAnswerCallback(cq.id, `✅ Elegido #${idx + 1}`);
      await resolve(req, 'approved');
      return;
    }
    if (choice === 'n') {
      req.awaitingNotes = true;
      const fr = await sendForceReply({
        text: req.scheduleGate
          ? `📅 Escríbeme la fecha y hora EXACTA a la que quieres publicar «${escapeHtml(req.videoTitle ?? 'este vídeo')}» (ej: «viernes 13 a las 17:30» o «2026-06-14 18:00»):`
          : `📝 Escribe el motivo del rechazo para ${voicePrefix(req.skill, req.label)} (se lo paso tal cual):`,
        placeholder: req.scheduleGate ? 'fecha y hora exacta…' : 'Tus notas para el equipo…',
      });
      req.awaitingNotesMessageId = fr.messageId;
      await telegramAnswerCallback(cq.id, req.scheduleGate ? 'Escríbeme la fecha y hora' : 'Escríbeme las notas en un mensaje');
      return;
    }
    if (choice === 'a') {
      await telegramAnswerCallback(cq.id, '✅ Aprobado');
      await resolve(req, 'approved');
      return;
    }
    if (choice === 'r') {
      await telegramAnswerCallback(cq.id, '❌ Rechazado');
      await resolve(req, 'rejected');
      return;
    }
    await telegramAnswerCallback(cq.id);
    return;
  }

  // 2) Mensaje de texto (captura de notas vía force_reply).
  const m = update.message;
  if (m?.text) {
    if (String(m.from?.id) !== String(chatId)) return;
    const replyTo = m.reply_to_message?.message_id;
    let req =
      (replyTo != null && s.items.find((r) => r.awaitingNotes && r.awaitingNotesMessageId === replyTo)) || undefined;
    if (!req) {
      // Fallback SOLO si hay EXACTAMENTE UNA solicitud esperando notas. Si hay
      // varias y el mensaje no es un quote-reply (Telegram no adjunta reply_to si
      // el usuario escribe suelto), no podemos saber a cuál pertenece → atribuirla
      // a una arbitraria resolvería la decisión equivocada (notas en el SARA que no es).
      const awaiting = s.items.filter((r) => r.awaitingNotes && r.status === 'sent');
      if (awaiting.length === 1) req = awaiting[0];
    }
    if (!req) return; // no es una respuesta de notas que podamos atribuir — se ignora
    // Gate de programación: lo que Pablo escribe ES la respuesta (fecha/hora) → 'approved'.
    await resolve(req, req.scheduleGate ? 'approved' : 'rejected', m.text.trim());
  }
}

// ── Sweep de caducidad ──────────────────────────────────────────────────────

function expireStale(s: ApprovalState): void {
  const now = Date.now();
  for (const r of s.items) {
    if ((r.status === 'sent' || r.status === 'open') && now - new Date(r.createdAt).getTime() > EXPIRE_MS) {
      r.status = 'expired';
    }
  }
}

// ── Orquestador (lo llama /api/telegram/poll cada ~3s) ───────────────────────

let polling = false;

export interface PollResult {
  ok: boolean;
  processed?: number;
  detected?: number;
  conflict?: boolean;
  error?: string;
}

/**
 * Un tick del listener: getUpdates → enruta callbacks/notas → reanuda; y, con
 * throttle, escanea packaging.md buscando decisiones nuevas. Idempotente y con
 * mutex module-level (mismo patrón que tickQueue / tickScheduler).
 */
export async function runTelegramPoll(): Promise<PollResult> {
  if (polling) return { ok: true, processed: 0 };
  polling = true;
  try {
    const s = readState();
    const chatId = await getApprovalsChatId();

    // 1) Entrante.
    let processed = 0;
    const res = await telegramGetUpdates(s.offset, 0);
    if (!res.ok) {
      // 409 Conflict = otro consumidor usa getUpdates sobre este bot.
      if (res.conflict) {
        return { ok: false, conflict: true, error: 'getUpdates 409: otro consumidor activo sobre este bot' };
      }
      // No abortamos el resto (detección) por un fallo de red transitorio.
    } else if (res.updates && res.updates.length) {
      let maxId = s.offset - 1;
      for (const u of res.updates) {
        try {
          await handleUpdate(s, u, chatId);
        } catch {
          // un update problemático no debe tumbar el tick
        }
        if (u.update_id > maxId) maxId = u.update_id;
        processed++;
      }
      s.offset = maxId + 1;
    }

    // 2) Caducidad + detección (throttled).
    expireStale(s);
    let detected = 0;
    const lastDetect = s.lastDetectAt ? new Date(s.lastDetectAt).getTime() : 0;
    if (Date.now() - lastDetect > DETECT_INTERVAL_MS) {
      try {
        detected = await detectAndSend(s);
      } catch {
        // un canal problemático no debe tumbar el tick
      }
      // Repackaging: detectar _REPACKAGING/<id>/ y mandar sus tarjetas (aislado).
      try {
        detected += await detectRepackaging(s);
      } catch {
        // un repackaging problemático no debe tumbar el tick
      }
      // Avisos de "algo acabó" (cola + subidas), solo si está "Fuera del PC".
      try {
        await trackAndNotifyCompletions();
      } catch {
        // best-effort: no debe tumbar el tick
      }
      s.lastDetectAt = new Date().toISOString();
    }

    saveState(s);
    return { ok: true, processed, detected };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    polling = false;
  }
}
