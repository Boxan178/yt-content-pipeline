// Heurísticas para clasificar items de checklist tipo "DECISIÓN PABLO".
// Browser-safe.

export type DecisionKind = 'choice' | 'yes_no' | 'date' | 'thumbnail_pick' | 'free_text';

export interface DecisionPlan {
  kind: DecisionKind;
  /** Pregunta corta a mostrar arriba del formulario. */
  question: string;
  /** Si choice: opciones extraídas del texto. */
  options?: string[];
  /** Si free_text: preguntas guía. */
  guide?: string[];
  /** Hint adicional para Pablo. */
  hint?: string;
}

/**
 * Analiza el texto del item de checklist y devuelve un plan de decisión.
 * Estrategia: keywords + extracción de patrones tipo `"A" o "B"`.
 */
export function planForDecision(itemText: string): DecisionPlan {
  const text = itemText;
  const lower = text.toLowerCase();

  // 1) Patrón "X" o "Y" — radio buttons
  const quoted = Array.from(text.matchAll(/[""«]([^""»]{2,80})[""»]/g)).map((m) => m[1]);
  if (quoted.length >= 2 && /\bo\b|\b\/|vs\b/i.test(text)) {
    return {
      kind: 'choice',
      question: extractQuestion(text) ?? 'Elige una opción',
      options: quoted,
    };
  }

  // 2) Miniatura
  if (/\bminiatura\b|\bthumbnail\b/i.test(lower) && /(elegir|elige|cuál|cu[áa]l|pick)/i.test(lower)) {
    return {
      kind: 'thumbnail_pick',
      question: 'Elige la miniatura',
      hint: 'Las miniaturas vienen de _PACKAGING/MINIATURAS/. La elegida se marca con .selected-thumb.',
    };
  }

  // 3) Fecha / cuándo
  if (/\b(fecha|cu[áa]ndo|programar|publicar el|hora|horario)\b/i.test(lower)) {
    return {
      kind: 'date',
      question: 'Cuándo',
      hint: 'Selecciona fecha y hora.',
    };
  }

  // 4) Sí/no — incluir, quitar, mantener, dejar
  if (/\?\s*$/.test(text) && /\b(incluir|quitar|dejar|mantener|a[ñn]adir|borrar|cortar)\b/i.test(lower)) {
    return {
      kind: 'yes_no',
      question: text.replace(/[*_]/g, '').trim(),
    };
  }

  // 5) Detección genérica de "¿…?" termina en interrogación
  if (text.includes('?') || text.includes('¿')) {
    return {
      kind: 'free_text',
      question: text.replace(/[*_]/g, '').trim(),
      guide: [
        '¿Qué opción tiene sentido aquí?',
        '¿Hay alguna razón específica detrás de la decisión?',
      ],
    };
  }

  // Fallback: free text
  return {
    kind: 'free_text',
    question: text,
    guide: [
      'Describe brevemente cuál es tu decisión.',
      'Si necesitas explicarte, añade el porqué.',
    ],
  };
}

function extractQuestion(text: string): string | null {
  // Si hay "¿...?" o "X o Y?", extrae la pregunta
  const q = text.match(/[¿?]\s*([^?¿]{5,160})\??/);
  if (q && q[1]) return q[1].trim().replace(/[*_]/g, '');
  return null;
}
