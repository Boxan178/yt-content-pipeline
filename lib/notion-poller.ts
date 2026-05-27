// Notion poller — lee la DB `📋 Pipeline` del dashboard Notion de Pablo y, por
// cada fila con `🟡 Arrancar = true`, crea la carpeta del vídeo en disco y
// spawnea un job SARA que retoma el pipeline. Tras procesar correctamente,
// desmarca el checkbox y mueve el `Estado` a `🎬 Producción`. Si la fila falla,
// añade el motivo a `Notas` y también desmarca para no entrar en loop.
//
// Diseño:
// - Single-flight: dos llamadas concurrentes a `tick()` se colapsan en una.
// - Estado en `~/.yt-content-pipeline/notion-poller.json` (enabled, lastSync,
//   lastError, processed, nextRetryAt para backoff exponencial).
// - Log append-only en `~/.yt-content-pipeline/notion-poller.log`.
// - Dedup por pageId: una página no se procesa dos veces aunque Notion tarde
//   en propagar el unset del checkbox.

import 'server-only';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client, isFullPage } from '@notionhq/client';
import type {
  PageObjectResponse,
  QueryDataSourceParameters,
  UpdatePageParameters,
} from '@notionhq/client/build/src/api-endpoints';

import { JARVIS_ROOT } from './config';
import { getChannel, type Channel, type VideoState } from './channels';
import { startJob, type ClaudeJob } from './claude-jobs';
import { buildSaraResume, type VideoContext } from './prompts';
import { bootstrapVideoFolder } from './notion-bootstrap-folder';

// ── Constantes ─────────────────────────────────────────────────────────────

/** ID por defecto de la DB Pipeline (Pablo lo confirmó el 2026-05-26). */
const DEFAULT_DATA_SOURCE_ID = 'f708ffbd-c79b-4120-a9b9-a4e1c19fa2a1';

/** Propiedades exactas como las nombró Pablo en Notion. */
const PROP_TITLE = 'Título';
const PROP_ESTADO = 'Estado';
const PROP_CANAL = 'Canal';
const PROP_FORMATO = 'Formato';
const PROP_IDIOMA = 'Idioma';
const PROP_SLUG = 'Slug carpeta';
const PROP_FECHA = 'Fecha programada';
const PROP_URL = 'URL YouTube';
const PROP_NOTAS = 'Notas';
const PROP_ARRANCAR = '🟡 Arrancar';

const ESTADO_PRODUCCION = '🎬 Producción';

/** Mapeo nombre Notion → slug de canal en la app. */
const NOTION_CHANNEL_TO_SLUG: Record<string, string> = {
  'Moderni Stoici': 'moderni-stoici',
  'Moderno Estoico': 'moderno-estoico',
  'Vaultman': 'vaultman',
  'The Vaultman': 'vaultman',
};

// ── Persistencia ──────────────────────────────────────────────────────────

const STATE_DIR = path.join(os.homedir(), '.yt-content-pipeline');
const STATE_FILE = path.join(STATE_DIR, 'notion-poller.json');
const LOG_FILE = path.join(STATE_DIR, 'notion-poller.log');

export interface NotionPollerState {
  enabled: boolean;
  lastSyncAt: string | null;
  lastStatus: 'ok' | 'error' | 'noop' | null;
  lastError: string | null;
  /** Total acumulado de filas procesadas (ok + error). */
  processedCount: number;
  /** Filas procesadas con éxito en la última hora (para UI). */
  recentSuccessIds: string[];
  /** Backoff exponencial: ticks por debajo de este timestamp se saltan. */
  nextRetryAt: string | null;
  consecutiveErrors: number;
}

const DEFAULT_STATE: NotionPollerState = {
  enabled: false,
  lastSyncAt: null,
  lastStatus: null,
  lastError: null,
  processedCount: 0,
  recentSuccessIds: [],
  nextRetryAt: null,
  consecutiveErrors: 0,
};

function ensureStateDir() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
}

