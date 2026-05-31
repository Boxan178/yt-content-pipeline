// Builders centralizados de prompts para `claude -p`. Mantener aquí evita
// ensuciar componentes y permite iterar los prompts sin tocar UI.
//
// Convenciones:
// - Cada función recibe el contexto mínimo y devuelve { prompt, cwd, timeoutMs? }
// - CWD por defecto: raíz de J.A.R.V.I.S. para que Claude vea skills + memoria
// - timeoutMs solo si la skill puede tardar > 10 min (SARA, LUIS, etc.)

import type { ProgressDetails } from './progress-types';
import { JARVIS_ROOT, YOUTUBE_OS_ROOT, TTS_JOBS_ES, TTS_JOBS_EN } from './config';

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

/**
 * Bloque que se appendea a los prompts de SARA cuando corren dentro de la cola
 * "vídeo de principio a fin". La cola NO avanza al siguiente vídeo hasta que
 * este esté listo o bloqueado; SARA señala su estado con un marcador final.
 */
export const QUEUE_COMPLETION_INSTRUCTION = `

---

CONTEXTO DE EJECUCIÓN EN COLA (vídeo de principio a fin): te ejecuto en una cola que NO avanza al siguiente vídeo hasta que ESTE esté terminado. Avanza este vídeo lo más lejos posible en tu turno. Al cerrar, termina con UNA línea de estado EXACTA:
- \`<<<VIDEO_DONE>>>\` si el vídeo está LISTO PARA SUBIR (todos los hitos: guion, locución, brutos, render principal y miniatura final).
- \`<<<VIDEO_BLOCKED: motivo>>>\` si NO puedes avanzar más sin una decisión mía o por un fallo que requiere intervención humana (motivo en una frase).
- Si no pones marcador, el sistema medirá el progreso real en disco y te re-lanzará otro turno para seguir.
NUNCA subas a YouTube. No esperes respuesta interactiva — la sesión muere al cerrar tu turno; deja cualquier bloqueo en el marcador.`;

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

/**
 * Inyecta instrucciones adicionales de Pablo en un prompt ya construido.
 * Se colocan como bloque prioritario y, si el prompt termina con el bloque
 * LOOP_INSTRUCTION (patrón <<<DONE>>>), se insertan JUSTO ANTES de él para
 * que la instrucción de cierre con marcador siga siendo lo último que lee
 * el agente. Si `extra` está vacío o en blanco, devuelve `built` sin tocar.
 */
export function withExtraInstructions(built: BuiltPrompt, extra?: string): BuiltPrompt {
  const trimmed = extra?.trim();
  if (!trimmed) return built;

  const block = `

---

INSTRUCCIONES ADICIONALES DE PABLO (prioritarias — aplican a TODAS las fases del proceso, anteponen a cualquier paso por defecto de la skill):

${trimmed}`;

  let prompt: string;
  if (built.prompt.endsWith(LOOP_INSTRUCTION)) {
    const base = built.prompt.slice(0, built.prompt.length - LOOP_INSTRUCTION.length);
    prompt = base + block + LOOP_INSTRUCTION;
  } else {
    prompt = built.prompt + block;
  }

  return { ...built, prompt };
}

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
  ${isSpanish ? TTS_JOBS_ES : TTS_JOBS_EN}
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
   - Fase Edición: LUÍS (render vía tools/render_project.py — NUNCA el MCP mcp__premiere-pro__*, es nuevo y sin probar)
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

// ── SARA — Arrancar un vídeo NUEVO desde una idea (columna Ideas) ─────────

export interface IdeaSeed {
  title: string;
  description: string;
  angle?: string | null;
  sourceVideoTitle?: string | null;
  sourceVideoUrl?: string | null;
}

/**
 * Arranca el pipeline completo de un vídeo NUEVO a partir de una idea de la
 * columna "Ideas". La carpeta ya está scaffolded (vacía salvo idea.md). SARA
 * debe ejecutar de punta a punta hasta "listo para subir" SIN publicar.
 *
 * Reusa el cuerpo de buildSaraResume pero con el encuadre "desde cero, tengo
 * una idea" en vez de "retoma lo que haya".
 */
