/**
 * Validador de nicho del lab. Combina Algrow MCP + MARIO.
 *
 * Implementación: NO llama MCP directamente desde la API route (los MCP solo
 * existen en el contexto de un claude subprocess). Lanza un único job claude
 * con la skill MARIO + instrucción explícita de usar Algrow MCP internamente
 * y devolver veredicto en JSON.
 *
 * El JSON resultante lo parsea `parseValidationResult` y se persiste en
 * `draft.validation`.
 */

import 'server-only';
import { startJob, type ClaudeJob } from '../claude-jobs';
import { JARVIS_ROOT } from '../config';
import type { ChannelDraft, ValidationReport } from './types';

const TIMEOUT_MS = 20 * 60 * 1000; // 20 min — MARIO + Algrow

export function buildValidationPrompt(draft: ChannelDraft): string {
  const dna = draft.styleDna ?? '(sin Style DNA — usa los transcripts y el URL del canal)';
  const analysis = draft.channelAnalysis ?? '(sin análisis previo)';
  const transcripts = (draft.transcripts ?? []).map((t, i) => `Transcript #${i + 1} (excerpt):\n${t.slice(0, 1500)}`).join('\n\n');

  return `MARIO, valida si este nicho merece la pena producir antes de bootstrapear el canal. Tu salida final DEBE ser un bloque JSON parseable bajo el header VALIDATION_JSON.

CONTEXTO del draft de canal:

Canal de referencia: ${draft.referenceChannelUrl}
Idioma objetivo: ${draft.language}
Tema inicial: ${draft.initialTopic || '(ideas-please)'}

Análisis del canal (state-engine):
${analysis}

Style DNA (state-engine):
${dna}

Transcripts de muestra:
${transcripts}

PASOS (usa Algrow MCP — herramientas mcp__algrow__*):
1. resolve_url(referenceChannelUrl) → resuelve a handle + channel_id.
2. channel_trends(channel_id) → tasa de crecimiento del canal de referencia.
3. search_viral_videos(<nicho>, daysBack=90, minVPH=3) → outliers (límite 20). Identifica si hay demanda fresca.
4. search_longform_channels(<nicho>, language=${draft.language}) → competencia (límite 20). Calcula saturación.
5. Analiza patrones, ángulos defendibles y riesgos.

VEREDICTO:
- 🟢 green si demand > 70 y saturation < 60 y ≥ 1 wedge defendible.
- 🟡 yellow si valores intermedios o algún wedge cuestionable.
- 🔴 red si demand < 40 o saturation > 85 sin wedge claro.

ENTREGA FINAL (obligatorio): un bloque con header exacto VALIDATION_JSON seguido del JSON parseable:

VALIDATION_JSON
─────────────────────────────────────────
{
  "verdict": "green" | "yellow" | "red",
  "demandScore": 0..100,
  "saturationScore": 0..100,
  "wedges": ["...", "..."],
  "risks": ["...", "..."],
  "referenceChannelsRecommended": [{"name": "...", "url": "...", "reason": "..."}],
  "keywords": [{"keyword": "...", "volume": 0, "competition": 0}],
  "rawReport": "Informe humano completo en markdown, multilínea (escapa saltos como \\n)."
}
─────────────────────────────────────────

Cuando hayas terminado, escribe la línea exacta:
<<<DONE>>>`;
}

export function launchValidationJob(draft: ChannelDraft, videoFolder: string): ClaudeJob {
  return startJob({
    skill: 'mario',
    label: 'MARIO — validación nicho',
    prompt: buildValidationPrompt(draft),
    cwd: JARVIS_ROOT,
    timeoutMs: TIMEOUT_MS,
    videoFolder,
    model: 'sonnet',
  });
}

/**
 * Extrae y parsea el bloque VALIDATION_JSON de la salida del job.
 * Devuelve null si no se encuentra o no es JSON válido.
 */
export function parseValidationResult(assistantText: string): ValidationReport | null {
  // Busca el header VALIDATION_JSON seguido de separador, luego el JSON.
  const match = assistantText.match(/VALIDATION_JSON\s*\n[─\-_]{20,}\n([\s\S]+?)\n[─\-_]{20,}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as Omit<ValidationReport, 'runAt'>;
    // Saneamiento defensivo
    if (!parsed.verdict || !['green', 'yellow', 'red'].includes(parsed.verdict)) return null;
    return {
      verdict: parsed.verdict,
      demandScore: Number(parsed.demandScore) || 0,
      saturationScore: Number(parsed.saturationScore) || 0,
      wedges: Array.isArray(parsed.wedges) ? parsed.wedges : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      referenceChannelsRecommended: Array.isArray(parsed.referenceChannelsRecommended)
        ? parsed.referenceChannelsRecommended
        : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      rawReport: typeof parsed.rawReport === 'string' ? parsed.rawReport : '',
      runAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