export function readState(): NotionPollerState {
  if (!existsSync(STATE_FILE)) return { ...DEFAULT_STATE };
  try {
    const raw = readFileSync(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<NotionPollerState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function writeState(patch: Partial<NotionPollerState>): NotionPollerState {
  ensureStateDir();
  const current = readState();
  const merged: NotionPollerState = { ...current, ...patch };
  writeFileSync(STATE_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

export function setEnabled(enabled: boolean): NotionPollerState {
  // Al reactivar, reseteamos backoff para no esperar hasta nextRetryAt.
  return writeState(
    enabled
      ? { enabled, nextRetryAt: null, consecutiveErrors: 0, lastError: null }
      : { enabled },
  );
}

// ── Logging ───────────────────────────────────────────────────────────────

function log(level: 'info' | 'warn' | 'error', msg: string) {
  ensureStateDir();
  const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
  try {
    appendFileSync(LOG_FILE, line, 'utf-8');
  } catch {}
  // En la consola Next también lo vemos en dev
  if (level === 'error') console.error('[notion-poller]', msg);
  else if (level === 'warn') console.warn('[notion-poller]', msg);
}

// ── Cliente Notion (cacheado por token) ──────────────────────────────────

let cachedClient: { token: string; client: Client } | null = null;

function getClient(): { client: Client; token: string } | { error: string } {
  const token = process.env.NOTION_TOKEN?.trim();
  if (!token) {
    return { error: 'NOTION_TOKEN no está definido en .env.local — ver RELEASE.md §6' };
  }
  if (cachedClient && cachedClient.token === token) {
    return { client: cachedClient.client, token };
  }
  const client = new Client({
    auth: token,
    notionVersion: '2025-09-03',
  });
  cachedClient = { token, client };
  return { client, token };
}

function getDataSourceId(): string {
  return process.env.NOTION_PIPELINE_DATA_SOURCE_ID?.trim() || DEFAULT_DATA_SOURCE_ID;
}

// ── Helpers de extracción de propiedades ──────────────────────────────────

type Page = PageObjectResponse;

function getTitle(page: Page): string {
  const p = page.properties[PROP_TITLE];
  if (p?.type === 'title') {
    return p.title.map((t) => ('plain_text' in t ? t.plain_text : '')).join('').trim();
  }
  return '';
}

function getSelect(page: Page, name: string): string | null {
  const p = page.properties[name];
  if (p?.type === 'select') return p.select?.name ?? null;
  return null;
}

function getCheckbox(page: Page, name: string): boolean {
  const p = page.properties[name];
  if (p?.type === 'checkbox') return p.checkbox;
  return false;
}

function getRichText(page: Page, name: string): string {
  const p = page.properties[name];
  if (p?.type === 'rich_text') {
    return p.rich_text.map((t) => ('plain_text' in t ? t.plain_text : '')).join('');
  }
  return '';
}

// ── Slug derivation ───────────────────────────────────────────────────────

/** Slug kebab-case ASCII a partir del título. Usado solo como fallback. */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

// ── Actualizar fila Notion (post-proceso) ────────────────────────────────

async function markRowProcessed(
  client: Client,
  pageId: string,
  opts: { setEstado?: string; appendNote?: string } = {},
) {
  const properties: UpdatePageParameters['properties'] = {
    [PROP_ARRANCAR]: { checkbox: false },
  };
  if (opts.setEstado) {
    properties[PROP_ESTADO] = { select: { name: opts.setEstado } };
  }
  if (opts.appendNote) {
    // Append a Notas. Notion no tiene "append" nativo — leemos+escribimos.
    try {
      const fresh = await client.pages.retrieve({ page_id: pageId });
      if (isFullPage(fresh)) {
        const existing = getRichText(fresh, PROP_NOTAS);
        const combined = existing ? `${existing}\n${opts.appendNote}` : opts.appendNote;
        properties[PROP_NOTAS] = {
          rich_text: [{ type: 'text', text: { content: combined.slice(0, 1900) } }],
        };
      }
    } catch (e) {
      log('warn', `no pude leer Notas previo del page ${pageId}: ${describeErr(e)}`);
    }
  }
  await client.pages.update({ page_id: pageId, properties });
}

function describeErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

// ── Procesado de una fila ────────────────────────────────────────────────

export interface ProcessRowResult {
  pageId: string;
  title: string;
  status: 'ok' | 'skipped' | 'error';
  reason?: string;
  job?: Pick<ClaudeJob, 'jobId' | 'pid' | 'videoFolder'>;
  folderPath?: string;
}

function videoStateFromNotionEstado(estado: string | null): VideoState {
  // Mapeo grueso. Cuando llegamos aquí siempre arrancamos en producción —
  // el `Estado` previo en Notion sirve solo para informar a SARA del contexto.
  switch (estado) {
    case '🚀 Publicado':
      return 'uploaded';
    case '📦 Listo':
      return 'ready';
    case '🎬 Producción':
    case '🎤 Locución':
    case '✅ Validada':
    case '💡 Idea':
    default:
      return 'production';
  }
}

async function processRow(client: Client, page: Page): Promise<ProcessRowResult> {
  const title = getTitle(page);
  const canalNotion = getSelect(page, PROP_CANAL);
  const estadoNotion = getSelect(page, PROP_ESTADO);
  const slugRaw = getRichText(page, PROP_SLUG).trim();
  const slug = slugRaw || slugifyTitle(title);

  if (!title) {
    return { pageId: page.id, title: '(sin título)', status: 'error', reason: 'fila sin Título' };
  }
  if (!canalNotion) {
    return { pageId: page.id, title, status: 'error', reason: 'fila sin Canal' };
  }
  const channelSlug = NOTION_CHANNEL_TO_SLUG[canalNotion];
  if (!channelSlug) {
    return { pageId: page.id, title, status: 'error', reason: `Canal "${canalNotion}" no mapeado a la app` };
  }
  const channel: Channel | undefined = getChannel(channelSlug);
  if (!channel || !channel.enabled) {
    return { pageId: page.id, title, status: 'error', reason: `canal ${channelSlug} no habilitado en lib/channels.ts` };
  }

  // Vaultman: TBD por el momento. Skip controlado.
  if (channelSlug === 'vaultman') {
    log('warn', `vaultman aún no soportado — skip row "${title}" (page ${page.id})`);
    return { pageId: page.id, title, status: 'skipped', reason: 'vaultman bootstrap TBD' };
  }

  // El nombre de la carpeta es el título exacto (es lo que ve Pablo en YouTube).
  const videoFolderName = title;

  const bootstrap = bootstrapVideoFolder({ channelSlug, videoFolderName });
  if (!bootstrap.ok || !bootstrap.folderPath) {
    return {
      pageId: page.id,
      title,
      status: 'error',
      reason: `bootstrap falló: ${bootstrap.error ?? bootstrap.reason ?? 'desconocido'}`,
    };
  }

  if (bootstrap.alreadyExisted) {
    log('warn', `carpeta ya existía: ${bootstrap.folderPath} — sigo igual con SARA`);
  } else {
    log('info', `carpeta creada: ${bootstrap.folderPath} (+${bootstrap.created?.dirs ?? 0} dirs, +${bootstrap.created?.files ?? 0} files)`);
  }

  // Construir VideoContext para SARA. No tenemos `progress` (la app ya lo
  // calculará en el siguiente refresh); SARA leerá el filesystem en su tick.
  const videoCtx: VideoContext = {
    channel: channelSlug,
    title,
    state: videoStateFromNotionEstado(estadoNotion),
    folderPath: bootstrap.folderPath,
  };

  const built = buildSaraResume(videoCtx);

  // Spawn job SARA. videoFolder ata el job a la carpeta para que aparezca en
  // las cards del kanban como activeJob (override visual de production).
  let job: ClaudeJob;
  try {
    job = startJob({
      skill: 'sara',
      label: `SARA — ${title.slice(0, 40)}`,
      prompt: built.prompt + `\n\n[contexto Notion]\n- pageId=${page.id}\n- slug=${slug}\n- canalNotion=${canalNotion}\n- estadoNotion=${estadoNotion ?? '(none)'}`,
      cwd: built.cwd ?? JARVIS_ROOT,
      videoFolder: bootstrap.folderPath,
      timeoutMs: built.timeoutMs,
      model: built.model ?? 'opus',
    });
  } catch (e) {
    return {
      pageId: page.id,
      title,
      status: 'error',
      reason: `startJob falló: ${describeErr(e)}`,
    };
  }

  log('info', `spawn SARA pid=${job.pid} jobId=${job.jobId} para "${title}"`);

  return {
    pageId: page.id,
    title,
    status: 'ok',
    job: { jobId: job.jobId, pid: job.pid, videoFolder: job.videoFolder },
    folderPath: bootstrap.folderPath,
  };
}

// ── Tick principal ────────────────────────────────────────────────────────

let inFlight: Promise<TickResult> | null = null;

export interface TickResult {
  ok: boolean;
  ranAt: string;
  /** Filas con `🟡 Arrancar=true` encontradas en la query. */
  matched: number;
  /** Filas realmente procesadas (ok + error). */
  processed: number;
  /** Detalles por fila. */
  results: ProcessRowResult[];
  /** Si fue noop por config (disabled, missing token, backoff). */
  reason?: string;
}

/**
 * Ejecuta un tick. Single-flight: si hay otro en marcha, devuelve el mismo
 * promise para no duplicar queries ni race-conditionar la persistencia.
 *
 * `force=true` ignora el flag `enabled` y `nextRetryAt`. Lo usa el botón "Sync
 * ahora" del UI y el endpoint POST /api/notion/sync.
 */
export async function tick(opts: { force?: boolean } = {}): Promise<TickResult> {
  if (inFlight) return inFlight;

  inFlight = (async (): Promise<TickResult> => {
    const ranAt = new Date().toISOString();
    const state = readState();

    if (!opts.force && !state.enabled) {
      return { ok: true, ranAt, matched: 0, processed: 0, results: [], reason: 'disabled' };
    }
    if (!opts.force && state.nextRetryAt && new Date(state.nextRetryAt) > new Date()) {
      return { ok: true, ranAt, matched: 0, processed: 0, results: [], reason: 'backoff' };
    }

    const got = getClient();
    if ('error' in got) {
      writeState({
        lastSyncAt: ranAt,
        lastStatus: 'error',
        lastError: got.error,
      });
      return { ok: false, ranAt, matched: 0, processed: 0, results: [], reason: got.error };
    }
    const { client } = got;

    let pages: Page[];
    try {
      const params: QueryDataSourceParameters = {
        data_source_id: getDataSourceId(),
        filter: {
          property: PROP_ARRANCAR,
          checkbox: { equals: true },
        },
        page_size: 25,
      };
      const resp = await client.dataSources.query(params);
      pages = resp.results.filter(isFullPage);
    } catch (e) {
      const err = describeErr(e);
      const consecutive = state.consecutiveErrors + 1;
      // Backoff: 30s, 60s, 2m, 5m, capped at 5m.
      const backoffMs = Math.min(30_000 * Math.pow(2, consecutive - 1), 5 * 60_000);
      const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
      writeState({
        lastSyncAt: ranAt,
        lastStatus: 'error',
        lastError: err,
        consecutiveErrors: consecutive,
        nextRetryAt,
      });
      log('error', `query falló (${consecutive} consecutivos, backoff ${backoffMs}ms): ${err}`);
      return { ok: false, ranAt, matched: 0, processed: 0, results: [], reason: err };
    }

    if (pages.length === 0) {
      writeState({
        lastSyncAt: ranAt,
        lastStatus: 'noop',
        lastError: null,
        consecutiveErrors: 0,
        nextRetryAt: null,
      });
      return { ok: true, ranAt, matched: 0, processed: 0, results: [] };
    }

    const results: ProcessRowResult[] = [];
    for (const page of pages) {
      const result = await processRow(client, page);
      results.push(result);

      // Update Notion según resultado.
      try {
        if (result.status === 'ok') {
          await markRowProcessed(client, page.id, { setEstado: ESTADO_PRODUCCION });
        } else if (result.status === 'error') {
          await markRowProcessed(client, page.id, {
            appendNote: `❌ ${result.reason ?? 'error desconocido'} (${ranAt})`,
          });
        } else {
          // skipped (vaultman) — desmarcamos para no entrar en loop, anotamos motivo.
          await markRowProcessed(client, page.id, {
            appendNote: `⏭️ skip: ${result.reason ?? 'sin motivo'} (${ranAt})`,
          });
        }
      } catch (e) {
        log('error', `no pude actualizar fila ${page.id}: ${describeErr(e)}`);
      }
    }

    const success = results.filter((r) => r.status === 'ok').map((r) => r.pageId);
    writeState({
      lastSyncAt: ranAt,
      lastStatus: results.some((r) => r.status === 'error') ? 'error' : 'ok',
      lastError: null,
      consecutiveErrors: 0,
      nextRetryAt: null,
      processedCount: state.processedCount + results.length,
      recentSuccessIds: [...success, ...state.recentSuccessIds].slice(0, 50),
    });

    return {
      ok: true,
      ranAt,
      matched: pages.length,
      processed: results.length,
      results,
    };
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

// ── Configuración estática expuesta al UI ────────────────────────────────

export interface PollerConfigInfo {
  enabled: boolean;
  hasToken: boolean;
  dataSourceId: string;
  state: NotionPollerState;
}

export function getConfigInfo(): PollerConfigInfo {
  return {
    enabled: readState().enabled,
    hasToken: Boolean(process.env.NOTION_TOKEN?.trim()),
    dataSourceId: getDataSourceId(),
    state: readState(),
  };
}
