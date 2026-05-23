// Builders centralizados de prompts para `claude -p`. Mantener aquí evita
// ensuciar componentes y permite iterar los prompts sin tocar UI.
//
// Convenciones:
// - Cada función recibe el contexto mínimo y devuelve { prompt, cwd, timeoutMs? }
// - CWD por defecto: raíz de J.A.R.V.I.S. para que Claude vea skills + memoria
// - timeoutMs solo si la skill puede tardar > 10 min (SARA, LUIS, etc.)

import type { ProgressDetails } from './progress-types';

const JARVIS_ROOT = 'Y:/04_DEV/J.A.R.V.I.S';
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const LONG_TIMEOUT_MS = 30 * 60 * 1000;
const VERY_LONG_TIMEOUT_MS = 45 * 60 * 1000;

export interface BuiltPrompt {
  prompt: string;
  cwd: string;
  timeoutMs: number;
  /**
   * Modelo recomendado. 'sonnet' por defecto (más barato).
   * Usa 'opus' SOLO para skills que requieren razonamiento profundo o
   * escritura creativa larga (SARA, MARCO AURELIO, NORA+IRIS).
   */
  model?: 'sonnet' | 'opus';
  /**
   * Si está presente, el cliente reintenta hasta `maxRetries` veces si el
   * output final no contiene `successMarker` (case-insensitive). Útil para
   * skills donde Pablo quiere "no parar hasta que esté bien" — el agente
   * recibe instrucciones en el prompt para terminar con un marcador
   * concreto (`<<<DONE>>>` por defecto) cuando el resultado es óptimo.
   */
  loop?: {
    successMarker: string;
    maxRetries: number;
  };
}

/** Bloque común que se appendea a un prompt para activar el patrón "loop". */
export const LOOP_INSTRUCTION = `

---

IMPORTANTE — MODO ITERACIÓN ACTIVADO:

Cuando termines el trabajo y consideres que el resultado es óptimo (cumple todo lo pedido, sin pendientes triviales que tú mismo puedas resolver), termina tu mensaje con la línea EXACTA:

\`\`\`
<<<DONE>>>
\`\`\`

Si el resultado NO es óptimo todavía y crees que puedes mejorarlo en otro intento (pero estás bloqueado por algo concreto), termina con:

\`\`\`
<<<RETRY: <razón breve>>>>
\`\`\`

El sistema relanzará automáticamente el prompt si NO ve <<<DONE>>>. Hay un máximo de reintentos — no abuses, solo pide RETRY si de verdad crees que mejoras.`;

export interface VideoContext {
  channel: string;
  title: string;
  state: string; // production | ready | uploaded | archived
  folderPath: string;
  progress?: {
    hits: number;
    total: number;
    percent: number;
    details: ProgressDetails;
  };
}

function progressSummary(p: VideoContext['progress']): string {
  if (!p) return '(progreso desconocido)';
  const lines = Object.entries(p.details).map(([k, v]) => `  - ${v ? '✓' : '○'} ${k}`);
  return `Progreso: ${p.hits}/${p.total} hitos (${p.percent}%)\n${lines.join('\n')}`;
}

// ── ELENA — Auditoría del guion ──────────────────────────────────────────

export function buildElenaAudit(v: VideoContext): BuiltPrompt {
  // Detecta sleep story para añadir hint del path del tts-jobs.json
  const folderName = v.folderPath.replace(/\\/g, '/').split('/').pop() ?? '';
  const isSleepStory = folderName.startsWith('story-');
  const isSpanish = folderName.endsWith('-es');
  const sleepHint = isSleepStory
    ? `

ATENCIÓN — es una **sleep story**. El guion NO vive en _PACKAGING/packaging.md. El texto canónico está en:
  Y:/04_DEV/J.A.R.V.I.S/youtube-os/proyectos/sleep-stories-stoic/content/tts-jobs-${isSpanish ? 'es' : 'en'}.json
  Filtra el array jobs por outputDir === "${folderName}" y audita el text del chunk 1.
  (También puedes consultar el master limpio en youtube-os/proyectos/sleep-stories-stoic/content/100-stories-master-clean.md y la versión raw en 100-stories-master.md.)`
    : '';
  return {
    cwd: JARVIS_ROOT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    model: 'sonnet', // ELENA es auditoría estructurada, sonnet basta
    prompt: `ELENA, audita el guion del vídeo "${v.title}" del canal ${v.channel}.

La carpeta del proyecto está en: ${v.folderPath}
${sleepHint}

Aplica el flujo completo de tu skill script-auditor. Si detectas que el canal es Moderni Stoici o Moderno Estoico, activa la Capa 6 (Verificación Factual Estoica).

Entrega el informe completo con bloques 0-7 + ELENA_SCORE + ELENA_VEREDICTO + brief para el guionista (MARCO AURELIO si es canal estoico, VÍCTOR en otros casos).`,
  };
}

