// Server-only. Usa node:fs y se importa solo desde API routes.
// Los tipos/constantes que necesitan los componentes client viven en
// lib/progress-types.ts (browser-safe).

import 'server-only';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ProgressDetails, Progress } from './progress-types';
import { TTS_JOBS_ES, TTS_JOBS_EN } from './config';
import { readImageSize } from './image-size';

export type { ProgressDetails, Progress } from './progress-types';
export { HIT_LABELS, HIT_ORDER } from './progress-types';

const TOTAL_HITS = 6;
const SCRIPT_MIN_BYTES = 2 * 1024;
const RENDER_MIN_BYTES = 50 * 1024 * 1024;
const LOCUCION_MIN_FILES = 3;
// Caso "una historia, un audio": un único MP3/WAV/M4A sustancial es una locución
// completa por sí mismo (canales narrativos como Uncharted History / Vaultman, o
// cualquier canal que entregue el audio entero en un solo archivo en vez de
// chunks). Umbral conservador para descartar tests de pocos segundos. ~300KB de
// MP3 ≈ 25-40s de voz; cualquier locución real lo supera de sobra.
const LOCUCION_SINGLE_MIN_BYTES = 300 * 1024;

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv']);
const MAIN_AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a']);

// Una miniatura de YouTube válida es 16:9 (landscape). El flujo viejo de
// kie-bridge + nano-banana-2 devolvía a veces imágenes CUADRADAS (1:1) que NO
// sirven como miniatura, y aun así contaban como "hito miniatura hecho". Ahora
// exigimos al menos una imagen landscape. Umbral 1.4: 16:9 ≈ 1.78 y 1376×768 ≈
// 1.79 pasan; 1:1 = 1.0 y cualquier vertical se rechazan. (Política 2026-05-30:
// las miniaturas se generan con mcp__algrow__generate_image a 16:9.)
export const THUMB_MIN_ASPECT = 1.4;

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

/**
 * ¿Hay un guion escrito como `guion*.md` (guion.md, guion-v2.md, guion-final.md…)
 * en la raíz del video folder, en _PACKAGING o en _GUION? SARA/MARCO lo escriben en
 * alguno de esos sitios según el pipeline (verificado empíricamente). Cubre sleep
 * stories cuyo texto largo es el guion y cuyo packaging.md puede ser fino (<2KB), y
 * los vídeos cuyo guion vive en `_GUION/guion-final.md` (convención Moderni Stoici).
 */
async function folderHasGuion(videoFolder: string): Promise<boolean> {
  for (const dir of [
    videoFolder,
    path.join(videoFolder, '_PACKAGING'),
    path.join(videoFolder, '_GUION'),
  ]) {
    const files = await safeReaddir(dir);
    for (const f of files) {
      if (/^guion[\w.-]*\.md$/i.test(f)) {
        const s = await tryStat(path.join(dir, f));
        if (s && s.isFile() && s.size >= SCRIPT_MIN_BYTES) return true;
      }
    }
  }
  return false;
}

/**
 * ¿Existe al menos una miniatura landscape (≈16:9) en `dir`? Mide cada imagen
 * por su cabecera y la acepta si su ratio ≥ THUMB_MIN_ASPECT. Las cuadradas
 * (1:1) y verticales NO cuentan como hito cumplido.
 *
 * Fallback conservador: si NINGUNA imagen se puede medir (formato raro,
 * archivo corrupto, cabecera ilegible), volvemos al comportamiento anterior
 * (basta con que exista una imagen) para no marcar como incompleto un vídeo que
 * sí tiene miniatura válida pero que no supimos medir.
 */
async function hasLandscapeThumbnail(dir: string, imageNames: string[]): Promise<boolean> {
  if (imageNames.length === 0) return false;
  let measuredAny = false;
  for (const name of imageNames) {
    const size = await readImageSize(path.join(dir, name));
    if (!size) continue;
    measuredAny = true;
    if (size.width / size.height >= THUMB_MIN_ASPECT) return true;
  }
  // Medimos alguna y ninguna era landscape → no hay miniatura válida (false).
  // No pudimos medir ninguna → fallback "existe = hecho" (true).
  return !measuredAny;
}

export interface ComputeProgressOptions {
  /**
   * `true` si el canal tiene una biblioteca de brutos compartida con clips. En
   * ese caso el hito "brutos visuales" se da por cumplido aunque no haya material
   * en `01_BRUTOS/_VÍDEO/` (caso Moderni Stoici / Moderno Estoico: el render toma
   * los brutos de la biblioteca común, no hay material por vídeo).
   */
  sharedBrutosAvailable?: boolean;
}

export async function computeProgress(
  videoFolder: string,
  opts: ComputeProgressOptions = {},
): Promise<Progress> {
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
  // SARA escribe el guion como `guion*.md` en la carpeta del vídeo (convención del
  // pipeline de ideas; verificado ~50KB). Cuenta como "guion hecho" aunque el
  // packaging.md sea fino (caso típico de sleep stories). Additivo: solo suma.
  const hasGuionFile =
    hasPackagingScript || hasSleepStoryScript ? false : await folderHasGuion(videoFolder);
  const scriptWritten = hasPackagingScript || hasSleepStoryScript || hasGuionFile;

  const locucionFiles = await safeReaddir(locucionDir);
  const audioNames = locucionFiles.filter((f) =>
    MAIN_AUDIO_EXT.has(path.extname(f).toLowerCase()),
  );
  const audioCount = audioNames.length;
  // Lista (≥3 chunks) → locución por chunks. Un único archivo sustancial →
  // locución completa "una historia, un audio". Cualquiera de los dos cuenta.
  let locucionReady = audioCount >= LOCUCION_MIN_FILES;
  if (!locucionReady && audioCount === 1) {
    const s = await tryStat(path.join(locucionDir, audioNames[0]));
    locucionReady = !!s && s.size >= LOCUCION_SINGLE_MIN_BYTES;
  }

  const videoFiles = await safeReaddir(videoDir);
  const brutosVisuales =
    opts.sharedBrutosAvailable === true ||
    videoFiles.some((f) =>
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
  const miniaturaImageNames = miniaturasFiles.filter((f) =>
    IMAGE_EXT.has(path.extname(f).toLowerCase()),
  );
  const miniaturaFinal = await hasLandscapeThumbnail(miniaturasDir, miniaturaImageNames);

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
