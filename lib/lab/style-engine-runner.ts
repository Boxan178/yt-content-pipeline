/**
 * Construye los prompts específicos por pantalla del wizard para invocar
 * style-engine via `claude -p` (modo no interactivo). Cada pantalla tira de
 * varios STATES en secuencia y termina con `<<<DONE>>>` para parseo robusto.
 *
 * IMPORTANTE: style-engine está pensada para uso interactivo (un input a la
 * vez). En el lab la lanzamos en batch con prompt explícito de "ejecuta varios
 * estados sin pausar". Ver sección 6 del LAB-PLAN: si la skill se resiste, hay
 * que reforzar el prompt o pedir a Pablo añadir un modo non-interactive.
 */

import 'server-only';
import { startJob, type ClaudeJob } from '../claude-jobs';
import { JARVIS_ROOT } from '../config';
import type { ChannelDraft } from './types';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 min — análisis largo

interface LaunchOpts {
  draft: ChannelDraft;
  /** Etiqueta para el badge ("ENGINE analizando", etc.). */
  label: string;
  /** Texto del prompt completo. */
  prompt: string;
  /** Carpeta donde se persiste el job (.claude-jobs). */
  videoFolder: string;
}

/** Arranca un job style-engine con la convención del lab. */
function launch(opts: LaunchOpts): ClaudeJob {
  return startJob({
    skill: 'style-engine',
    label: opts.label,
    prompt: opts.prompt,
    cwd: JARVIS_ROOT, // para que claude vea la skill style-engine
    timeoutMs: DEFAULT_TIMEOUT_MS,
    videoFolder: opts.videoFolder,
    model: 'sonnet', // default según LAB-PLAN sección 2.7
  });
}

// ── Pantalla 2: análisis (STATES 1-6) ─────────────────────────────────────

export function buildAnalysisPrompt(draft: ChannelDraft): string {
  const transcripts = (draft.transcripts ?? [])
    .filter((t) => t.trim().length > 0)
    .map((t, i) => `--- TRANSCRIPT #${i + 1} ---\n${t.trim()}`)
    .join('\n\n');

  const topic =
    draft.initialTopic.trim().toLowerCase() === 'ideas-please' ||
    draft.initialTopic.trim() === ''
      ? 'Genera 5 ideas de vídeo alineadas con el nicho detectado y elige la primera para escribir el script.'
      : draft.initialTopic.trim();

  return `ENGINE, ejecuta los STATES 1 a 6 en SECUENCIA para este canal. NO uses tu modo interactivo de "para después de cada estado": esta es una sesión claude -p no interactiva. Ejecuta los 6 estados de tirón y entrega los outputs en los bloques delimitados con headers estándar (separadores ──────────).

STATE 1 — CHANNEL LINK
${draft.referenceChannelUrl}

STATE 2 — TRANSCRIPTS
${transcripts}

STATE 3 — TOPIC
${topic}

STATE 4 — ANÁLISIS DEL CANAL
Extrae el análisis completo en el bloque estándar.

STATE 5 — STYLE DNA
Extrae el Style DNA completo en el bloque estándar.

STATE 6 — GENERACIÓN DEL SCRIPT (STYLE LOCKED)
Genera el guion completo respetando el Style DNA, el pacing y el target words. Cierra con el bloque WORD COUNT FINAL.

Cuando termines, escribe la línea exacta:
<<<DONE>>>`;
}

export function launchAnalysisJob(draft: ChannelDraft, videoFolder: string): ClaudeJob {
  return launch({
    draft,
    label: 'ENGINE — análisis + Style DNA + script',
    prompt: buildAnalysisPrompt(draft),
    videoFolder,
  });
}

// ── Pantalla 3: visual (STATES 7-13 sin 10) ───────────────────────────────