// ── AMELIA — QA del vídeo renderizado ────────────────────────────────────

export function buildAmeliaAudit(v: VideoContext): BuiltPrompt {
  return {
    cwd: JARVIS_ROOT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    model: 'sonnet', // AMELIA es checklist QA, sonnet basta
    prompt: `AMELIA, audita el vídeo renderizado "${v.title}" del canal ${v.channel} antes de publicación.

La carpeta del proyecto está en: ${v.folderPath}

El render final debería estar en la subcarpeta RENDER/. La miniatura en _PACKAGING/MINIATURAS/. El packaging escrito en _PACKAGING/packaging.md.

Aplica tu flujo QA: revisa packaging visual, hook, cuerpo, cierre. Considera customer-persona = MARCUS HALE y marketplace = canal YouTube ${v.channel}. Entrega el informe con veredicto APTO / NEEDS REVISION / REJECT + brief específico si hay revisiones.`,
  };
}

// ── MARCUS HALE — Review viewer-persona ──────────────────────────────────

export function buildMarcusReview(v: VideoContext): BuiltPrompt {
  return {
    cwd: JARVIS_ROOT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    model: 'sonnet', // MARCUS es viewer-review corto, sonnet basta
    prompt: `MARCUS HALE, haz un review como viewer-persona del vídeo "${v.title}" del canal ${v.channel}.

Carpeta del proyecto: ${v.folderPath}

El packaging está en _PACKAGING/packaging.md (incluye título final, descripción y dirección de miniatura). El render en RENDER/. La miniatura en _PACKAGING/MINIATURAS/.

Aplica tu flujo de review: hook (primeros 30s), packaging visual, muestra del cuerpo, cierre. Formato obligatorio: veredicto en 1 línea ("me hablaría" / "me hablaría con dudas" / "no me hablaría") + qué funciona / qué duda / qué echa atrás + qué cambiarías + tests.`,
  };
}

// ── SARA — Orquestadora, retomar pipeline desde donde esté ───────────────

