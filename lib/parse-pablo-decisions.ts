// Browser-safe. Detecta decisiones pendientes de Pablo escritas como texto libre
// en packaging.md (no como checkboxes markdown). Patrón típico de los packagings
// de Uncharted History / sleep-stories:
//
//   ## Títulos (MARCOS)
//   1. ...
//   2. **The Shipwreck That Created Stoicism** ← RECOMENDACIÓN MARCOS
//   **Recomendación MARCOS:** A2 — "..."
//   **Estado:** ⏳ PENDIENTE ELECCIÓN DE PABLO
//
// Cuando Pablo resuelve la decisión, /api/decisions sustituye la línea `anchor`
// por "**Estado:** ✅ ELEGIDO: <decisión>", así deja de aparecer como pendiente.

import type { DecisionKind } from './decision-types';

export interface PabloDecision {
  /** Heading de la sección, ej "Títulos (MARCOS)". */
  section: string;
  /** Etiqueta corta para la UI, ej "Elegir título". */
  label: string;
  /** Línea EXACTA del packaging.md a sustituir al resolver. */
  anchor: string;
  /** Candidatos detectados en la sección (números de lista o entrecomillados). */
  options: string[];
  /** Recomendación del equipo, si la detectamos. */
  recommendation?: string;
  /** Tipo sugerido para el formulario de decisión. */
  kind: DecisionKind;
}

// Cubre los formatos reales que escribe SARA, no solo el ancla canónica:
//  - "**Estado:** ⏳ PENDIENTE ELECCIÓN DE PABLO"
//  - "Pendiente validación visual de Pablo" (miniatura)
//  - "pendiente de aprobación/revisión de Pablo"
const PENDING_RE = /pendiente\s+(?:de\s+)?(?:elecci[oó]n|decisi[oó]n|selecci[oó]n|validaci[oó]n|aprobaci[oó]n|revisi[oó]n)\s+(?:visual\s+)?(?:de\s+)?pablo/i;
// Checkbox SIN marcar atribuido a Pablo y pendiente, en cualquier orden:
//  "- [ ] Título elegido (Pablo) — ⏳ PENDIENTE"
const PENDING_CHECKBOX_RE = /^\s*-\s*\[\s*\]\s+(?=.*\(\s*pablo\s*\))(?=.*pendiente)/i;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

function cleanOption(raw: string): string {
  return raw
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`/g, '')
    // corta sufijos tipo "← RECOMENDACIÓN ..." o "(42 chars)"
    .replace(/\s*[←⟵]\s.*$/u, '')
    .replace(/\s*\(\d+\s*chars?\)\s*$/i, '')
    .replace(/^["“«]|["”»]$/g, '')
    .trim();
}

function inferKindAndLabel(section: string, optionsCount: number): { kind: DecisionKind; label: string } {
  const lower = section.toLowerCase();
  if (/miniatura|thumbnail|portada/.test(lower)) {
    return { kind: 'thumbnail_pick', label: 'Elegir miniatura' };
  }
  if (/t[íi]tulo/.test(lower)) {
    return { kind: optionsCount >= 2 ? 'choice' : 'free_text', label: 'Elegir título' };
  }
  if (/descripci[oó]n|seo/.test(lower)) {
    return { kind: optionsCount >= 2 ? 'choice' : 'free_text', label: 'Elegir descripción' };
  }
  const short = section.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return { kind: optionsCount >= 2 ? 'choice' : 'free_text', label: `Decidir: ${short}` };
}

/** Agrupa el markdown en secciones de nivel `##` con sus líneas. */
function splitSections(md: string) {
  const lines = md.split(/\r?\n/);
  const sections: Array<{ title: string; body: string[] }> = [];
  let current: { title: string; body: string[] } | null = null;
  for (const ln of lines) {
    const h = HEADING_RE.exec(ln);
    if (h && h[1].length <= 2) {
      current = { title: h[2].replace(/[*_`]/g, '').trim(), body: [] };
      sections.push(current);
      continue;
    }
    if (current) current.body.push(ln);
    // líneas antes del primer heading se ignoran
  }
  return sections;
}

export function parsePabloDecisions(markdown: string | null | undefined): PabloDecision[] {
  if (!markdown) return [];
  const out: PabloDecision[] = [];

  for (const sec of splitSections(markdown)) {
    const anchorLine = sec.body.find((l) => PENDING_RE.test(l) || PENDING_CHECKBOX_RE.test(l));
    if (!anchorLine) continue;

    // Candidatos: items de lista numerada primero, si no, entrecomillados.
    const numbered = sec.body
      .map((l) => l.match(/^\s*\d+[.)]\s+(.+)$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => cleanOption(m[1]))
      .filter(Boolean);

    let options = numbered;
    if (options.length < 2) {
      const quoted = Array.from(sec.body.join('\n').matchAll(/["“«]([^"”»\n]{3,90})["”»]/g))
        .map((m) => m[1].trim());
      options = Array.from(new Set([...options, ...quoted]));
    }
    options = Array.from(new Set(options)).slice(0, 12);

    // Preferimos una línea que EMPIECE por "Recomendación:" (la explícita del
    // equipo) antes que un item de lista que solo mencione la palabra.
    const recLine =
      sec.body.find((l) => /^\s*\*?\*?recomendaci[oó]n/i.test(l)) ??
      sec.body.find((l) => /recomendaci[oó]n/i.test(l));
    const recommendation = recLine
      ? recLine.replace(/^\s*\*?\*?recomendaci[oó]n[^:]*:\*?\*?\s*/i, '').replace(/[*_`]/g, '').trim()
      : undefined;

    const { kind, label } = inferKindAndLabel(sec.title, options.length);

    out.push({
      section: sec.title,
      label,
      anchor: anchorLine.trim(),
      options,
      recommendation,
      kind,
    });
  }

  return out;
}
