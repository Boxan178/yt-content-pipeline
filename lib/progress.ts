// Server-only. Usa node:fs y se importa solo desde API routes.
// Los tipos/constantes que necesitan los componentes client viven en
// lib/progress-types.ts (browser-safe).

import 'server-only';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ProgressDetails, Progress } from './progress-types';
import { TTS_JOBS_ES, TTS_JOBS_EN } from './config';

export type { ProgressDetails, Progress } from './progress-types';
export { HIT_LABELS, HIT_ORDER } from './progress-types';

const TOTAL_HITS = 6;
const SCRIPT_MIN_BYTES = 2 * 1024;
const RENDER_MIN_BYTES = 50 * 1024 * 1024;
const LOCUCION_MIN_FILES = 3;

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv']);
const MAIN_AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a']);

async function safeReaddir(p: string): Promise<string[]> {
  try {
    return await readdir(p);
  } catch {
    return [];
  }
}

async function tryStat(p: string) {
  try {
    return await stat(p);
  } catch {
    return null;
  }
}

/**
 * Detecta si esta carpeta es una sleep story y, si lo es, devuelve si hay
 * texto de guion en el tts-jobs JSON correspondiente.
 */
async function sleepStoryHasScript(videoFolder: string): Promise<boolean> {
  const folderName = path.basename(videoFolder).normalize('NFC');
  if (!folderName.startsWith('story-')) return false;
  const isSpanish = folderName.endsWith('-es');
  const ttsJobsPath = isSpanish ? TTS_JOBS_ES : TTS_JOBS_EN;
  try {
    const raw = await readFile(ttsJobsPath, 'utf-8');
    const parsed = JSON.parse(raw) as { jobs?: Array<{ outputDir?: string; chunks?: Array<{ text?: string }> }> };
    const job = parsed.jobs?.find((j) => j.outputDir === folderName);
    const text = job?.chunks?.[0]?.text;
    return !!text && text.length >= 200; // texto sustantivo
  } catch {
    return false;
  }
}

export async function computeProgress(videoFolder: string): Promise<Progress> {
  const packagingDir = path.join(videoFolder, '_PACKAGING');
  const packagingMdPath = path.join(packagingDir, 'packaging.md');
  const miniaturasDir = path.join(packagingDir, 'MINIATURAS');
  const brutosDir = path.join(videoFolder, '01_BRUTOS');
  const locucionDir = path.join(brutosDir, '_LOCUCION');
  const videoDir = path.join(brutosDir, '_VÍDEO');
  const renderDir = path.join(videoFolder, 'RENDER');

  const pkgStat = await tryStat(packagingMdPath);
  const hasPackagingMd = !!pkgStat && pkgStat.isFile();
  // scriptWritten cuenta como true si hay packaging.md ≥2KB O si es sleep story
  // con texto en tts-jobs.json. Cubre vídeos largos Moderni Stoici y sleep stories.
  const hasPackagingScript = !!pkgStat && pkgStat.size >= SCRIPT_MIN_BYTES;
  const hasSleepStoryScript = !hasPackagingScript ? await sleepStoryHasScript(videoFolder) : false;
  const scriptWritten = hasPackagingScript || hasSleepStoryScript;

  const locucionFiles = await safeReaddir(locucionDir);
  const audioCount = locucionFiles.filter((f) =>
    MAIN_AUDIO_EXT.has(path.extname(f).toLowerCase()),
  ).length;
  const locucionReady = audioCount >= LOCUCION_MIN_FILES;

  const videoFiles = await safeReaddir(videoDir);
  const brutosVisuales = videoFiles.some((f) =>
    VIDEO_EXT.has(path.extname(f).toLowerCase()) ||
    IMAGE_EXT.has(path.extname(f).toLowerCase()),
  );

  const renderFiles = await safeReaddir(renderDir);
  let renderPrincipal = false;
  for (const f of renderFiles) {
    if (!VIDEO_EXT.has(path.extname(f).toLowerCase())) continue;
    if (/^Short\s+\d/i.test(f)) continue;
    const s = await tryStat(path.join(renderDir, f));
    if (s && s.size >= RENDER_MIN_BYTES) {
      renderPrincipal = true;
      break;
    }
  }

  const miniaturasFiles = await safeReaddir(miniaturasDir);
  const miniaturaFinal = miniaturasFiles.some((f) =>
    IMAGE_EXT.has(path.extname(f).toLowerCase()),
  );

  const details: ProgressDetails = {
    hasPackagingMd,
    scriptWritten,
    locucionReady,
    brutosVisuales,
    renderPrincipal,
    miniaturaFinal,
  };

  const hits = Object.values(details).filter(Boolean).length;
  return {
    hits,
    total: TOTAL_HITS,
    percent: Math.round((hits / TOTAL_HITS) * 100),
    details,
  };
}