export function buildSaraResume(v: VideoContext): BuiltPrompt {
  const progress = progressSummary(v.progress);
  // Detectamos canal estoico para que SARA sepa el routing desde el primer momento
  const isStoic = v.channel === 'moderni-stoici' || v.channel === 'moderno-estoico';
  return {
    cwd: JARVIS_ROOT,
    timeoutMs: LONG_TIMEOUT_MS,
    model: 'opus', // SARA orquesta, razonamiento complejo + mucho contexto → opus
    prompt: `SARA, retoma el pipeline del vídeo "${v.title}" del canal ${v.channel}.

CONTEXTO QUE YA TENGO:
- Canal: ${v.channel} (routing: ${isStoic ? '**ESTOICO** → MARCO AURELIO en Fase 2, IRIS+CIRO en Fase Visual, MARCUS HALE como gate, Capa 6 obligatoria' : 'estándar → VÍCTOR en Fase 2'})
- Carpeta del proyecto en disco: ${v.folderPath}
- Estado físico según filesystem: ${v.state} (production / ready / uploaded / archived)
- Vídeo: long-form
${progress}

TU TRABAJO (en este orden):

1. **Luna Media OS — pipeline_item_id**. ANTES de delegar a cualquier agente, localiza el \`pipeline_item_id\` (UUID) de este vídeo en Supabase (proyecto trnlcfkomjljypzpxejt). Usa la query:
   \`\`\`sql
   SELECT id, title, channel_id, status FROM pipeline_items
   WHERE title ILIKE '%${v.title.replace(/'/g, "''").slice(0, 60)}%'
   ORDER BY created_at DESC LIMIT 5;
   \`\`\`
   Si no existe ninguna fila para este vídeo, CRÉALA con un INSERT mínimo (channel_id correcto, title literal, status apropiado al estado actual, video_type='long-form') y guarda el UUID resultante. Pasa este UUID a TODOS los subagentes que actives.

2. **Diagnóstico**. Lee la carpeta del proyecto y la fila de Luna Media OS. Identifica:
   - Qué fases están completas (Packaging / Creación / Visual / Audio / Edición / Pre-publicación)
   - Qué falta para llegar al estado "listo para subir a YouTube"
   - El "Estado de entrada" según tu skill (0, A, B, C, D, E o F)
   ${isStoic ? '- Si Capa 6 de ELENA ya pasó sin 🔴 (revisar packaging.md o informes previos)' : ''}

3. **Anuncia la ruta** que vas a seguir antes de ejecutar nada. Lista qué fase retomas, qué agentes activas, en qué orden, y qué decisiones humanas vas a necesitar (si las hay).

4. **Ejecuta lo que puedas autónomamente**. Activa las skills en el orden canónico del pipeline:
   - Fase 1: MARCOS → NORA → IRIS${isStoic ? ' → MARCUS HALE (gate)' : ''}
   - Fase 2: ${isStoic ? 'MARCO AURELIO' : 'VÍCTOR'} → ELENA → refinado${isStoic ? ' → MARCUS HALE (gate)' : ''}
   ${isStoic ? '- Fase Visual: IRIS (image_prompts) → CIRO (video_prompts)' : ''}
   - Fase Audio: ${isStoic ? 'CERVANTES/ORWELL' : 'CERVANTES'} → CICERÓN → CALIOPE
   - Fase Edición: LUÍS
   - Fase 3 Pre-publicación: youtube-seo-optimizer → chapters (con timestamps reales sobre MP4)

5. **Escribe el output de cada agente en Luna Media OS** según tu protocolo (MARCOS → pipeline_items_titles, NORA → pipeline_items_thumbnail_prompts con brief, IRIS → UPDATE image_prompt, ${isStoic ? 'MARCO AURELIO' : 'VÍCTOR'} → pipeline_items.script_content). Verifica con SELECT que cada apartado quedó escrito antes de pasar al siguiente.

6. **Si necesitas una decisión que solo puedo tomar yo** (elegir entre títulos, aprobar dirección de miniatura, validar un cambio de guion, decidir si publicar pese a un warning), PÁRATE en ese punto exacto. NO inventes la decisión. Anota el bloqueo en una lista y sigue avanzando con todo lo demás que pueda hacerse en paralelo sin depender de esa decisión.

7. **Entrega final**: usa tu formato canónico de PASO 16 (resumen del proceso + fases ejecutadas + agentes activados + veredicto). Incluye explícitamente:
   - El \`pipeline_item_id\` que usaste
   - Lista de archivos modificados/creados en H:\\YOUTUBE y en youtube-os/
   - Lista de decisiones bloqueadas pendientes de mi input
   - Próximo paso recomendado

IMPORTANTE: te ejecuto desde una sesión no-interactiva (\`claude -p\`). NO puedes hacerme preguntas durante la sesión y esperar respuesta — la sesión muere al terminar tu turno. Cualquier input que necesites lo dejas en el brief final de PASO 16 y yo lo resuelvo después relanzándote con la decisión tomada.`,
  };
}

// ── CALIOPE — Generar audios restantes (TTS) ─────────────────────────────

