// Browser-safe. Mapa skill → "voz" (emoji + nombre) para prefijar los mensajes
// de aprobación en Telegram. Decisión cerrada: UN solo bot (J.A.R.V.I.S.), varias
// voces — el prefijo identifica qué miembro del equipo pide la decisión.
// La voz sale de job.skill; si no se reconoce, se deriva de job.label.

export interface AgentVoice {
  emoji: string;
  name: string;
}

// Claves en minúsculas. Se incluyen alias por el slug de skill y por el nombre
// "operativo" con que se spawnan los jobs (lib/prompts.ts / botones de la UI).
const VOICES: Record<string, AgentVoice> = {
  sara: { emoji: '🎬', name: 'SARA' },
  marcos: { emoji: '✍️', name: 'MARCOS' },
  'youtube-titles': { emoji: '✍️', name: 'MARCOS' },
  nora: { emoji: '🎨', name: 'NORA' },
  'agente-miniaturas': { emoji: '🎨', name: 'NORA' },
  iris: { emoji: '🖼️', name: 'IRIS' },
  'nano-banana-iris': { emoji: '🖼️', name: 'IRIS' },
  elena: { emoji: '🔍', name: 'ELENA' },
  'script-auditor': { emoji: '🔍', name: 'ELENA' },
  amelia: { emoji: '✅', name: 'AMELIA' },
  luis: { emoji: '🎞️', name: 'LUÍS' },
  'marcus-hale': { emoji: '👤', name: 'MARCUS' },
  marcus: { emoji: '👤', name: 'MARCUS' },
  'marco-aurelio': { emoji: '🏛️', name: 'MARCO AURELIO' },
  mario: { emoji: '📈', name: 'MARIO' },
  ceo: { emoji: '🧭', name: 'CEO' },
  caliope: { emoji: '🎙️', name: 'CALÍOPE' },
  ciceron: { emoji: '🎚️', name: 'CICERÓN' },
};

/** Devuelve la voz para una skill, con fallback derivado del label. */
export function voiceFor(skill?: string | null, fallbackLabel?: string): AgentVoice {
  const key = (skill ?? '').toLowerCase().trim();
  if (VOICES[key]) return VOICES[key];
  // Fallback: primer token del label (p.ej. "SARA trabajando" → "SARA").
  const raw = (fallbackLabel ?? skill ?? '').trim();
  const first = raw.split(/\s+/)[0] || 'EQUIPO';
  return { emoji: '🤖', name: first.toUpperCase() };
}

/** Prefijo listo para el mensaje, p.ej. "🎬 SARA". */
export function voicePrefix(skill?: string | null, fallbackLabel?: string): string {
  const v = voiceFor(skill, fallbackLabel);
  return `${v.emoji} ${v.name}`;
}
