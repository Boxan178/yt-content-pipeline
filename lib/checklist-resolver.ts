// Lógica de inferencia para resolver ítems del checklist del packaging.md.
// Cada item se analiza por keywords y se mapea a una skill + prompt específico.
// Browser-safe: no usa node:fs.

import type { ChecklistItem } from './parse-checkboxes';
import type { VideoContext } from './prompts';

export type ResolverPlan =
  | {
      kind: 'auto';
      skill: string;
      label: string;
      hint: string;
      prompt: string;
      cwd: string;
      timeoutMs: number;
    }
  | {
      kind: 'manual';
      reason: string;
    };

const JARVIS_ROOT = 'Y:/04_DEV/J.A.R.V.I.S';
const TIMEOUT_SHORT = 5 * 60 * 1000;
const TIMEOUT_MED = 10 * 60 * 1000;
const TIMEOUT_LONG = 30 * 60 * 1000;

function isStoic(channel: string): boolean {
  return channel === 'moderni-stoici' || channel === 'moderno-estoico';
}

/**
 * Instrucción común que añadimos al final de cada prompt para que el agente
 * marque el item como completado en el packaging.md después de hacer su trabajo.
 */
function checkboxClosure(itemText: string, packagingPath: string): string {
  const safe = itemText.replace(/`/g, '\\`');
  return `\n\nIMPORTANTE — al terminar, EDITA el archivo ${packagingPath} y marca este ítem como completado: cambia la línea que dice exactamente:
- [ ] ${safe}

por:
- [x] ${safe}

Si la línea original tiene una versión ligeramente distinta del texto (espacios, mayúsculas), localízala por la coincidencia más cercana. NO crees una nueva línea — sustituye la existente.`;
}

export function inferResolver(item: ChecklistItem, ctx: VideoContext): ResolverPlan {
  const text = item.text;
  const lower = text.toLowerCase();
  const packagingPath = `${ctx.folderPath.replace(/\\/g, '/')}/_PACKAGING/packaging.md`;
  const stoic = isStoic(ctx.channel);

  // Decisión humana — no autoresolvable
  if (/decisi[oó]n\s+pablo/i.test(text) || /^pablo decide/i.test(text)) {
    return {
      kind: 'manual',
      reason: 'Decisión humana — solo tú puedes resolverla.',
    };
  }

  // chapters / timestamps
  if (/\/chapters?\b/.test(lower) || /timestamps?\s+reales?/.test(lower) || /capítulos?\s+verificados?/.test(lower)) {
    return {
      kind: 'auto',
      skill: 'chapters',
      label: 'chapters',
      hint: 'Lanza skill chapters para verificar timestamps con Whisper sobre el MP4 final.',
      cwd: JARVIS_ROOT,
      timeoutMs: TIMEOUT_MED,
      prompt: `Lanza la skill \`chapters\` sobre el vídeo "${ctx.title}" del canal ${ctx.channel}.

Carpeta del proyecto: ${ctx.folderPath}
El MP4 final está en la subcarpeta RENDER/. Verifica los timestamps con Whisper sobre el audio real y reescribe la sección CHAPTERS del archivo de descripción SEO con los timestamps correctos.

Reporta al final qué capítulos verificó, cuántos cambió, y la sección CHAPTERS final.${checkboxClosure(text, packagingPath)}`,
    };
  }

  // ELENA-VERIFY o verificación factual / citas
  if (/\[elena-?verify\]/i.test(text) || /verificar\s+(cita|fact)/i.test(lower) || /meditations?\s+\d/i.test(lower) || /enchiridion|epicteto|s[eé]neca/.test(lower) && /verific/.test(lower)) {
    return {
      kind: 'auto',
      skill: 'elena',
      label: 'ELENA verifica',
      hint: 'ELENA verifica la cita o el dato factual marcado y actualiza el guion / packaging según corresponda.',
      cwd: JARVIS_ROOT,
      timeoutMs: TIMEOUT_MED,
      prompt: `ELENA, resuelve este ítem pendiente del vídeo "${ctx.title}" del canal ${ctx.channel}:

PENDIENTE: ${text}

Carpeta del proyecto: ${ctx.folderPath}
Packaging completo en: ${packagingPath}
${stoic ? 'Canal estoico — activa Capa 6 (Verificación Factual Estoica).' : ''}

Tu tarea:
1. Localizar el pasaje exacto en el guion o packaging que requiere verificación
2. Verificar la cita o el dato contra fuentes canónicas
3. Si la cita es correcta: confirmar y eliminar el marcador [ELENA-VERIFY]
4. Si es incorrecta: proponer la cita verificada con referencia correcta y aplicar la corrección en el guion (o devolverla como cambio sugerido si requiere mi visto bueno)
5. Reportar qué encontraste, qué cambiaste y dónde${checkboxClosure(text, packagingPath)}`,
    };
  }

  // Editar / reescribir CTA, outro, fragmento del guion
  if (/\b(cta|outro|intro|hook)\b/i.test(lower) && /\b(edit|reescrib|sac|quit|cambi)/i.test(lower)) {
    const author = stoic ? 'MARCO AURELIO' : 'VÍCTOR';
    return {
      kind: 'auto',
      skill: stoic ? 'marco-aurelio' : 'youtube-copywriter',
      label: `${author} ajusta`,
      hint: `${author} edita el fragmento del guion según lo descrito en el ítem.`,
      cwd: JARVIS_ROOT,
      timeoutMs: TIMEOUT_LONG,
      prompt: `${author}, resuelve este ítem pendiente del vídeo "${ctx.title}" del canal ${ctx.channel}:

PENDIENTE: ${text}

Carpeta del proyecto: ${ctx.folderPath}
Packaging completo en: ${packagingPath}

Localiza el fragmento del guion que toca este pendiente (CTA / outro / hook / etc.) y aplica el cambio descrito. Si el cambio requiere reescritura larga, genera el fragmento nuevo y muéstramelo. Si es una edición puntual, aplícala directamente al guion correspondiente.

Tras hacer el cambio, deja un changelog breve (qué tocaste y por qué).${checkboxClosure(text, packagingPath)}`,
    };
  }

  // Regenerar miniatura (NORA + IRIS)
  if (/\bminiatura\b|\bthumbnail\b/i.test(lower) && /(regener|nuev|cambi|coher|alinear)/i.test(lower)) {
    return {
      kind: 'auto',
      skill: 'nora+iris',
      label: 'NORA + IRIS',
      hint: 'NORA define concepto visual nuevo + IRIS construye el prompt para Nano Banana Pro.',
      cwd: JARVIS_ROOT,
      timeoutMs: TIMEOUT_MED,
      prompt: `NORA, hay que regenerar el concepto de miniatura del vídeo "${ctx.title}" del canal ${ctx.channel}.

Contexto del cambio (pendiente que lo origina): ${text}

Carpeta del proyecto: ${ctx.folderPath}
Packaging actual en: ${packagingPath}

Tu tarea:
1. Lee el packaging.md para entender el contexto actual (título actual, concepto previo si lo hay)
2. Genera un nuevo concepto visual coherente con la situación descrita en el pendiente
3. Pasa el brief a IRIS para que construya el prompt final de Nano Banana Pro
4. Actualiza la sección de miniatura del packaging.md con la nueva dirección + prompt

Devuelve: NORA_SCORE, NORA_VEREDICTO, brief para IRIS, IRIS_SCORE, IRIS_VEREDICTO, prompt final listo para pegar.${checkboxClosure(text, packagingPath)}`,
    };
  }

  // Generar / cambiar título (MARCOS)
  if (/\bt[ií]tulo\b/i.test(lower) && /(generar|nuev|cambi|opcion|propon)/i.test(lower) && !/decisi/i.test(lower)) {
    return {
      kind: 'auto',
      skill: 'marcos',
      label: 'MARCOS',
      hint: 'MARCOS genera rutas de título según la metodología.',
      cwd: JARVIS_ROOT,
      timeoutMs: TIMEOUT_MED,
      prompt: `MARCOS, hay un pendiente sobre el título del vídeo "${ctx.title}" del canal ${ctx.channel}:

PENDIENTE: ${text}

Carpeta del proyecto: ${ctx.folderPath}
Packaging en: ${packagingPath}

Genera 4 rutas de título (curiosidad / search / tensión / híbrido) coherentes con el contenido del vídeo y el pendiente descrito. Cada una con su lógica. Recomienda una y explica por qué.${checkboxClosure(text, packagingPath)}`,
    };
  }

  // Fallback: SARA decide qué hacer con este pendiente
  return {
    kind: 'auto',
    skill: 'sara',
    label: 'SARA decide',
    hint: 'No identifiqué una skill específica. SARA evalúa el pendiente y delega a quien corresponda.',
    cwd: JARVIS_ROOT,
    timeoutMs: TIMEOUT_LONG,
    prompt: `SARA, resuelve este ítem pendiente del vídeo "${ctx.title}" del canal ${ctx.channel}:

PENDIENTE: ${text}

Carpeta del proyecto: ${ctx.folderPath}
Packaging completo en: ${packagingPath}

Decide qué skill del equipo aplica (MARIO / MARCOS / NORA / IRIS / CIRO / MARCO AURELIO / VÍCTOR / ELENA / MARCUS HALE / CERVANTES / ORWELL / CICERÓN / CALIOPE / LUÍS / chapters / SEO) y delégalo. Si requiere decisión humana, devuelve un brief claro de qué decisión necesito tomar y con qué opciones.${checkboxClosure(text, packagingPath)}`,
  };
}
