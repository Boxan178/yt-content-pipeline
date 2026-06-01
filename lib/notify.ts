// Notificaciones proactivas a Pablo (Telegram + push web del dashboard).
//
// Réplica server-side y sin LLM de las skills `notify-done` / `assign-task`:
//  - Telegram: POST directo al Bot API del bot J.A.R.V.I.S.
//    (token + chat_id en ~/.claude/secrets/jarvis-bot.json).
//  - Push web: POST al endpoint público del dashboard-personal (PWA).
//
// La usa el motor de subidas (lib/upload-schedule.ts) para avisar cuando un
// vídeo queda subido en oculto, y el detector (lib/auto-publish.ts) para avisos
// de degradación. Es un primitivo reutilizable para el resto de la app.

import 'server-only';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DASHBOARD_PUSH_URL = 'https://dashboard-personal-gray.vercel.app/api/send-push';

// Dos bots:
//  - 'jarvis'    → @jarvis_pnavas_bot (jarvis-bot.json). SALIENTE: avisos
//    (notifyUploadDone, etc.). Lo comparte con el plugin de Telegram de Claude
//    Code, que posee su getUpdates — por eso la app NO puede hacer getUpdates aquí.
//  - 'approvals' → bot DEDICADO de la app (ytcp-approvals-bot.json). Aprobaciones
//    interactivas (entrada+salida): los botones inline se mandan desde ESTE bot y
//    sus callbacks vuelven a su getUpdates, sin contención con el plugin.
//    Si el archivo dedicado no existe, cae al bot J.A.R.V.I.S. (funciona pero con
//    la contención conocida) para no romper en caliente.
export type BotKind = 'jarvis' | 'approvals';

/** Ruta del secreto del bot (override por env para tests). */
function botSecretPath(kind: BotKind): string {
  if (kind === 'approvals') {
    return (
      process.env.YTCP_APPROVALS_BOT_SECRET ||
      path.join(os.homedir(), '.claude', 'secrets', 'ytcp-approvals-bot.json')
    );
  }
  return (
    process.env.JARVIS_BOT_SECRET ||
    path.join(os.homedir(), '.claude', 'secrets', 'jarvis-bot.json')
  );
}

interface BotSecret {
  token: string;
  chat_id: string | number;
}

const cachedSecret: Partial<Record<BotKind, BotSecret>> = {};