export function buildSaraFromIdea(idea: IdeaSeed, v: VideoContext): BuiltPrompt {
  const isStoic = v.channel === 'moderni-stoici' || v.channel === 'moderno-estoico';
  const base = buildSaraResume(v);
  const seed = `SARA, arranca un vídeo NUEVO desde una IDEA para el canal ${v.channel}.

LA IDEA (semilla del vídeo):
- Título tentativo: ${idea.title}
- Descripción: ${idea.description}
${idea.angle ? `- Ángulo/gancho: ${idea.angle}` : ''}
${idea.sourceVideoTitle ? `- Inspirada en un vídeo propio que funcionó: "${idea.sourceVideoTitle}"${idea.sourceVideoUrl ? ` (${idea.sourceVideoUrl})` : ''}` : ''}

La carpeta del proyecto YA está creada (vacía, recién scaffolded) en:
${v.folderPath}
Dentro tienes \`idea.md\` con esta misma semilla. El título de carpeta es provisional — el packaging final lo decides en Fase 1.

OBJETIVO: llevar este vídeo DE CERO hasta **"listo para subir"** (todas las fases del pipeline + revisiones), pero **NO publicar en YouTube** — eso lo hago yo después manualmente. Párate en cualquier decisión que sea solo mía (elección de título/miniatura, validar un cambio de guion fuerte) y déjala anotada en el brief final.

A partir de aquí sigue tu protocolo estándar de orquestación${isStoic ? ' para canal ESTOICO' : ''}:

`;
  // Sustituimos el encabezado "retoma el pipeline" por el encuadre de idea,
  // conservando todo el cuerpo operativo (pasos 1-7, routing, Luna Media OS).
  const bodyFromStep1 = base.prompt.slice(base.prompt.indexOf('TU TRABAJO (en este orden):'));
  return {
    ...base,
    prompt: seed + bodyFromStep1,
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
- Inglés (Moderni Stoici): ${TTS_JOBS_EN}
- Español (Moderno Estoico): ${TTS_JOBS_ES}
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

// ── NORA + IRIS — Generar concepto visual + ejecutar miniatura vía Algrow MCP ──

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

${isStoic ? '3. **MARCUS HALE** (gate viewer-persona) — review rápido del concepto. Veredicto: "haría clic" / "haría clic con dudas" / "no haría clic" + qué cambiarías. Si destroza el concepto, vuelve a NORA antes de generar.\n\n' : ''}**EJECUCIÓN — Ruta A de IRIS: SIEMPRE vía MCP de Algrow (\`mcp__algrow__generate_thumbnail\`)**:

Política fijada por Pablo el 2026-05-30: TODA miniatura de YouTube se genera con \`mcp__algrow__generate_thumbnail\`, **NUNCA con kie-bridge**. El flujo viejo (kie-bridge + nano-banana-2) devolvió miniaturas CUADRADAS (1:1) aunque se le pasara \`--aspect 16:9\`; \`generate_thumbnail\` fuerza el aspect ratio y elimina ese fallo. NO uses kie-bridge para la miniatura, NO uses el portapapeles, NO menciones Flow.

Por cada una de las **3 variantes** (prompt principal + A + B) que cerró IRIS:

1. Llama a la tool:
   \`\`\`
   mcp__algrow__generate_thumbnail(
     prompt       = "<prompt de IRIS en inglés, CON el texto on-image incluido>",
     aspect_ratio = "16:9",          # SIEMPRE 16:9 para este vídeo long-form (9:16 solo si fuera un Short). NUNCA 1:1.
     resolution   = "2K",
     model        = "gpt-image-2",    # default fiable para texto on-image; sube a seedream-5.0-lite / nano-banana-pro si el realismo CGI no convence
     style_preset = "faceless"        # estatuas CGI / objetos simbólicos (formatos A/C/D/E). Usa "person_focal" solo si hay un rostro humano real protagonista
   )
   \`\`\`
2. La tool devuelve un \`task_id\`. **Estás en una sesión headless (\`claude -p\`) — NO hay widget inline que haga el polling por ti.** Haz polling tú mismo con \`mcp__algrow__check_thumbnail_status(task_id=...)\` cada pocos segundos hasta que el render esté listo y obtengas la URL del resultado.
3. Descarga esa URL al disco con \`Invoke-WebRequest\` (NO con kie-bridge) a su propio archivo en ${miniaturesDir}/, con el patrón \`v<YYYY-MM-DD_HHmmss>-<principal|varA|varB>.jpg\` para no sobrescribir. Ejemplo: \`v2026-05-30_174530-principal.jpg\`.
4. Verifica que el archivo descargado es 16:9 (landscape, ≈1280×720 o equivalente, NUNCA cuadrado). Si por lo que sea saliera cuadrado, NO lo des por bueno: reintenta el mismo prompt o cambia de \`model\`.

Así Pablo puede comparar las 3 variantes en la galería de la app, todas con el aspect ratio correcto garantizado.

Tras cada generación reporta brevemente el archivo creado y el tiempo de Algrow.

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

1. STATE 1 — Captura y validación. Verifica que existen guion (en ${YOUTUBE_OS_ROOT}/youtube/${v.channel}/guiones/<slug>/guion-v2.md o guion.md como fallback), locución (01_BRUTOS/_LOCUCION/ con al menos 3 MP3s), biblioteca de brutos del canal y biblioteca de música.
2. STATE 2 — Si el proyecto está en _PENDIENTE LOCUCION/ y la locución está hecha, muévelo a _EN PRODUCCIÓN/ antes de renderizar.
3. STATE 3 — Lanza el render en background con tools/render_project.py (tu método NORMAL: venv C:\\.venvs\\auto-edit). Monitoriza el log. Tiempo típico 18-25 min para long-form. **NO uses el MCP de Premiere Pro (mcp__premiere-pro__*) — es nuevo, sin probar, y bloquea el render. El render normal NO pasa por Premiere.**
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
El guion actual debería estar en ${YOUTUBE_OS_ROOT}/youtube/${v.channel}/guiones/<slug>/guion-v2.md (o guion.md como fallback). El slug está en el packaging.md del proyecto.

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

// ── MARIO — Estratega YouTube faceless (diagnóstico previo) ─────────────

export function buildMarioStrategy(v: VideoContext): BuiltPrompt {
  return {
    cwd: JARVIS_ROOT,
    timeoutMs: LONG_TIMEOUT_MS,
    model: 'sonnet',
    prompt: `MARIO, hazme un diagnóstico estratégico para el vídeo "${v.title}" del canal ${v.channel}.

Carpeta del proyecto: ${v.folderPath}
Packaging.md (si existe): ${v.folderPath.replace(/\\/g, '/')}/_PACKAGING/packaging.md

Aplica tu metodología completa:

1. **Topic validation** — ¿el topic está saturado en el nicho? Busca con Algrow/vidIQ outliers recientes del nicho del canal (${v.channel}). ¿Hay demanda real o estamos remando contra corriente?

2. **Outliers de referencia** — Identifica 3-5 vídeos outliers (>5x views vs el avg del canal de origen) sobre el mismo topic en los últimos 90 días. Para cada uno: título, canal, views, CTR estimado, qué hizo diferente.

3. **Targets de performance** — Dado el canal ${v.channel} y su histórico (subs, avg views, AVD típico), estima:
   - CTR objetivo (mínimo viable + ideal)
   - AVD% objetivo (mínimo viable + ideal)
   - Browse vs Search vs Suggested split esperado

4. **Risks y wedges** — ¿Qué riesgos veo en este topic concreto en este canal? ¿Hay un wedge (ángulo único defendible) o estamos copiando lo que ya hicieron otros?

5. **Veredicto final** — Una de estas tres opciones:
   - 🟢 GO: el topic merece la producción completa, este es el ángulo concreto.
   - 🟡 PIVOT: la idea base sirve pero hay que cambiar X (ángulo / título / posicionamiento).
   - 🔴 STOP: descártalo, este topic no tiene tracción suficiente, propón estos 2-3 topics alternativos del nicho con outliers recientes.

Devuelve markdown claro con secciones. Si veredicto es STOP, deja los 2-3 topics alternativos en negrita al final.${LOOP_INSTRUCTION}`,
    loop: { successMarker: '<<<DONE>>>', maxRetries: 2 },
  };
}

// ── test-72h — Post-mortem 72h post-publicación ─────────────────────────

export function buildTest72hPostMortem(v: VideoContext, hoursSincePublished?: number): BuiltPrompt {
  return {
    cwd: JARVIS_ROOT,
    timeoutMs: LONG_TIMEOUT_MS,
    model: 'sonnet',
    prompt: `Hazme un post-mortem ventana 72-96h del vídeo "${v.title}" del canal ${v.channel} usando la skill \`test-72h\`.

Carpeta del proyecto: ${v.folderPath}
${hoursSincePublished ? `Tiempo desde publicación: ~${hoursSincePublished}h` : 'Tiempo desde publicación: estimar a partir de YouTube Analytics'}

Aplica tu flujo estándar:

1. **Métricas reales** — Pull de YouTube Analytics (vía OAuth / vidIQ / Algrow): CTR, AVD%, views, retention curve, traffic sources, audience retention.

2. **Comparativa vs target** — Lo que MARIO predijo / lo que se acordó en packaging.md vs lo que ha pasado realmente. ¿Hit, near-miss, miss grande?

3. **Diagnóstico de fallos** — Si está rindiendo por debajo:
   - ¿Es CTR (problema de title/thumb)?
   - ¿Es AVD (problema de hook/structure)?
   - ¿Es traffic source (mal posicionamiento)?
   - ¿Es timing (publicado mal hora/día)?
   - ¿Es audience (no es nuestro viewer-persona)?

4. **Iteraciones propuestas** — Si tiene sentido iterar:
   - **Title v2** — propón 2-3 variantes con argumento (puedes invocar a MARCOS si es necesario).
   - **Thumb v2** — propón concepto visual nuevo (puedes invocar a NORA/IRIS).
   - **End screen / chapters** — ajustes menores que aún tienen impacto.

5. **Veredicto final**:
   - ✅ HIT: dejarlo. Documenta qué funcionó.
   - 🔄 ITERATE: cambia título/thumb (puedo aplicarlo desde la app después).
   - ☠️ KILL: no merece más iteración, archivar y aprender.

Formato: markdown estructurado por secciones. Si hay variantes propuestas para A/B, listarlas claras al final.${LOOP_INSTRUCTION}`,
    loop: { successMarker: '<<<DONE>>>', maxRetries: 2 },
  };
}