export function buildVisualsPrompt(draft: ChannelDraft): string {
  const frames =
    draft.sampleFrameUrls.length > 0
      ? draft.sampleFrameUrls.map((p, i) => `Frame ${i + 1}: ${p}`).join('\n')
      : '(NINGUNO — el usuario aún no subió frames; pide que se suban antes de generar prompts.)';

  const thumbs =
    draft.thumbnailSampleUrls.length > 0
      ? draft.thumbnailSampleUrls.map((p, i) => `Thumb ${i + 1}: ${p}`).join('\n')
      : '(NINGUNO — pide que se suban thumbnails de referencia.)';

  const styleDna = draft.styleDna ?? '(sin Style DNA aún — usa los transcripts directamente)';
  const channelAnalysis = draft.channelAnalysis ?? '(sin análisis previo)';
  const script = draft.scriptSample ?? '(sin script previo)';

  return `ENGINE, ejecuta los STATES 7, 8, 9, 11, 12 y 13 en SECUENCIA. NO uses tu modo interactivo. Lee los frames y thumbnails desde los paths absolutos que te paso (usa tu Read tool si son archivos en disco) y entrega los outputs en los bloques delimitados estándar.

CONTEXTO ya extraído (no lo regeneres, úsalo de referencia):
- Channel analysis:
${channelAnalysis}

- Style DNA:
${styleDna}

- Script style-locked:
${script}

STATE 7 — VISUAL INPUT
Frames del vídeo a analizar:
${frames}

STATE 8 — VISUAL STYLE PROFILE
Extrae el bloque VISUAL STYLE PROFILE estándar.

STATE 9 — IMAGE PROMPTS POR BEAT
Genera prompts de imagen para cada beat del script (máx 3-5s por beat). Cada prompt STANDALONE: sujeto + entorno + iluminación + mood + cámara + estilo. Usa el formato estándar (línea de texto del segmento, separador, bloque Prompt/Ángulo/Iluminación/Mood/Acción).

STATE 11 — THUMBNAIL INPUT
Thumbnails de referencia:
${thumbs}

STATE 12 — THUMBNAIL STYLE PROFILE
Extrae el bloque THUMBNAIL STYLE PROFILE estándar.

STATE 13 — THUMBNAILS
Genera 5 conceptos de thumbnail con sus bloques THUMBNAIL #1..#5 estándar (Concepto visual + Texto overlay + Trigger emocional + Prompt de generación).

OMITIR STATE 10 (video prompts) — no se piden en este lab.

Cuando termines, escribe la línea exacta:
<<<DONE>>>`;
}

export function launchVisualsJob(draft: ChannelDraft, videoFolder: string): ClaudeJob {
  return launch({
    draft,
    label: 'ENGINE — visual + thumbnails',
    prompt: buildVisualsPrompt(draft),
    videoFolder,
  });
}

// ── Pantalla 5: bootstrap (STATE 16 completo) ─────────────────────────────

export function buildBootstrapPrompt(draft: ChannelDraft): string {
  const styleDna = draft.styleDna ?? '(falta — el draft no completó pantalla 2)';
  const visualProfile = draft.visualStyleProfile ?? '(falta — pantalla 3 incompleta)';
  const thumbnailProfile = draft.thumbnailStyleProfile ?? '(falta)';
  const validation = draft.validation
    ? `Veredicto: ${draft.validation.verdict}\n${draft.validation.rawReport}`
    : '(sin validación previa — el usuario eligió saltarla)';

  return `ENGINE, ejecuta el STATE 16 completo (B1 a B7) para bootstrappear un canal nuevo a partir del análisis. NO uses tu modo interactivo "para después de cada bloque": ejecútalo de tirón y entrega cada bloque (B1..B7) con sus headers estándar.

CONTEXTO consolidado del wizard:

Canal de referencia: ${draft.referenceChannelUrl}
Idioma: ${draft.language}
Tema inicial: ${draft.initialTopic}

Style DNA:
${styleDna}

Visual Style Profile:
${visualProfile}

Thumbnail Style Profile:
${thumbnailProfile}

Validación de nicho (sección Fase 4 del lab):
${validation}

INSTRUCCIONES B1..B7:

B1 — Propón 5 NOMBRES de canal + handles + racional 1 línea cada uno.
B2 — Propón 3 VERSIONES de descripción del canal (corta, media, larga).
B3 — Redacta el LOGO PROMPT (EN, Nano Banana Pro, standalone).
B4 — Redacta el BANNER PROMPT (EN, Nano Banana Pro, 2560x1440 con safe area central 1546x423).
B5 — Vía de generación: indica Canva MCP / Nano Banana manual / Ambos (defaultea "nano-banana-manual" si no estás seguro).
B6 — NO ejecutes bootstrap_channel.py todavía — el wizard del lab lo lanzará tras la confirmación de Pablo. Solo entrega el comando preparado para ejecución, con las variables sustituidas (usa el nombre primero de B1 como placeholder).
B7 — Resumen final con el bloque "✅ CANAL BOOTSTRAP'EADO" + path tentativo H:/YOUTUBE/<nombre>/branding/.

Cuando termines, escribe la línea exacta:
<<<DONE>>>`;
}

export function launchBootstrapJob(draft: ChannelDraft, videoFolder: string): ClaudeJob {
  return launch({
    draft,
    label: 'ENGINE — bootstrap canal',
    prompt: buildBootstrapPrompt(draft),
    videoFolder,
  });
}
