// Persistencia de jobs `claude -p` por vídeo. Patrón calcado de lib/render.ts.
// Cada job vive en <videoFolder>/.claude-jobs/<jobId>.json + .log
// Spawn detached → sobrevive a cerrar app/modal.

import 'server-only';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import os from 'node:os';

/**
 * Config MCP mínima para los jobs `claude -p` spawneados. Cargar los ~20 MCP
 * servers del usuario hace que los HTTP (algrow) se queden "pending" en el job
 * HEADLESS → `generate_tts` falla → sin locución, el pipeline se atasca en el
 * guion. Extraemos SOLO los que el pipeline necesita y conectan headless
 * (algrow: TTS de CALIOPE + imágenes/miniaturas de IRIS). Verificado: con
 * --strict-mcp-config + solo algrow conecta en ~14s y health_check responde.
 * (Los connectors OAuth tipo vidiq/supabase no conectan headless de todas formas.)
 */
const JOBS_MCP_SERVERS = ['algrow'];
function buildJobsMcpConfig(): string | null {
  try {
    const home = os.homedir();
    const userCfg = JSON.parse(readFileSync(path.join(home, '.claude.json'), 'utf-8')) as {
      mcpServers?: Record<string, unknown>;
    };
    const all = userCfg.mcpServers ?? {};
    const mcpServers: Record<string, unknown> = {};
    for (const name of JOBS_MCP_SERVERS) if (all[name]) mcpServers[name] = all[name];
    if (Object.keys(mcpServers).length === 0) return null;
    const dir = path.join(home, '.yt-content-pipeline');
    mkdirSync(dir, { recursive: true });
    const out = path.join(dir, 'jobs-mcp.json');
    writeFileSync(out, JSON.stringify({ mcpServers }, null, 2), 'utf-8');
    return out;
  } catch {
    return null;
  }
}

// ── Resolución de claude CLI ──────────────────────────────────────────────
// claude.cmd en Windows es un wrapper batch sobre `node cli.js`. Si lo
// invocamos con shell:true + stdio file descriptors, cmd.exe NO propaga el
// fd de stdin a node, así que claude termina en ~9s sin recibir prompt.
// Saltamos el wrapper invocando node.exe directamente con la ruta a cli.js.

let cachedClaudeBin: { exe: string; cliArg: string | null } | null = null;

function resolveClaudeBin(): { exe: string; cliArg: string | null } {
  if (cachedClaudeBin) return cachedClaudeBin;
  if (process.platform === 'win32') {
    const result = spawnSync('where', ['claude.cmd'], { encoding: 'utf-8', windowsHide: true });
    if (result.status !== 0 || !result.stdout) {
      throw new Error('claude.cmd no encontrado en PATH. ¿Instalaste @anthropic-ai/claude-code globalmente?');
    }
    const cmdPath = result.stdout.trim().split(/[\r\n]+/)[0].trim();
    const cmdDir = path.dirname(cmdPath);
    // Convención npm: claude.cmd está al lado de node_modules/...
    const cliPath = path.join(cmdDir, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
    if (!existsSync(cliPath)) {
      throw new Error(`claude cli.js no existe en ${cliPath}. La estructura de instalación de npm puede haber cambiado.`);
    }
    cachedClaudeBin = { exe: 'node.exe', cliArg: cliPath };
  } else {
    cachedClaudeBin = { exe: 'claude', cliArg: null };
  }
  return cachedClaudeBin;
}

export type ClaudeJobStatus = 'running' | 'done' | 'failed' | 'cancelled' | 'timeout';

export interface ClaudeJob {
  jobId: string;
  pid: number;
  skill: string;
  label: string;
  status: ClaudeJobStatus;
  startedAt: string;
  finishedAt?: string;
  /** Prompt original mandado a claude. */
  prompt: string;
  /** CWD del proceso. */
  cwd: string;
  /** Path absoluto del log file. */
  logPath: string;
  /** Path absoluto del json file. */
  jobPath: string;
  /** Path del videoFolder al que pertenece este job (si aplica). */
  videoFolder?: string;
  /** Timeout en ms configurado. */
  timeoutMs: number;
  /** Exit code de claude (si terminó). */
  exitCode?: number | null;
  /** Última actualización (mtime del log). */
  lastUpdateAt?: string;
  /** Modelo usado (sonnet / opus / etc). */
  model?: string;
  /** Effort usado. */
  effort?: 'low' | 'medium' | 'high' | 'max';
  /** Feedback humano cosmético tras terminar. null = pendiente, no escrito. */
  approval?: 'approved' | 'rejected' | null;
}

const JOBS_DIR_NAME = '.claude-jobs';

export function jobsDirFor(videoFolder: string): string {
  return path.join(videoFolder, JOBS_DIR_NAME);
}

function ensureJobsDir(videoFolder: string): string {
  const dir = jobsDirFor(videoFolder);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e?.code === 'EPERM';
  }
}

