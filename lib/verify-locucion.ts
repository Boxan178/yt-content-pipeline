// Verificación de locución: lanza scripts/verify_locucion.py en background y
// persiste el resultado en <videoFolder>/.verify-jobs/. La UI hace polling.
//
// Patrón calcado de lib/claude-jobs.ts (spawn detached:false + stdio a fichero),
// pero en vez de `claude` ejecuta el Python del venv de auto-edit (tiene PyAV +
// faster-whisper). Un job por carpeta: cada run pisa el anterior.

import 'server-only';
import { spawn } from 'node:child_process';
import {
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isPidAlive } from './claude-jobs';

const VERIFY_DIR_NAME = '.verify-jobs';

/** Python del venv de auto-edit (PyAV + faster-whisper). Override con env. */
function pythonExe(): string {
  return process.env.AUTOEDIT_PYTHON || 'C:\\.venvs\\auto-edit\\Scripts\\python.exe';
}

function scriptPath(): string {
  return process.env.VERIFY_LOCUCION_SCRIPT
    || path.join(process.cwd(), 'scripts', 'verify_locucion.py');
}

function verifyDir(folder: string): string {
  return path.join(folder, VERIFY_DIR_NAME);
}

export type VerifyMode = 'quick' | 'full';

export interface VerifyMeta {
  jobId: string;
  pid: number;
  mode: VerifyMode;
  startedAt: string;
  model: string;
}

export interface VerifyState {
  /** Estado normalizado de cara a la UI. */
  status: 'running' | 'done' | 'error' | 'none';
  mode?: VerifyMode;
  startedAt?: string;
  /** Etapa actual mientras corre (p.ej. "Transcribiendo 1/1"). */
  stage?: string;
  /** Resultado completo del script cuando status === 'done'. */
  result?: Record<string, unknown>;
  error?: string;
}

/**
 * Arranca una verificación de locución para `folder`. Devuelve la metadata del
 * job. Pisa cualquier verificación previa de esa carpeta.
 */
export function startVerify(folder: string, mode: VerifyMode = 'full', model = 'small'): VerifyMeta {
  const dir = verifyDir(folder);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const resultPath = path.join(dir, 'result.json');
  const metaPath = path.join(dir, 'job.json');
  const logPath = path.join(dir, 'job.log');
  // Limpieza del run anterior para no leer un resultado viejo como nuevo.
  for (const p of [resultPath, metaPath]) {
    try { if (existsSync(p)) rmSync(p); } catch {}
  }

  const py = pythonExe();
  const script = scriptPath();
  if (!existsSync(script)) {
    throw new Error(`No encuentro el script de verificación en ${script}`);
  }

  const jobId = randomUUID();
  const args = [
    script,
    '--folder', folder,
    '--out', resultPath,
    '--mode', mode,
    '--model', model,
  ];

  writeFileSync(
    logPath,
    `[ytcp verify-locucion] jobId=${jobId}\n[ytcp verify-locucion] python=${py}\n[ytcp verify-locucion] mode=${mode} model=${model}\n[ytcp verify-locucion] folder=${folder}\n[ytcp verify-locucion] startedAt=${new Date().toISOString()}\n\n--- python output ---\n\n`,
    'utf-8',
  );

  const out = openSync(logPath, 'a');
  const err = openSync(logPath, 'a');

  let child;
  try {
    // detached:false + windowsHide:true: mismo razonamiento que claude-jobs
    // (evita ventanas CMD en Windows). Trade-off: muere si Electron muere.
    child = spawn(py, args, {
      cwd: process.cwd(),
      shell: false,
      detached: false,
      windowsHide: true,
      stdio: ['ignore', out, err],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
      },
    });
  } catch (e) {
    try { closeSync(out); closeSync(err); } catch {}
    throw new Error(`spawn python falló: ${e instanceof Error ? e.message : String(e)}`);
  }
  try { closeSync(out); closeSync(err); } catch {}

  if (!child.pid) {
    throw new Error('spawn python no devolvió PID');
  }
  child.unref();

  const meta: VerifyMeta = {
    jobId,
    pid: child.pid,
    mode,
    startedAt: new Date().toISOString(),
    model,
  };
  writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  return meta;
}

/**
 * Lee el estado actual de la verificación de `folder`. Combina el result.json
 * (que escribe Python) con la metadata + liveness del PID para detectar crashes.
 */
export function readVerify(folder: string): VerifyState {
  const dir = verifyDir(folder);
  const resultPath = path.join(dir, 'result.json');
  const metaPath = path.join(dir, 'job.json');

  let meta: VerifyMeta | null = null;
  try {
    if (existsSync(metaPath)) meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as VerifyMeta;
  } catch {}

  let result: Record<string, unknown> | null = null;
  try {
    if (existsSync(resultPath)) result = JSON.parse(readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    // result.json a medio escribir: lo tratamos como "running"
  }

  if (!meta && !result) return { status: 'none' };

  const status = (result?.status as string) || undefined;

  if (status === 'done') {
    return { status: 'done', mode: meta?.mode, startedAt: meta?.startedAt, result: result ?? undefined };
  }
  if (status === 'error') {
    return { status: 'error', mode: meta?.mode, startedAt: meta?.startedAt, error: (result?.error as string) || 'Error en la verificación', result: result ?? undefined };
  }

  // Aún corriendo (según el JSON) — verificar que el proceso sigue vivo.
  if (meta && !isPidAlive(meta.pid)) {
    // El proceso murió sin escribir 'done'/'error'. ¿Stale o crash reciente?
    const ageMs = Date.now() - new Date(meta.startedAt).getTime();
    if (ageMs > 3000) {
      return {
        status: 'error',
        mode: meta.mode,
        startedAt: meta.startedAt,
        error: 'El proceso de verificación terminó sin escribir resultado (revisa .verify-jobs/job.log).',
        result: result ?? undefined,
      };
    }
  }

  return {
    status: 'running',
    mode: meta?.mode,
    startedAt: meta?.startedAt,
    stage: (result?.stage as string) || 'Arrancando',
    result: result ?? undefined,
  };
}

/** mtime del result.json (para invalidar caché en la UI si hace falta). */
export function verifyResultMtime(folder: string): number | null {
  try {
    return statSync(path.join(verifyDir(folder), 'result.json')).mtimeMs;
  } catch {
    return null;
  }
}
