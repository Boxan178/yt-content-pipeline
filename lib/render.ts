import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const PYTHON_EXE = 'C:/.venvs/auto-edit/Scripts/python.exe';
export const RENDER_SCRIPT = 'Y:/04_DEV/J.A.R.V.I.S/lab/auto-edit/tools/render_project.py';

export const JOB_FILE = '.render-job.json';
export const LOG_FILE = '.render-output.log';

export type RenderStatus = 'running' | 'done' | 'failed' | 'cancelled';

export interface RenderJob {
  jobId: string;
  pid: number;
  status: RenderStatus;
  startedAt: string; // ISO
  finishedAt?: string;
  command: string;
  slug: string;
  scriptPath: string;
  projectFolder: string;
  exitCode?: number | null;
}

/**
 * Extrae el slug del packaging.md buscando `**Slug:** \`<slug>\``.
 * Devuelve null si no lo encuentra.
 */
export async function extractSlugFromPackaging(packagingMdPath: string): Promise<string | null> {
  try {
    const text = await readFile(packagingMdPath, 'utf-8');
    const m = /\*\*Slug:\*\*\s*`([^`]+)`/i.exec(text);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

/**
 * Heurística de fallback: convierte un título a slug.
 * "10 Stoic Practices That Quiet Anxiety in 7 Days" → "10-stoic-practices-that-quiet-anxiety-in-7-days"
 */
export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Devuelve el path al guion del proyecto. Prueba guion-v2.md primero, guion.md de fallback.
 */
export async function findScript(scriptsRoot: string, slug: string): Promise<string | null> {
  const candidates = ['guion-v2.md', 'guion.md'];
  for (const name of candidates) {
    const p = path.join(scriptsRoot, slug, name);
    try {
      const s = await stat(p);
      if (s.isFile()) return p;
    } catch {
      // skip
    }
  }
  return null;
}

/**
 * Comprueba si un PID está vivo (Windows + Unix). No envía señal, solo testea.
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e?.code === 'EPERM';
  }
}

/**
 * Lee .render-job.json del videoFolder. null si no existe.
 */
export async function readJob(videoFolder: string): Promise<RenderJob | null> {
  const p = path.join(videoFolder, JOB_FILE);
  try {
    const raw = await readFile(p, 'utf-8');
    return JSON.parse(raw) as RenderJob;
  } catch {
    return null;
  }
}

export async function writeJob(videoFolder: string, job: RenderJob): Promise<void> {
  const p = path.join(videoFolder, JOB_FILE);
  await writeFile(p, JSON.stringify(job, null, 2), 'utf-8');
}

/**
 * Lee las últimas N líneas del log. Si no existe, devuelve ''.
 */
export async function readLogTail(videoFolder: string, lines = 100): Promise<string> {
  const p = path.join(videoFolder, LOG_FILE);
  try {
    const raw = await readFile(p, 'utf-8');
    const all = raw.split(/\r?\n/);
    return all.slice(-lines).join('\n');
  } catch {
    return '';
  }
}

/**
 * Mira el log y deduce si el render terminó OK o FAIL. Devuelve null si no encuentra señal.
 * Patrones esperados (según skill LUIS):
 *  - "OK en X min" → done
 *  - "RENDER FAILED" / "FAILED" / "Traceback" / "Error" → failed
 */
export function inferStatusFromLog(log: string): RenderStatus | null {
  if (/OK en [\d.]+ min/i.test(log)) return 'done';
  // 'done' explícito por algunos casos donde renderiza imprime "DONE" o similar
  if (/RENDER\s+(?:OK|DONE|COMPLETED?)/i.test(log)) return 'done';
  if (/RENDER\s+FAILED/i.test(log)) return 'failed';
  if (/Traceback \(most recent call last\)/i.test(log)) return 'failed';
  return null;
}

/**
 * Mata un PID si está vivo. No lanza si ya estaba muerto.
 */
export function killPid(pid: number): boolean {
  try {
    if (process.platform === 'win32') {
      // SIGTERM no funciona limpio en Windows con procesos detached. Usamos taskkill.
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