export function buildCaliopeFullAudio(v: VideoContext): BuiltPrompt {
  const isStoic = v.channel === 'moderni-stoici' || v.channel === 'moderno-estoico';
  const folder = v.folderPath.replace(/\\/g, '/');
  const locucionDir = `${folder}/01_BRUTOS/_LOCUCION`;
  // Para sleep stories el tts-jobs.json vive en el proyecto compartido
  const ttsJobsHint = isStoic
    ? `Si este vídeo es una sleep story (slug empieza por "story-"), busca el tts-jobs.json en:
- Inglés (Moderni Stoici): Y:/04_DEV/J.A.R.V.I.S/youtube-os/proyectos/sleep-stories-stoic/content/tts-jobs-en.json
- Español (Moderno Estoico): Y:/04_DEV/J.A.R.V.I.S/youtube-os/proyectos/sleep-stories-stoic/content/tts-jobs-es.json
Filtra los jobs cuya outputDir coincida con el slug de este vídeo.

Si NO es sleep story, busca el tts-jobs.json del vídeo (típicamente en _PACKAGING/ o en el folder del proyecto generado por CICERÓN previamente).`
    : `Busca el tts-jobs.json del vídeo (típicamente en _PACKAGING/ o donde CICERÓN lo dejó previamente).`;
  return {
    cwd: JARVIS_ROOT,
    timeoutMs: LONG_TIMEOUT_MS,
    model: 'sonnet', // CALIOPE es ejecución TTS mecánica, sonnet basta
    prompt: `CALIOPE, completa la locución del vídeo "${v.title}" del canal ${v.channel}.

Carpeta del proyecto: ${folder}
Carpeta destino de audios: ${locucionDir}

Tu trabajo:

1. **Inventario actual**. Lista los .mp3 que ya existen en ${locucionDir}/. Identifica qué chunks tienes ya (por filename).

2. **Encontrar el plan**. ${ttsJobsHint}

3. **Comparar y delta**. Cruza:
   - jobs definidos en tts-jobs.json
   - chunks ya generados en ${locucionDir}/

   Reporta cuántos chunks faltan por generar.

4. **Ejecutar los faltantes** vía Algrow MCP (\`mcp__algrow__generate_tts\`), uno por uno. Respeta voice_id, model, settings y preset definidos en el tts-jobs.json. Descarga cada MP3 generado al filename exacto indicado en el job (en ${locucionDir}/).

5. **Reportar resultado**: cuántos chunks generaste nuevos, cuántos ya existían, cuánto duraron en total, y si hubo errores.

Política Algrow-only — nunca ElevenLabs SDK directo. Si Algrow falla, reporta el error y para — no caigas a otro proveedor.

Si NO encuentras un tts-jobs.json relevante, devuelve un brief explicando qué necesitas que Pablo decida o regenere (pasar antes por CICERÓN, etc).`,
  };
}

// ── NORA + IRIS — Generar concepto visual + ejecutar imagen vía kie-bridge ──

export function buildNoraIris(v: VideoContext): BuiltPrompt {
  const isStoic = v.channel === 'moderni-stoici' || v.channel === 'moderno-estoico';
  const miniaturesDir = `${v.folderPath.replace(/\\/g, '/')}/_PACKAGING/MINIATURAS`;
  return {
    cwd: JARVIS_ROOT,
    timeoutMs: LONG_TIMEOUT_MS,
    model: 'opus', // miniatura es creativo (concepto+prompt), opus da mejor calidad visual
    prompt: `Necesito una miniatura nueva (o una iteración) para el vídeo "${v.title}" del canal ${v.channel}.

Carpeta del proyecto: ${v.folderPath}
Packaging en: ${v.folderPath}/_PACKAGING/packaging.md
Carpeta destino para las imágenes: ${miniaturesDir}

Flujo (en este orden):

1. **NORA** (skill agente-miniaturas) — lee el packaging.md, mira las miniaturas previas en _PACKAGING/MINIATURAS/, propón concepto visual nuevo o iteración. Entrega NORA_SCORE, NORA_VEREDICTO y brief estructurado para IRIS.

2. **IRIS** (skill nano-banana-iris) — recibe el brief de NORA. Construye el prompt técnico final. Entrega IRIS_SCORE, IRIS_VEREDICTO, prompt principal + 2 variantes A/B.

${isStoic ? '3. **MARCUS HALE** (gate viewer-persona) — review rápido del concepto. Veredicto: "haría clic" / "haría clic con dudas" / "no haría clic" + qué cambiarías. Si destroza el concepto, vuelve a NORA antes de generar.\n\n' : ''}**EJECUCIÓN DIRECTA (Ruta A de IRIS, sin portapapeles)**:

Usa la **Ruta A — Ejecución directa vía kie-bridge** que ya está en tu skill. NO pongas el prompt en el portapapeles, NO menciones Flow. Genera la imagen directamente en disco invocando kie-bridge con \`nano-banana-2\`:

\`\`\`powershell
python Y:/04_DEV/J.A.R.V.I.S/lab/kie-bridge/kie.py \`
  --model nano-banana-2 \`
  --prompt-file <archivo_temporal_con_prompt_principal> \`
  --aspect 16:9 \`
  --resolution 2K \`
  --format jpg \`
  --out "${miniaturesDir}/v$(timestamp).jpg"
\`\`\`

Donde \`$(timestamp)\` sigue el patrón \`YYYY-MM-DD_HHmmss\` para no sobrescribir. Por ejemplo: \`v2026-05-22_001530.jpg\`.

Genera **3 variantes** (prompt principal + A + B) ejecutadas, cada una a su propio archivo en ${miniaturesDir}/. Así Pablo puede comparar en la galería de la app sin pasar por Flow.

Tras cada generación reporta brevemente el archivo creado y el tiempo de kie-bridge.

Al final, deja un mini-resumen:
- Las 3 rutas archivos generadas (paths absolutos)
- Cuál recomiendas tú como principal (con razón en 1 línea)
- Si MARCUS HALE marcó alguna mejor o peor

Guarda también el brief completo NORA+IRIS en ${v.folderPath}/_PACKAGING/iris-brief-<timestamp>.md como histórico textual.${LOOP_INSTRUCTION}`,
    loop: { successMarker: '<<<DONE>>>', maxRetries: 3 },
  };
}

