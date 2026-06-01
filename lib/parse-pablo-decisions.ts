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
  /** Si la sección remite a un fichero externo con las opciones (ej.
   *  "7 opciones en `marcos-titulos.md`"), su nombre. El server (lib/approvals)
   *  lo resuelve leyendo `_PACKAGING/<optionsFile>` con extractTitleOptions(). */
  optionsFile?: string;
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
    .replace(/\\\|/g, '|') // pipes escapados dentro de celdas de tabla
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`/g, '')
    // corta sufijos tipo "← RECOMENDACIÓN ..." o "(42 chars)"
    .replace(/\s*[←⟵]\s.*$/u, '')
    .replace(/\s*\(\d+\s*chars?\)\s*$/i, '')
    .replace(/^["“«]|["”»]$/g, '')
    .trim();
}

// ── Tablas markdown ──────────────────────────────────────────────────────────
// MARCOS escribe los títulos en tablas (| Ruta | Título | Chars | Score |) y los
// pipes internos del propio título van escapados (\|). Hay que partir SOLO por
// pipes no escapados.

function isTableRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line);
}

function splitTableRow(line: string): string[] {
  const cells = line
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());
  if (cells.length && cells[0] === '') cells.shift();
  if (cells.length && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

function isSeparatorCells(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '');
}

/** Extrae títulos de la primera tabla que aparezca en `lines`. Detecta la columna
 *  "Título" por cabecera; la fila recomendada es la que menciona RECOMENDAD* o va
 *  en negrita. Devuelve opciones limpias + el recomendado (si lo marca). */
function extractTitlesFromTable(lines: string[]): { options: string[]; recommended?: string } {
  const rows = lines.filter(isTableRow);
  if (rows.length < 2) return { options: [] };
  const header = splitTableRow(rows[0]).map((h) => h.replace(/[*_`]/g, '').toLowerCase());
  let titleIdx = header.findIndex((h) => /t[íi]tulo|title/.test(h));

  const options: string[] = [];
  let recommended: string | undefined;
  for (const row of rows.slice(1)) {
    const cells = splitTableRow(row);
    if (!cells.length || isSeparatorCells(cells)) continue;
    // Sin cabecera reconocible: coge la celda más larga que no sea numérica.
    const idx =
      titleIdx >= 0 && titleIdx < cells.length
        ? titleIdx
        : cells.reduce((best, c, i) => (!/^[\d.,/\s]+$/.test(c) && c.length > (cells[best]?.length ?? 0) ? i : best), 0);
    const title = cleanOption(cells[idx] ?? '');
    if (!title || /^t[íi]tulo$|^title$/i.test(title)) continue;
    const rowIsRec = cells.some((c) => /recomendad|recomendaci[oó]n/i.test(c)) || /^\s*\*\*/.test(cells[idx] ?? '');
    if (rowIsRec && !recommended) recommended = title;
    options.push(title);
  }
  return { options: Array.from(new Set(options)), recommended };
}

/** Líneas de blockquote (`> ...`) como candidatos de título. */
function extractBlockquoteTitles(lines: string[]): string[] {
  return lines
    .filter((l) => /^\s*>\s+\S/.test(l))
    .map((l) => cleanOption(l.replace(/^\s*>\s+/, '')))
    .filter((t) => t.length >= 5 && !/^(pendiente|razones?|evitar|nota)\b/i.test(t));
}

/**
 * Extrae opciones de título de un markdown arbitrario (p.ej. el fichero externo
 * `marcos-titulos.md`, que NO tiene ancla PENDIENTE y por tanto parsePabloDecisions
 * ignora). Combina tabla + "RECOMENDACIÓN MARCOS: #N" + título en negrita suelto.
 */
