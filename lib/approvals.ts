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
import { CHANNELS, getChannel } from './channels';
import { parsePabloDecisions } from './parse-pablo-decisions';
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
import { startJob, type StartJobOptions } from './claude-jobs';
import { buildSaraResume, type VideoContext } from './prompts';
import { JARVIS_ROOT } from './config';
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
  question: string;
  payload?: { title?: string; options?: string[] };
  /** Si está, se manda como FOTO (preview de miniatura) en vez de texto. */
  imagePath?: string;
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

/** Clave de dedupe: una decisión = carpeta + ancla exacta. */
function dedupeKey(videoFolder: string, anchor?: string): string {
  return `${normFolder(videoFolder)}::${(anchor ?? '').normalize('NFC')}`;
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

function launchResume(req: ApprovalRequest, choice: ApprovalChoice, notes?: string): void {
  try {
    const job = startJob(buildResumeJob(req, choice, notes));
    req.resumeJobId = job.jobId;
  } catch (e) {
    req.resumeError = e instanceof Error ? e.message : String(e);
  }
}

// ── Envío de una solicitud a Telegram ───────────────────────────────────────

async function sendRequest(req: ApprovalRequest): Promise<void> {
  const channelName = req.channel ? getChannel(req.channel)?.name ?? req.channel : '';
  const title = req.payload?.title;
  const header = `${voicePrefix(req.skill, req.label)} pregunta${channelName ? ` · ${escapeHtml(channelName)}` : ''}`;
  const body = title ? `\n\n«${escapeHtml(title)}»` : '';
  const text = `${header}${body}\n\n${escapeHtml(req.question)}`;
  const buttons = [
    [
      { text: '✅ Aprobar', callback_data: `${req.token}:a` },
      { text: '❌ Rechazar', callback_data: `${req.token}:r` },
    ],
    [{ text: '📝 Rechazar con notas', callback_data: `${req.token}:n` }],
  ];
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
  const existing = new Set(s.items.filter((r) => r.status !== 'expired' && r.status !== 'failed').map((r) => dedupeKey(r.videoFolder, r.statusAnchor)));
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
        const key = dedupeKey(folder, d.anchor);
        if (existing.has(key)) continue;

        let imagePath: string | undefined;
        let question: string;
        let title: string | undefined;
        if (thumb) {
          const img = pickThumbnailCandidate(folder);
          if (!img) continue; // sin imagen no hay preview que mandar
          imagePath = img;
          question = '¿Apruebas esta miniatura?';
        } else {
          title = d.recommendation || d.options[0] || d.label;
          question = '¿Apruebas este título?';
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
          payload: { title, options: d.options },
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
        decision: `${req.payload?.title ?? 'Aprobado'} — aprobado por Pablo vía Telegram`,
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

  // Reanudar el flujo (re-lanzar el job con la decisión inyectada).
  launchResume(req, choice, notes);
}

// ── Manejo de updates entrantes ─────────────────────────────────────────────

async function handleUpdate(s: ApprovalState, update: TelegramUpdate, chatId: string | number | null): Promise<void> {
  // 1) Tap de botón inline.
  const cq = update.callback_query;
  if (cq) {
    // Seguridad: solo el chat configurado. Ignoramos a cualquier otro.
    if (chatId != null && String(cq.from?.id) !== String(chatId)) {
      await telegramAnswerCallback(cq.id, 'No autorizado');
      return;
    }
    const [tok, choice] = (cq.data ?? '').split(':');
    const req = s.items.find((r) => r.token === tok);
    if (!req) {
      await telegramAnswerCallback(cq.id, 'Solicitud no encontrada o caducada');
      return;
    }
    if (req.status === 'answered' || req.status === 'expired') {
      await telegramAnswerCallback(cq.id, 'Esta decisión ya estaba resuelta');
      return;
    }
    if (choice === 'n') {
      req.awaitingNotes = true;
      const fr = await sendForceReply({
        text: `📝 Escribe el motivo del rechazo para ${voicePrefix(req.skill, req.label)} (se lo paso tal cual):`,
        placeholder: 'Tus notas para el equipo…',
      });
      req.awaitingNotesMessageId = fr.messageId;
      await telegramAnswerCallback(cq.id, 'Escríbeme las notas en un mensaje');
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
    if (chatId != null && String(m.from?.id) !== String(chatId)) return;
    const replyTo = m.reply_to_message?.message_id;
    let req =
      (replyTo != null && s.items.find((r) => r.awaitingNotes && r.awaitingNotesMessageId === replyTo)) || undefined;
    if (!req) req = s.items.find((r) => r.awaitingNotes && r.status === 'sent');
    if (!req) return; // no es una respuesta de notas que nos interese — se ignora
    await resolve(req, 'rejected', m.text.trim());
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