async function loadBotSecret(kind: BotKind = 'jarvis'): Promise<BotSecret | null> {
  const hit = cachedSecret[kind];
  if (hit) return hit;
  try {
    const raw = await readFile(botSecretPath(kind), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<BotSecret>;
    if (parsed?.token && parsed?.chat_id != null) {
      const secret = { token: String(parsed.token), chat_id: parsed.chat_id };
      cachedSecret[kind] = secret;
      return secret;
    }
  } catch {
    // archivo ausente / inválido
  }
  // IMPORTANTE: 'approvals' NO cae al bot J.A.R.V.I.S. Si lo hiciera y el plugin de
  // Telegram de Claude Code está activo sobre @jarvis_pnavas_bot, ambos pelearían
  // por getUpdates y el plugin se "caería". Preferimos fallar (las aprobaciones no
  // se mandan, con error claro) antes que secuestrar el bot del plugin.
  return null;
}

/** Escapa los 3 caracteres que rompen el parse_mode HTML de Telegram. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** El chat_id del bot DEDICADO de aprobaciones (destino + validación entrante). */
export async function getApprovalsChatId(): Promise<string | number | null> {
  const s = await loadBotSecret('approvals');
  return s ? s.chat_id : null;
}

// ── Bot API low-level (aprobaciones interactivas) ─────────────────────────
// fetch puro a la Bot API, mismo patrón que sendTelegram (sin grammy/telegraf).
// Por defecto operan sobre el bot 'approvals' (dedicado).

interface BotApiResult<T = unknown> {
  ok: boolean;
  result?: T;
  error?: string;
  /** Código HTTP/Telegram crudo (p.ej. 409 Conflict si otro consumidor usa getUpdates). */
  errorCode?: number;
}

/** Invoca un método arbitrario de la Bot API con cuerpo JSON. */
async function botApi<T = unknown>(
  method: string,
  body: Record<string, unknown>,
  kind: BotKind = 'approvals',
): Promise<BotApiResult<T>> {
  const secret = await loadBotSecret(kind);
  if (!secret) return { ok: false, error: `secreto del bot (${kind}) no encontrado o inválido` };
  try {
    const r = await fetch(`https://api.telegram.org/bot${secret.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });
    const data = (await r.json().catch(() => null)) as
      | { ok?: boolean; result?: T; description?: string; error_code?: number }
      | null;
    if (!r.ok || !data?.ok) {
      return { ok: false, error: data?.description || `HTTP ${r.status}`, errorCode: data?.error_code ?? r.status };
    }
    return { ok: true, result: data.result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface InlineButton {
  text: string;
  callback_data: string;
}

/** Manda un mensaje con teclado inline. Devuelve el message_id para editarlo luego. */
export async function sendInlineMessage(opts: {
  text: string; // HTML
  buttons: InlineButton[][]; // filas de botones
}): Promise<{ ok: boolean; messageId?: number; chatId?: string | number; error?: string }> {
  const chatId = await getApprovalsChatId();
  if (chatId == null) return { ok: false, error: 'sin chat_id' };
  const res = await botApi<{ message_id: number }>('sendMessage', {
    chat_id: chatId,
    text: opts.text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: opts.buttons },
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, messageId: res.result?.message_id, chatId };
}

/** Manda un mensaje con force_reply (para capturar texto libre, p.ej. notas). */
export async function sendForceReply(opts: {
  text: string;
  placeholder?: string;
}): Promise<{ ok: boolean; messageId?: number; chatId?: string | number; error?: string }> {
  const chatId = await getApprovalsChatId();
  if (chatId == null) return { ok: false, error: 'sin chat_id' };
  const res = await botApi<{ message_id: number }>('sendMessage', {
    chat_id: chatId,
    text: opts.text,
    parse_mode: 'HTML',
    reply_markup: {
      force_reply: true,
      ...(opts.placeholder ? { input_field_placeholder: opts.placeholder } : {}),
    },
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, messageId: res.result?.message_id, chatId };
}

/** Mensaje simple (sin botones) por el bot DEDICADO de aprobaciones. Best-effort. */
export async function sendApprovalsNotice(html: string): Promise<{ ok: boolean; error?: string }> {
  const chatId = await getApprovalsChatId();
  if (chatId == null) return { ok: false, error: 'sin chat_id' };
  const res = await botApi('sendMessage', {
    chat_id: chatId,
    text: html,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/** Manda una FOTO (miniatura) con teclado inline. Sube el binario por multipart. */
export async function sendInlinePhoto(opts: {
  imagePath: string;
  caption: string; // HTML
  buttons: InlineButton[][];
}): Promise<{ ok: boolean; messageId?: number; chatId?: string | number; error?: string }> {
  const secret = await loadBotSecret('approvals');
  if (!secret) return { ok: false, error: 'sin secreto del bot de aprobaciones' };
  let buf: Buffer;
  try {
    buf = await readFile(opts.imagePath);
  } catch (e) {
    return { ok: false, error: `no pude leer la imagen: ${e instanceof Error ? e.message : String(e)}` };
  }
  try {
    const form = new FormData();
    form.append('chat_id', String(secret.chat_id));
    form.append('caption', opts.caption);
    form.append('parse_mode', 'HTML');
    form.append('reply_markup', JSON.stringify({ inline_keyboard: opts.buttons }));
    form.append('photo', new Blob([new Uint8Array(buf)]), path.basename(opts.imagePath));
    const r = await fetch(`https://api.telegram.org/bot${secret.token}/sendPhoto`, {
      method: 'POST',
      body: form,
    });
    const data = (await r.json().catch(() => null)) as
      | { ok?: boolean; result?: { message_id: number }; description?: string }
      | null;
    if (!r.ok || !data?.ok) return { ok: false, error: data?.description || `HTTP ${r.status}` };
    return { ok: true, messageId: data.result?.message_id, chatId: secret.chat_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; is_bot?: boolean };
    chat?: { id: number };
    text?: string;
    reply_to_message?: { message_id: number };
  };
  callback_query?: {
    id: string;
    from?: { id: number };
    message?: { message_id: number; chat?: { id: number } };
    data?: string;
  };
}