export function extractTitleOptions(markdown: string | null | undefined): {
  options: string[];
  recommended?: string;
} {
  if (!markdown) return { options: [] };
  const lines = markdown.split(/\r?\n/);
  const t = extractTitlesFromTable(lines);
  let options = t.options;
  let recommended = t.recommended;
  if (options.length < 2) {
    const bq = extractBlockquoteTitles(lines);
    options = Array.from(new Set([...options, ...bq]));
    if (!recommended && bq.length) recommended = bq[0];
  }
  // "RECOMENDACIÓN MARCOS: #6" → la opción nº 6.
  const recNum = markdown.match(/recomendaci[oó]n[^#\n]*#\s*(\d+)/i);
  if (recNum) {
    const n = parseInt(recNum[1], 10);
    if (n >= 1 && n <= options.length) recommended = options[n - 1];
  }
  return { options: options.slice(0, 12), recommended };
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

    // Candidatos, por prioridad: lista numerada → tabla markdown → blockquote →
    // entrecomillados. (MARCOS usa tablas en estoicos y blockquote en sleep.)
    const numbered = sec.body
      .map((l) => l.match(/^\s*\d+[.)]\s+(.+)$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => cleanOption(m[1]))
      .filter(Boolean);

    let options = numbered;
    let recommendation: string | undefined;

    if (options.length < 2) {
      const fromTable = extractTitlesFromTable(sec.body);
      if (fromTable.options.length) {
        options = Array.from(new Set([...options, ...fromTable.options]));
        recommendation = fromTable.recommended;
      }
    }
    if (options.length < 1) {
      const bq = extractBlockquoteTitles(sec.body);
      if (bq.length) {
        options = bq;
        if (!recommendation) recommendation = bq[0];
      }
    }
    if (options.length < 2) {
      const quoted = Array.from(sec.body.join('\n').matchAll(/["“«]([^"”»\n]{3,90})["”»]/g))
        .map((m) => m[1].trim());
      options = Array.from(new Set([...options, ...quoted]));
    }
    options = Array.from(new Set(options)).slice(0, 12);

    // Recomendación EXPLÍCITA (línea "Recomendación:" / "MARCOS recomienda:"),
    // EXCLUYENDO la propia ancla de Estado — antes caía en "(recomendación MARCOS)"
    // de la línea PENDIENTE y mostraba el churro como título.
    if (!recommendation) {
      const recLine =
        sec.body.find((l) => l !== anchorLine && /^\s*[*_>\s]*recomendaci[oó]n/i.test(l)) ??
        sec.body.find((l) => l !== anchorLine && /recomiend|recomendaci[oó]n/i.test(l));
      if (recLine) {
        const cleaned = recLine
          .replace(/^\s*[*_>\s]*recomendaci[oó]n[^:]*:\s*/i, '')
          .replace(/^\s*[*_>\s]*[a-záéíóú]+\s+recomienda:?\s*/i, '')
          .replace(/[*_`]/g, '')
          .trim();
        // Si solo apunta a un número ("#6") no sirve como título mostrable.
        if (cleaned && !/^#?\d+$/.test(cleaned)) recommendation = cleaned;
      }
    }

    // ¿Las opciones viven en un fichero externo? (ej. "7 opciones en `marcos-titulos.md`").
    // EXIGIMOS una pista (opciones/títulos/options) justo antes del fichero y EXCLUIMOS
    // ficheros que NO son listas de opciones (packaging/seo/guion). Antes casaba
    // CUALQUIER `*.md` del cuerpo (p.ej. una nota "ver `packaging.md`") → el server
    // leía el documento equivocado y mostraba opciones basura.
    const cued = sec.body
      .join('\n')
      .match(/(?:opci[oó]n(?:es)?|t[íi]tulos?|options?)[^`\n]*`([\w.\-]+\.md)`/i);
    const rawFile = cued?.[1];
    const optionsFile =
      rawFile && !/^(?:packaging|seo|seo-package|descripci[oó]n-seo|guion)/i.test(rawFile)
        ? rawFile
        : undefined;

    const { kind, label } = inferKindAndLabel(sec.title, options.length);

    out.push({
      section: sec.title,
      label,
      anchor: anchorLine.trim(),
      options,
      recommendation,
      kind,
      optionsFile,
    });
  }

  return out;
}