export function killPid(pid: number): boolean {
  try {
    if (process.platform === 'win32') {
      const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
      const r = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
      return r.status === 0;
    } else {
      process.kill(pid, 'SIGTERM');
      return true;
    }
  } catch {
    return false;
  }
}

export interface StartJobOptions {
  skill: string; // 'sara' | 'elena' | 'amelia' | etc. (etiqueta)
  label: string; // texto humano corto para badges, ej. "SARA trabajando"
  prompt: string;
  cwd: string;
  timeoutMs: number;
  /** Carpeta del vídeo al que asociar el job. Si es null/undefined, el job es "global". */
  videoFolder?: string;
  /** Modelo a usar: 'sonnet' | 'opus' | nombre completo. Default 'sonnet' (más barato). */
  model?: string;
  /** Effort: 'low' | 'medium' | 'high' | 'max'. Default sin effort (usa el del modelo). */
  effort?: 'low' | 'medium' | 'high' | 'max';
}

/**
 * Arranca un nuevo job claude. Spawn detached. Devuelve el job persistido.
 */
export function startJob(opts: StartJobOptions): ClaudeJob {
  // Si no hay videoFolder, usamos un dir global para jobs sin vídeo
  const baseFolder = opts.videoFolder ?? path.join(process.cwd(), '.global-claude-jobs');
  const dir = ensureJobsDir(baseFolder);

  const jobId = randomUUID();
  const logPath = path.join(dir, `${jobId}.log`);
  const jobPath = path.join(dir, `${jobId}.json`);
  // Mantenemos el promptPath solo para histórico/debug (no se usa como stdin).
  const promptPath = path.join(dir, `${jobId}.prompt.txt`);

  // Cabecera del log con metadata
  writeFileSync(
    logPath,
    `[ytcp claude-job] jobId=${jobId}\n[ytcp claude-job] skill=${opts.skill}\n[ytcp claude-job] model=${opts.model ?? 'sonnet'}\n[ytcp claude-job] startedAt=${new Date().toISOString()}\n[ytcp claude-job] cwd=${opts.cwd}\n[ytcp claude-job] prompt:\n${opts.prompt}\n\n--- claude output ---\n\n`,
    'utf-8',
  );

  // Histórico del prompt en disco (no usado como stdin — se pasa como argv)
  writeFileSync(promptPath, opts.prompt, 'utf-8');

  const out = openSync(logPath, 'a');
  const err = openSync(logPath, 'a');

  // Invocamos node.exe directo con la ruta a cli.js de claude.
  // CLAVE: el prompt se pasa como argumento posicional (no por stdin) y
  // stdin=ignore (equivale a /dev/null). Sin esto, claude espera 3s+ por
  // stdin que nunca llega y queda colgado o ignora el prompt. Verificado.
  const claudeBin = resolveClaudeBin();
  const model = opts.model ?? 'sonnet'; // sonnet por defecto (más barato que opus)
  const args: string[] = [];
  if (claudeBin.cliArg) args.push(claudeBin.cliArg);
  // stream-json en print mode requiere --verbose. Cada línea del log será un
  // evento NDJSON parseable por lib/stream-events.ts.
  args.push('-p');
  // MCP mínimo: solo lo que el pipeline necesita, para que algrow (HTTP) conecte
  // en el job headless (si no, queda "pending" y generate_tts/locución falla).
  // CLAVE: va ANTES de --output-format (un flag), porque --mcp-config consume TODOS
  // los args siguientes hasta el próximo flag. Si va justo antes del prompt, se
  // traga el prompt como segundo "config file" → claude peta con "MCP config file
  // not found: <prompt>". Con un flag detrás, --mcp-config coge solo su path.
  const jobsMcp = buildJobsMcpConfig();
  if (jobsMcp) args.push('--strict-mcp-config', '--mcp-config', jobsMcp);
  args.push('--output-format', 'stream-json', '--verbose', '--model', model);
  if (opts.effort) {
    args.push('--effort', opts.effort);
  }
  args.push(opts.prompt);

  // NOTA importante sobre `detached`:
  // En Windows, spawn con `detached: true` SIEMPRE crea una consola nueva
  // para el child y `windowsHide: true` no la oculta de forma fiable (bug
  // histórico de Node + Win). Eso producía "mil millones de ventanitas CMD"
  // al lanzar SARA/LUIS/NORA. Lo desactivamos.
  //
  // Trade-off: si Electron muere a mitad de un job, el child también muere.
  // Para mitigar, el job se persiste en disco — al reabrir la app, readJob()
  // detecta el PID muerto y marca status='done' automáticamente.
  // Pablo en la práctica no cierra Electron a mitad de tarea.
  // CLAVE — autenticación: el `claude` spawneado DEBE usar la suscripción Pro
  // (credenciales en ~/.claude), NUNCA una API key. Si el server Next se arrancó
  // desde un entorno que tiene ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN /
  // ANTHROPIC_BASE_URL exportadas (p.ej. lanzado desde una sesión Claude Code o
  // el SDK), heredarlas hace que el claude hijo intente autenticar con ese token
  // de sesión y reviente con `401 Invalid authentication credentials` en el
  // turno 1 (0 tokens, sin usar herramientas). Las quitamos del env del hijo para
  // forzar el fallback a la suscripción. Ver CLAUDE.md: "subscription Pro siempre".
  const {
    ANTHROPIC_API_KEY: _omitApiKey,
    ANTHROPIC_AUTH_TOKEN: _omitAuthToken,
    ANTHROPIC_BASE_URL: _omitBaseUrl,
    ...cleanEnv
  } = process.env;
  void _omitApiKey; void _omitAuthToken; void _omitBaseUrl;

  let child;
  try {
    child = spawn(claudeBin.exe, args, {
      cwd: opts.cwd,
      shell: false,
      detached: false,
      windowsHide: true,
      stdio: ['ignore', out, err],
      env: {
        ...cleanEnv,
        TERM: 'dumb',
      },
    });
  } catch (e) {
    try { closeSync(out); closeSync(err); } catch {}
    throw new Error(`spawn failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!child.pid) {
    try { closeSync(out); closeSync(err); } catch {}
    throw new Error('spawn returned no PID');
  }

  // Cerrar fds en el padre — el child ya los heredó.
  try { closeSync(out); closeSync(err); } catch {}

  // unref() para que el server Next no bloquee al cerrar — el child sigue
  // corriendo hasta su propio exit, no hasta que el padre lo recoja.
  child.unref();

  const job: ClaudeJob = {
    jobId,
    pid: child.pid,
    skill: opts.skill,
    label: opts.label,
    status: 'running',
    startedAt: new Date().toISOString(),
    prompt: opts.prompt,
    cwd: opts.cwd,
    logPath,
    jobPath,
    videoFolder: opts.videoFolder,
    timeoutMs: opts.timeoutMs,
    model,
    effort: opts.effort,
  };

  writeFileSync(jobPath, JSON.stringify(job, null, 2), 'utf-8');
  return job;
}

/**
 * Lee un job de disco por su .json file. Si está marcado como running pero el
 * PID está muerto, actualiza el estado a 'done' (si claude exit 0 implícito por
 * log) o 'failed'.
 */
export function readJob(jobPath: string): ClaudeJob | null {
  try {
    const raw = readFileSync(jobPath, 'utf-8');
    const job = JSON.parse(raw) as ClaudeJob;
    // mtime del log como lastUpdateAt
    try {
      const s = statSync(job.logPath);
      job.lastUpdateAt = new Date(s.mtimeMs).toISOString();
    } catch {}
    // Si seguía running, verificar si sigue vivo
    if (job.status === 'running') {
      const alive = isPidAlive(job.pid);
      if (!alive) {
        // Check timeout
        const elapsedMs = Date.now() - new Date(job.startedAt).getTime();
        if (elapsedMs >= job.timeoutMs) {
          job.status = 'timeout';
        } else {
          job.status = 'done';
        }
        job.finishedAt = new Date().toISOString();
        try {
          writeFileSync(jobPath, JSON.stringify(job, null, 2), 'utf-8');
        } catch {}
      }
    }
    return job;
  } catch {
    return null;
  }
}

/**
 * Devuelve los últimos N líneas del log file.
 */
export function tailLog(logPath: string, lines = 200): string {
  try {
    const raw = readFileSync(logPath, 'utf-8');
    const all = raw.split(/\r?\n/);
    return all.slice(-lines).join('\n');
  } catch {
    return '';
  }
}

/**
 * Lista todos los jobs de un videoFolder (running, done, failed).
 * Sort: más recientes primero.
 */
export function listJobsForFolder(videoFolder: string): ClaudeJob[] {
  const dir = jobsDirFor(videoFolder);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const jobs: ClaudeJob[] = [];
  for (const f of files) {
    const j = readJob(path.join(dir, f));
    if (j) jobs.push(j);
  }
  jobs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  return jobs;
}

/**
 * Filtra solo los running.
 */
export function listActiveJobsForFolder(videoFolder: string): ClaudeJob[] {
  return listJobsForFolder(videoFolder).filter((j) => j.status === 'running');
}

/**
 * Cancela un job activo. Mata el pid + marca como cancelled.
 */
export function cancelJob(jobPath: string): ClaudeJob | null {
  const job = readJob(jobPath);
  if (!job) return null;
  if (job.status === 'running' && isPidAlive(job.pid)) {
    killPid(job.pid);
  }
  job.status = 'cancelled';
  job.finishedAt = new Date().toISOString();
  try {
    writeFileSync(jobPath, JSON.stringify(job, null, 2), 'utf-8');
  } catch {}
  return job;
}

/**
 * Marca un job como approved/rejected (feedback cosmético del usuario).
 * Pasar null limpia el flag.
 */
export function setApproval(
  jobPath: string,
  approval: 'approved' | 'rejected' | null,
): ClaudeJob | null {
  const job = readJob(jobPath);
  if (!job) return null;
  if (approval === null) {
    delete job.approval;
  } else {
    job.approval = approval;
  }
  try {
    writeFileSync(jobPath, JSON.stringify(job, null, 2), 'utf-8');
  } catch {}
  return job;
}

/**
 * Localiza un job por jobId dentro de un videoFolder.
 */
export function findJob(videoFolder: string, jobId: string): ClaudeJob | null {
  const dir = jobsDirFor(videoFolder);
  const candidate = path.join(dir, `${jobId}.json`);
  if (!existsSync(candidate)) return null;
  return readJob(candidate);
}