/**
 * Long/short-poll de updates. `allowed_updates` acotado a lo que nos importa.
 * Devuelve `conflict: true` si otro consumidor está usando getUpdates (409) —
 * señal de que habría que migrar a un bot/token dedicado.
 */
export async function telegramGetUpdates(
  offset: number,
  timeoutSec = 0,
): Promise<{ ok: boolean; updates?: TelegramUpdate[]; error?: string; conflict?: boolean }> {
  const res = await botApi<TelegramUpdate[]>('getUpdates', {
    offset,
    timeout: timeoutSec,
    allowed_updates: ['callback_query', 'message'],
  });
  if (!res.ok) return { ok: false, error: res.error, conflict: res.errorCode === 409 };
  return { ok: true, updates: res.result ?? [] };
}

/** ACK del tap de un botón inline (quita el "reloj" en el cliente). */
export async function telegramAnswerCallback(callbackQueryId: string, text?: string): Promise<void> {
  await botApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

/** Reescribe un mensaje ya enviado (p.ej. para mostrar el resultado y quitar botones). */
export async function telegramEditMessageText(opts: {
  chatId: string | number;
  messageId: number;
  text: string;
}): Promise<void> {
  await botApi('editMessageText', {
    chat_id: opts.chatId,
    message_id: opts.messageId,
    text: opts.text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

/** Manda un mensaje al chat del bot J.A.R.V.I.S. (HTML básico permitido). */
export async function sendTelegram(html: string): Promise<{ ok: boolean; error?: string }> {
  const secret = await loadBotSecret();
  if (!secret) return { ok: false, error: 'jarvis-bot.json no encontrado o inválido' };
  try {
    const r = await fetch(`https://api.telegram.org/bot${secret.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        chat_id: secret.chat_id,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const data = (await r.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    if (!r.ok || !data?.ok) return { ok: false, error: data?.description || `HTTP ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Push web del dashboard-personal (PWA). Best-effort, sin secreto. */
export async function sendDashboardPush(opts: {
  title: string;
  body: string;
  url?: string;
}): Promise<{ ok: boolean; sent?: number; total?: number; error?: string }> {
  try {
    const r = await fetch(DASHBOARD_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        title: opts.title,
        body: opts.body,
        url: opts.url ?? 'https://dashboard-personal-gray.vercel.app/',
      }),
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const data = (await r.json().catch(() => null)) as { sent?: number; total?: number } | null;
    return { ok: true, sent: data?.sent, total: data?.total };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface UploadNotifyInfo {
  /** Nombre legible del canal, ej. "Moderni Stoici". */
  channelName: string;
  /** Título YouTube del vídeo. */
  videoTitle: string;
  /** ID del vídeo en YouTube (si se conoce). */
  youtubeVideoId?: string;
  privacy: 'unlisted' | 'private' | 'public';
  /** ISO 8601 (UTC) si la subida usa programación NATIVA de YouTube (publishAt):
   *  el vídeo se sube PRIVADO y YouTube lo hace público solo a esa hora. Cambia el
   *  mensaje a "📅 Programado para …". */
  publishAt?: string;
}

/** Formatea un ISO (UTC) a fecha/hora local legible (tz del PC = Europe/Madrid). */
function formatLocalDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleString('es-ES', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d.toISOString();
  }
}

/**
 * Avisa a Pablo de que un vídeo quedó subido. Para unlisted/private el mensaje
 * incluye la asignación de tarea ("prográmalo desde el móvil") + link a Studio,
 * que es justo lo que Pablo pidió que llegue por Telegram. Telegram es el canal
 * principal; el push web es best-effort. Devuelve qué llegó por dónde.
 */
export async function notifyUploadDone(
  info: UploadNotifyInfo,
): Promise<{ telegram: boolean; push: boolean }> {
  const studio = info.youtubeVideoId
    ? `https://studio.youtube.com/video/${info.youtubeVideoId}/edit`
    : null;
  const safeTitle = escapeHtml(info.videoTitle);
  const safeChannel = escapeHtml(info.channelName);

  let text: string;
  let pushTitle: string;
  if (info.publishAt) {
    // Programación NATIVA de YouTube: el vídeo está PRIVADO y sale público solo a
    // esta hora, sin que el PC tenga que estar encendido. Aviso informativo (Q1).
    const whenLocal = formatLocalDateTime(info.publishAt);
    text =
      `📅 <b>Programado</b> en ${safeChannel}\n${safeTitle}\n` +
      `🕐 Se publica solo: <b>${escapeHtml(whenLocal)}</b>` +
      (info.youtubeVideoId ? `\nhttps://youtu.be/${info.youtubeVideoId}` : '') +
      (studio ? `\n<a href="${studio}">Ver en YouTube Studio</a>` : '');
    pushTitle = '📅 Programado';
  } else if (info.privacy === 'public') {
    text =
      `📤 <b>Publicado</b> en ${safeChannel}\n${safeTitle}` +
      (info.youtubeVideoId ? `\nhttps://youtu.be/${info.youtubeVideoId}` : '');
    pushTitle = '📤 Publicado';
  } else {
    const modeLabel = info.privacy === 'unlisted' ? 'OCULTO' : 'PRIVADO';
    text =
      `✅ <b>Subido como ${modeLabel}</b> a ${safeChannel}\n` +
      `${safeTitle}\n` +
      `📌 Tu tarea: prográmalo desde el móvil cuando quieras.` +
      (studio ? `\n<a href="${studio}">Abrir en YouTube Studio</a>` : '');
    pushTitle = info.privacy === 'unlisted' ? '✅ Subido (oculto)' : '✅ Subido (privado)';
  }

  const [tg, push] = await Promise.all([
    sendTelegram(text),
    sendDashboardPush({
      title: pushTitle,
      body: `${info.videoTitle} — prográmalo`,
      url: studio ?? undefined,
    }),
  ]);
  return { telegram: tg.ok, push: push.ok };
}

/**
 * Avisa a Pablo de que una subida AUTOMÁTICA falló (OAuth caducado, render
 * movido, etc.). Sin esto, las subidas hands-off fallan en SILENCIO y el vídeo
 * se queda sin publicar sin que nadie se entere. Telegram principal + push
 * best-effort.
 */
export async function notifyUploadFailed(info: {
  channelName: string;
  videoTitle: string;
  reason: string;
}): Promise<{ telegram: boolean; push: boolean }> {
  const safeTitle = escapeHtml(info.videoTitle);
  const safeChannel = escapeHtml(info.channelName);
  const safeReason = escapeHtml(info.reason.slice(0, 240));
  const text =
    `❌ <b>Subida automática FALLÓ</b> en ${safeChannel}\n` +
    `${safeTitle}\n` +
    `Motivo: <code>${safeReason}</code>\n` +
    `📌 Súbelo a mano o revisa el OAuth del canal (si el token caducó, re-autoriza en youtube-uploader).`;
  const [tg, push] = await Promise.all([
    sendTelegram(text),
    sendDashboardPush({ title: '❌ Subida falló', body: `${info.videoTitle} — revisar` }),
  ]);
  return { telegram: tg.ok, push: push.ok };
}

/**
 * Avisa a Pablo de HUECOS en el calendario editorial: canales que no llegan a su
 * cadencia objetivo esta/próximas semanas. Resumen por canal. Telegram principal
 * + push best-effort. El throttle/dedupe lo gestiona el caller (endpoint) para
 * no spamear.
 */
export async function notifyContentGaps(
  lines: Array<{ channelName: string; missing: number; weekLabel: string }>,
): Promise<{ telegram: boolean; push: boolean }> {
  if (!lines.length) return { telegram: false, push: false };
  const body = lines
    .map((l) => `• <b>${escapeHtml(l.channelName)}</b>: faltan ${l.missing} (${escapeHtml(l.weekLabel)})`)
    .join('\n');
  const text =
    `📅 <b>Huecos en el calendario</b>\n` +
    `${body}\n` +
    `📌 Planifica o arranca producción desde /calendar para cubrir la cadencia.`;
  const pushBody = lines.map((l) => `${l.channelName}: faltan ${l.missing}`).join(' · ');
  const [tg, push] = await Promise.all([
    sendTelegram(text),
    sendDashboardPush({ title: '📅 Huecos en el calendario', body: pushBody }),
  ]);
  return { telegram: tg.ok, push: push.ok };
}
