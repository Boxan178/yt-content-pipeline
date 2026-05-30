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

/** Ruta del secreto del bot J.A.R.V.I.S. (override por env para tests). */
function botSecretPath(): string {
  return (
    process.env.JARVIS_BOT_SECRET ||
    path.join(os.homedir(), '.claude', 'secrets', 'jarvis-bot.json')
  );
}

interface BotSecret {
  token: string;
  chat_id: string | number;
}

let cachedSecret: BotSecret | null = null;

async function loadBotSecret(): Promise<BotSecret | null> {
  if (cachedSecret) return cachedSecret;
  try {
    const raw = await readFile(botSecretPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<BotSecret>;
    if (parsed?.token && parsed?.chat_id != null) {
      cachedSecret = { token: String(parsed.token), chat_id: parsed.chat_id };
      return cachedSecret;
    }
  } catch {
    // archivo ausente / inválido → sin Telegram
  }
  return null;
}

/** Escapa los 3 caracteres que rompen el parse_mode HTML de Telegram. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  if (info.privacy === 'public') {
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
