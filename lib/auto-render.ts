// Motor de AUTO-RENDER (Pablo, 2026-06-03). Renderiza vídeos listos UNO A UNO.
//
// Un vídeo está "listo para render" cuando tiene TODO hecho menos el render
// (packaging + guion + locución + brutos + miniatura, sin renderPrincipal) y no
// hay jobs vivos en su carpeta. El render lo hace LUIS (buildLuisRender) por el
// MISMO camino que el botón del modal (startJob run-once: el endpoint de jobs no
// usa `loop`, así que NO se re-lanza → sin renders duplicados).
//
// Gate SECUENCIAL: nunca se arranca un render si ya hay otro corriendo (1 a 1,
// por estabilidad). Lo respetan tanto el tick automático como el botón manual.

import 'server-only';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { CHANNELS, type Channel } from './channels';
import { computeProgress } from './progress';
import { listActiveJobsForFolder, startJob } from './claude-jobs';
import { buildLuisRender } from './prompts';
import { getRenderMode } from './render-mode';
import { JARVIS_ROOT } from './config';

export interface RenderReadyVideo {
  channel: string;
  title: string;
  folderPath: string;
}

function listProductionFolders(ch: Channel): string[] {
  const prod = ch.stateFolders?.production;
  if (!prod || !ch.rootPath) return [];
  const base = path.join(ch.rootPath, prod);
  const ignore = new Set((ch.ignoreFolders ?? []).map((s) => s.normalize('NFC')));
  try {
    return readdirSync(base, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !ignore.has(e.name.normalize('NFC')))
      .map((e) => path.join(base, e.name));
  } catch {
    return [];
  }
}

function isLuisJob(skill?: string, label?: string): boolean {
  return /lu[ií]s/i.test(skill ?? '') || /lu[ií]s/i.test(label ?? '');
}

/** ¿Hay un render (LUIS) corriendo ahora mismo? Gate secuencial: 1 a la vez. */
export function isAnyRenderRunning(): boolean {
  for (const ch of CHANNELS) {
    if (!ch.enabled) continue;
    for (const folder of listProductionFolders(ch)) {
      const fwd = folder.replace(/\\/g, '/');
      if (listActiveJobsForFolder(fwd).some((j) => isLuisJob(j.skill, j.label))) return true;
    }
  }
  return false;
}

async function folderIsRenderReady(folder: string, ch: Channel): Promise<boolean> {
  try {
    const p = await computeProgress(folder, {
      sharedBrutosAvailable: !!ch.sharedBrutosLibrary,
    });
    const d = p.details;
    return (
      d.hasPackagingMd &&
      d.scriptWritten &&
      d.locucionReady &&
      d.brutosVisuales &&
      d.miniaturaFinal &&
      !d.renderPrincipal
    );
  } catch {
    return false;
  }
}

/** Vídeos en producción con todo hecho menos el render y sin jobs vivos. */
export async function findRenderReadyVideos(): Promise<RenderReadyVideo[]> {
  const out: RenderReadyVideo[] = [];
  for (const ch of CHANNELS) {
    if (!ch.enabled) continue;
    for (const folder of listProductionFolders(ch)) {
      const fwd = folder.replace(/\\/g, '/');
      if (listActiveJobsForFolder(fwd).length > 0) continue; // ocupado
      if (await folderIsRenderReady(fwd, ch)) {
        out.push({ channel: ch.slug, title: path.basename(folder), folderPath: folder });
      }
    }
  }
  return out;
}

/** Arranca el render (LUIS) de un vídeo. Run-once (sin loop → sin duplicados). */
export function startRenderFor(video: RenderReadyVideo): { jobId: string } {
  const luis = buildLuisRender({
    channel: video.channel,
    title: video.title,
    state: 'production',
    folderPath: video.folderPath,
  });
  const job = startJob({
    skill: 'luis',
    label: `LUIS — render: ${video.title.slice(0, 40)}`,
    prompt: luis.prompt,
    cwd: luis.cwd ?? JARVIS_ROOT,
    videoFolder: video.folderPath.replace(/\\/g, '/'),
    timeoutMs: luis.timeoutMs,
    model: luis.model,
  });
  return { jobId: job.jobId };
}

/**
 * Tick de auto-render: si modo 'auto' y NO hay render corriendo, arranca el
 * render del primer vídeo listo (UNO A UNO). No-op en modo 'manual'. Llamado
 * desde el poller (junto a la auto-publicación).
 */
export async function tickAutoRender(): Promise<{ started?: RenderReadyVideo }> {
  if (getRenderMode() !== 'auto') return {};
  if (isAnyRenderRunning()) return {};
  const ready = await findRenderReadyVideos();
  if (ready.length === 0) return {};
  startRenderFor(ready[0]);
  return { started: ready[0] };
}