// ── LUIS — Editar vídeo (skill completa: render + auto-audit + AMELIA + MARCUS + mover) ──

export function buildLuisRender(v: VideoContext): BuiltPrompt {
  return {
    cwd: JARVIS_ROOT,
    timeoutMs: VERY_LONG_TIMEOUT_MS,
    model: 'sonnet', // LUIS es orquestación mecánica (render→audit→mover), sonnet basta
    prompt: `LUÍS, edita el vídeo "${v.title}" del canal ${v.channel}.

Carpeta del proyecto: ${v.folderPath}

Aplica tu flujo end-to-end completo (skill luis):

1. STATE 1 — Captura y validación. Verifica que existen guion (en Y:/04_DEV/J.A.R.V.I.S/youtube-os/youtube/${v.channel}/guiones/<slug>/guion-v2.md o guion.md como fallback), locución (01_BRUTOS/_LOCUCION/ con al menos 3 MP3s), biblioteca de brutos del canal y biblioteca de música.
2. STATE 2 — Si el proyecto está en _PENDIENTE LOCUCION/ y la locución está hecha, muévelo a _EN PRODUCCIÓN/ antes de renderizar.
3. STATE 3 — Lanza el render en background con tools/render_project.py. Monitoriza el log. Tiempo típico 18-25 min para long-form.
4. STATE 4 — Auto-audit visual con /watch sobre el MP4 final (24 frames). Verifica capa oscura, subs 1 línea, sin asteriscos visibles, último frame limpio.
5. STATE 5 — Delegar a AMELIA. Audita el MP4 como producto digital del canal ${v.channel}. Customer persona: MARCUS HALE.
6. STATE 6 — Delegar a MARCUS HALE. Review como viewer-persona.
7. STATE 7 — Decisión: si AMELIA APTO + MARCUS "me hablaría", pasa a STATE 8. Si hay revisión técnica fixable, máx 2 reintentos. Si revisión semántica, registra en la tarea pero sigue.
8. STATE 8 — Mueve la carpeta de _EN PRODUCCIÓN a PENDIENTE DE REVISAR e invoca assign-task con texto "Revisar video autoedit: ${v.title}".
9. STATE 9 — Reporta el resultado en tu formato canónico (tabla MP4/Duración/Render time/AMELIA/MARCUS + frase de cierre en personalidad LUÍS).

IMPORTANTE: te lanzo desde una sesión no-interactiva (claude -p). Si en algún punto necesitas mi input, anótalo claro al final en lugar de quedarte esperando.${LOOP_INSTRUCTION}`,
    loop: { successMarker: '<<<DONE>>>', maxRetries: 3 },
  };
}

// ── MARCO AURELIO — Reescribir guion según informe ELENA ─────────────────

