// Avisos de "algo acabó" por Telegram (bot DEDICADO), SOLO cuando Pablo está
// "Fuera del PC" ('away'). Es la parte "ponme al día / avísame de lo que acabe"
// del toggle (decisión 2026-06-01).
//
// Fuentes (archivos de estado pequeños, baratos de leer — NO escanea carpetas):
//   - Cola de jobs SARA/LUÍS/… → lib/job-queue.ts (queue.json): items done/blocked/failed.
//   - Subidas a YouTube       → lib/upload-schedule.ts (scheduled-uploads.json): done/failed.
//
// Trackea SIEMPRE los IDs ya vistos (aunque esté "En el PC") para NO avisar luego
// de lo que terminó mientras estaba presente; solo ENVÍA cuando 'away'. La primera
// ejecución es BASELINE: marca lo ya terminal sin avisar (evita inundación al
// estrenar la feature). Idempotente vía el set persistido.

import 'server-only';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getWorkingMode } from './working-mode';
import { sendApprovalsNotice, escapeHtml } from './notify';
import { getChannel } from './channels';

const DIR = path.join(os.homedir(), '.yt-content-pipeline');
const FILE = path.join(DIR, 'notified-completions.json');
const MAX_KEEP = 800; // recorta el histórico de IDs para que el JSON no crezca sin fin
const MAX_PER_RUN = 8; // tope de avisos por tick (anti-ráfaga)

function readNotified(): { ids: string[]; existed: boolean } {
  if (!existsSync(FILE)) return { ids: [], existed: false };
  try {
    const parsed = JSON.parse(readFileSync(FILE, 'utf-8')) as { ids?: string[] };
    return { ids: Array.isArray(parsed.ids) ? parsed.ids : [], existed: true };
  } catch {
    return { ids: [], existed: true };
  }
}

function saveNotified(ids: string[]) {
  try {
    if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify({ ids: ids.slice(-MAX_KEEP) }, null, 2), 'utf-8');
  } catch {
    // best-effort
  }
}

interface Pending {
  key: string;
  text: string;
}

/** Avisa de completados si Pablo está "Fuera". Devuelve cuántos avisos mandó. */
export async function trackAndNotifyCompletions(): Promise<number> {
  const away = getWorkingMode() === 'away';
  const { ids, existed } = readNotified();
  const seen = new Set(ids);
  const firstRun = !existed; // baseline en el primer arranque
  const pending: Pending[] = [];

  // ── Cola de jobs (queue.json) ───────────────────────────────────────────
  try {
    const { readQueue } = await import('./job-queue');
    for (const it of readQueue().items) {
      if (it.status !== 'done' && it.status !== 'blocked' && it.status !== 'failed') continue;
      const key = `q:${it.id}:${it.status}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const title = escapeHtml(it.videoTitle || '');
      const who = escapeHtml(it.label || it.skill);
      if (it.status === 'done') {
        pending.push({ key, text: `✅ <b>${who}</b> terminó${title ? ` · ${title}` : ''}` });
      } else if (it.status === 'blocked') {
        pending.push({
          key,
          text: `⏸️ <b>Bloqueado</b>${title ? ` · ${title}` : ''}${it.blockReason ? `\n${escapeHtml(it.blockReason)}` : ''}`,
        });
      } else {
        pending.push({
          key,
          text: `⚠️ <b>${who}</b> falló${title ? ` · ${title}` : ''}${it.failReason ? `\n${escapeHtml(it.failReason)}` : ''}`,
        });
      }
    }
  } catch {
    // job-queue no disponible → se ignora
  }

  // ── Subidas a YouTube (scheduled-uploads.json) ──────────────────────────
  try {
    const { readSchedule } = await import('./upload-schedule');
    for (const u of readSchedule().items) {
      if (u.status !== 'done' && u.status !== 'failed') continue;
      const key = `u:${u.id}:${u.status}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const chName = escapeHtml(getChannel(u.channel)?.name ?? u.channel);
      const title = escapeHtml(u.title || u.videoTitle || '');
      if (u.status === 'done') {
        const link = u.youtubeVideoId ? `\nhttps://youtu.be/${u.youtubeVideoId}` : '';
        pending.push({ key, text: `📤 <b>Subido</b> · ${chName}\n${title}${link}` });
      } else {
        pending.push({ key, text: `❌ <b>Subida falló</b> · ${title}${u.failReason ? `\n${escapeHtml(u.failReason)}` : ''}` });
      }
    }
  } catch {
    // upload-schedule no disponible → se ignora
  }

  let sent = 0;
  // En baseline o "En el PC": solo trackear (ya añadidos a `seen`), no enviar.
  if (!firstRun && away && pending.length) {
    const toSend = pending.slice(0, MAX_PER_RUN);
    for (const p of toSend) {
      try {
        await sendApprovalsNotice(p.text);
        sent++;
      } catch {
        // best-effort
      }
    }
    if (pending.length > MAX_PER_RUN) {
      try {
        await sendApprovalsNotice(`… y ${pending.length - MAX_PER_RUN} cosa(s) más que acabaron.`);
      } catch {}
    }
  }

  saveNotified([...seen]);
  return sent;
}