export function buildMarcoAurelioRewrite(
  v: VideoContext,
  elenaReportPath?: string,
): BuiltPrompt {
  const ref = elenaReportPath
    ? `Aplica las correcciones del informe de ELENA que está en: ${elenaReportPath}`
    : `Aplica las correcciones del informe de ELENA más reciente para este vídeo. Si no existe informe escrito, primero ejecuta una auditoría con ELENA y después aplica sus correcciones.`;
  return {
    cwd: JARVIS_ROOT,
    timeoutMs: LONG_TIMEOUT_MS,
    model: 'opus', // reescritura de guion = escritura creativa larga, opus
    prompt: `MARCO AURELIO, reescribe el guion del vídeo "${v.title}" del canal ${v.channel}.

Carpeta del proyecto: ${v.folderPath}
El guion actual debería estar en Y:/04_DEV/J.A.R.V.I.S/youtube-os/youtube/${v.channel}/guiones/<slug>/guion-v2.md (o guion.md como fallback). El slug está en el packaging.md del proyecto.

${ref}

Aplica las correcciones priorizando las marcadas como ALTA. Conserva lo que ELENA marca como "no tocar". Genera nueva versión guion-v3.md sin sobrescribir la v2. Al terminar, deja un changelog breve de qué cambiaste y por qué.`,
  };
}

// ── YouTube SEO Optimizer — Subir vídeo a YouTube ──────────────────────

export function buildUploadToYoutube(v: VideoContext): BuiltPrompt {
  return {
    cwd: JARVIS_ROOT,
    timeoutMs: LONG_TIMEOUT_MS,
    model: 'sonnet',
    prompt: `Sube el vídeo "${v.title}" del canal ${v.channel} a YouTube usando la skill \`youtube-seo-optimizer\`.

Carpeta del proyecto: ${v.folderPath}
- Render final: \`${v.folderPath}/RENDER/\` (busca el .mp4 principal > 50MB, NO los Shorts).
- Packaging.md (título, descripción, tags, CTA): \`${v.folderPath}/_PACKAGING/packaging.md\`.
- Miniatura: \`${v.folderPath}/_PACKAGING/MINIATURAS/\` — si existe \`.selected-thumb\`, lee ese nombre. Si no, usa la más reciente.

Pasos:
1. Verifica que tienes OAuth de YouTube válido (skill youtube-seo-optimizer). Si no, pide al usuario que ejecute el flow de OAuth manualmente y aborta.
2. Lee el packaging.md y extrae: título exacto, descripción, tags, sección CHAPTERS (timestamps).
3. Sube el render principal como borrador (privacy: 'private') con esa metadata.
4. Sube la miniatura elegida.
5. Devuelve el video ID y la URL de edición/preview en YouTube Studio.

NO publiques en público hasta que yo lo apruebe. Sube como private (borrador) en YouTube y dame el link para revisar.

Si algo va mal (render no existe, miniatura mala, OAuth caducado), reporta CLARO el error y no toques nada más.${LOOP_INSTRUCTION}`,
    loop: { successMarker: '<<<DONE>>>', maxRetries: 2 },
  };
}

// ── MARCOS — Estratega de títulos ────────────────────────────────────────

export function buildMarcosTitles(v: VideoContext): BuiltPrompt {
  return {
    cwd: JARVIS_ROOT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    model: 'sonnet',
    prompt: `MARCOS, propón opciones de título para el vídeo "${v.title}" del canal ${v.channel}.

Carpeta del proyecto: ${v.folderPath}
Packaging.md (si existe): ${v.folderPath.replace(/\\/g, '/')}/_PACKAGING/packaging.md

Sigue tu metodología:
1. Lee el packaging.md para entender la promesa central, el ángulo y el mercado.
2. Si no hay packaging o no tiene la idea clara, deduce la promesa central a partir del título de la carpeta + cualquier guion en youtube-os/youtube/${v.channel}/guiones/<slug>/.
3. Genera 4 rutas de título (curiosidad / search / tensión / híbrido). Para cada una:
   - Título exacto (máx 70 chars, idealmente <60).
   - Por qué funciona (1-2 líneas).
   - Cuál es la fuente de tráfico prioritaria (browse / search / suggested).
   - Tipo de espectador al que atrapa.
4. RECOMIENDA una de las 4 con razón explícita.
5. Si el packaging tiene un título actual, dilo y compáralo con las 4 propuestas — di si es mejor o peor.

Formato de salida: markdown con tabla o lista clara. Termina con un bloque "RECOMENDADO:" en negrita.`,
  };
}
