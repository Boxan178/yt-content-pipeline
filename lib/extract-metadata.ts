// Extracción de metadata YouTube (título, descripción, tags) desde un
// packaging.md de la convención Moderni Stoici / Moderno Estoico.
//
// Lógica pura de strings — browser-safe y server-safe. La usan tanto la página
// de subida manual (app/upload/page.tsx) como el detector de auto-subida
// (lib/auto-publish.ts) para que haya UNA sola fuente de verdad del parseo.

export interface ExtractedMetadata {
  title: string;
  description: string;
  tags: string[];
}

/** Limpia un valor: quita backticks, comillas externas, ** bold markers y espacios. */
export function cleanValue(s: string): string {
  return s
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .replace(/^["“”'']|["“”'']$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrae metadata YouTube de un packaging.md. Heurísticas en orden de prioridad. */
export function extractMetadata(md: string): ExtractedMetadata {
  // Normalizar CRLF→LF: los .md en H:/ (Windows) usan \r\n y los regex de abajo
  // asumen \n (sobre todo el code-block ```\n...```). Sin esto, la descripción se
  // quedaba con las ``` incrustadas y los tags del code-block no se extraían.
  md = md.replace(/\r\n?/g, '\n');
  // ── TÍTULO ─────────────────────────────────────────────────────────
  // Orden:
  //  1. "🏆 ELEGIDO: <título>" (formato MARCOS, el más fiable cuando existe)
  //  2. "**Título FINAL v5**" o variaciones (línea sola con el título destacado)
  //  3. "**Título YouTube:** X" o "Título:" en su propia línea
  //  4. Backtick block: `Marcus Aurelius Was Unreachable Before Dawn — Here's Why`
  //  5. Fallback: primer # H1 que NO sea "Packaging — ..."
  let title = '';
  const titleStrategies: Array<() => string | null> = [
    () => {
      // "✅/🏆 ELEGIDO: [<ruta>:] <título> _(fecha)_ [VidIQ score…]"
      // MARCOS marca la elegida con ✅ o 🏆; a veces antepone el código de ruta
      // ("3-C:", "1-A:", "Plan C:", "Tentativo…:") y añade fecha italic al final.
      // El bug era exigir 🏆 — packaging reales usan ✅ → título vacío → no subía.
      const m = md.match(/ELEGIDO\s*[:：]\s*([^\n]+)/i);
      if (!m) return null;
      const t = m[1]
        .replace(/\s+VidIQ\s+score.*$/i, '')
        .replace(/\s*_\([^)]*\)_\s*$/, '')
        .replace(/\s*\(\d{1,2}\/\d{1,2}\/\d{2,4}[^)]*\)\s*$/, '')
        // BUG-A defensa: quita la coletilla "— aprobado por Pablo vía Telegram"
        // que ficheros antiguos ya tienen escrita dentro del ELEGIDO.
        .replace(/\s*[—–\-]\s*aprobado\s+por\s+Pablo.*$/i, '')
        .replace(/^\s*(?:\d+-[A-Za-z]|[A-Za-z]-\d+|Plan\s+[A-Za-z]|Tentativo[^:：]*)\s*[:：]\s*/i, '');
      const c = cleanValue(t);
      // "Aprobado" suelto NO es un título (gate aprobado sin selección concreta).
      if (/^aprobado$/i.test(c.trim())) return null;
      return c.length > 1 ? c : null;
    },
    () => {
      // Línea de tabla "🏆 Marcus Aurelius ..." (MARCOS pone trofeo a la elegida)
      const m = md.match(/^\|\s*🏆\s*([^|]+?)\s*\|/m);
      const c = m ? cleanValue(m[1]) : null;
      // Mismo piso de longitud que la estrategia #1: una celda casi vacía no es título.
      return c && c.length > 1 ? c : null;
    },
    () => {
      const m = md.match(/\*\*T[ií]tulo\s+(?:FINAL|YouTube|ELEGIDO|v\d+)[^*:\n]*\*\*\s*[:：]\s*([^\n]+)/i);
      return m ? cleanValue(m[1]) : null;
    },
    () => {
      const m = md.match(/^T[ií]tulo\s*[:：]\s*([^\n]+)/im);
      return m ? cleanValue(m[1]) : null;
    },
    () => {
      // Primer # H1 que no contenga la palabra "Packaging" (esa es prosa interna)
      const lines = md.split(/\r?\n/);
      for (const line of lines) {
        const m = line.match(/^#\s+(.+)$/);
        if (m && !/^packaging\b/i.test(m[1])) return cleanValue(m[1]);
      }
      return null;
    },
  ];
  for (const fn of titleStrategies) {
    const t = fn();
    if (t && t.length > 0) { title = t; break; }
  }

  // ── DESCRIPCIÓN ────────────────────────────────────────────────────
  // Buscamos sección "## Descripción [YouTube]" tolerando emoji + prefijos.
  // Dentro, si hay code block ```...```, preferimos su contenido (suele ser la
  // descripción "lista para pegar" en YouTube Studio).
  let description = '';
  // Nota: el final de sección es "siguiente ## " (flag m) o FIN DE CADENA. En JS
  // `\Z` NO es un anchor (matchea la letra Z literal), así que con la descripción
  // como última sección el match fallaba y devolvía '' → vídeo subido sin
  // descripción. Usamos `(?![\s\S])` (no hay más caracteres = fin de cadena).
  const descSection =
    md.match(/^##\s+[^\n]*?Descripci[oó]n[^\n]*\n+([\s\S]+?)(?=^##\s|(?![\s\S]))/im) ??
    md.match(/^##\s+[^\n]*?Description[^\n]*\n+([\s\S]+?)(?=^##\s|(?![\s\S]))/im);
  if (descSection) {
    const body = descSection[1].trim();
    // Si hay code block, coger SOLO eso
    const code = body.match(/```(?:[\w-]+)?\n([\s\S]+?)```/);
    if (code) {
      description = code[1].trim();
    } else {
      // Quitar HTML comments y bloquecitos `>` (notas)
      description = body
        .replace(/<!--[\s\S]*?-->/g, '')
        .trim();
    }
  }
  // Hashtags (#X) — sección "## Hashtags" del seo-package. YouTube los muestra
  // encima del título; por convención van al final de la descripción.
  if (description) {
    const hashSec = md.match(/^##\s+Hashtags\b[^\n]*\n+(?:```[\w-]*\n?)?([^\n`]+)/im);
    if (hashSec) {
      const hs = (hashSec[1].match(/#[A-Za-z][\w]+/g) ?? []).join(' ');
      if (hs && !description.includes(hs)) description = `${description}\n\n${hs}`;
    }
  }

  // ── TAGS ───────────────────────────────────────────────────────────
  const tags = new Set<string>();
  // 1) Línea "Tags: ..." (con o sin ** alrededor de "Tags")
  const tagsLine = md.match(/^\*{0,2}Tags\*{0,2}\s*[:：]\s*([^\n]+)/im);
  if (tagsLine) {
    tagsLine[1]
      .split(/[,;]/)
      .map((t) => cleanValue(t).replace(/^#/, ''))
      .filter((t) => t && t.length > 1 && t.length < 50)
      .forEach((t) => tags.add(t));
  }
  // 1.5) Sección "## Tags" + bloque de código coma-separado (formato seo-package.md
  //      de youtube-seo-optimizer). packaging.md no lleva tags; el seo-package sí.
  if (tags.size === 0) {
    const sec = md.match(/^##\s+Tags\b[^\n]*\n+```[\w-]*\n?([\s\S]+?)```/im);
    if (sec) {
      sec[1]
        .split(/[,\n;]/)
        .map((t) => cleanValue(t).replace(/^#/, ''))
        .filter((t) => t && t.length > 1 && t.length < 50)
        .forEach((t) => tags.add(t));
    }
  }
  // 2) "Hashtags pinned: #foo #bar" — añadir al final del set (preserva orden)
  const hashtagsLine = md.match(/^\*{0,2}Hashtags(?:\s+pinned)?\*{0,2}\s*[:：]\s*([^\n]+)/im);
  if (hashtagsLine) {
    const matches = hashtagsLine[1].match(/#[A-Za-z][\w]{1,40}/g) ?? [];
    matches.forEach((h) => tags.add(h.slice(1)));
  }
  // 3) Como ÚLTIMO recurso, hashtags sueltos en la descripción (solo si empiezan
  //    por letra para evitar códigos hex tipo #1a1a1a). Limitado a 10.
  if (tags.size < 5 && description) {
    const looseHashes = description.match(/#[A-Za-z][\w]{1,40}/g) ?? [];
    looseHashes.slice(0, 10).forEach((h) => tags.add(h.slice(1)));
  }

  return { title, description, tags: Array.from(tags) };
}

/**
 * Extrae la descripción de YouTube lista-para-pegar (prosa + chapters) y los tags
 * de un `descripcion-seo.md` / `seo-package.md`. A diferencia de packaging.md,
 * este fichero SÍ tiene la descripción real. Soporta los dos formatos que conviven:
 *   A) "## Descripción" con los chapters ya incrustados (header "⏱ CHAPTERS").
 *   B) "## Descripción YouTube" sin chapters + "## CHAPTERS" en sección aparte.
 */
export function extractSeoDescription(md: string): { description: string; tags: string[] } {
  md = md.replace(/\r\n?/g, '\n');
  const stripHr = (s: string) => s.replace(/\n\s*-{3,}\s*$/, '').trim();

  // ── Descripción ────────────────────────────────────────────────────
  let description = '';
  const descSec =
    md.match(/^##\s+[^\n]*?Descripci[oó]n[^\n]*\n+([\s\S]+?)(?=^##\s|(?![\s\S]))/im) ??
    md.match(/^##\s+[^\n]*?Description[^\n]*\n+([\s\S]+?)(?=^##\s|(?![\s\S]))/im);
  if (descSec) {
    let body = descSec[1].trim();
    const code = body.match(/```(?:[\w-]+)?\n([\s\S]+?)```/);
    body = code ? code[1].trim() : body.replace(/<!--[\s\S]*?-->/g, '');
    description = stripHr(body);
  }
  // Si la descripción no trae chapters incrustados, añadirlos desde "## CHAPTERS".
  const hasInlineChapters = /(^|\n)\s*\d{1,2}:\d{2}\b/.test(description);
  if (!hasInlineChapters) {
    const chSec = md.match(/^##\s+[^\n]*?(?:CHAPTERS|Cap[ií]tulos)[^\n]*\n+([\s\S]+?)(?=^##\s|(?![\s\S]))/im);
    if (chSec) {
      const lines = stripHr(chSec[1])
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /^\d{1,2}:\d{2}(:\d{2})?\b/.test(l));
      if (lines.length > 0) {
        description = description ? `${description}\n\n${lines.join('\n')}` : lines.join('\n');
      }
    }
  }

  // ── Tags ───────────────────────────────────────────────────────────
  const tags: string[] = [];
  const tagSec = md.match(/^##\s+[^\n]*?(?:Tags|Keywords)[^\n]*\n+([\s\S]+?)(?=^##\s|(?![\s\S]))/im);
  if (tagSec) {
    let body = stripHr(tagSec[1].trim());
    const code = body.match(/```(?:[\w-]+)?\n([\s\S]+?)```/);
    if (code) body = code[1].trim();
    body
      .split(/[,\n;]/)
      .map((t) => cleanValue(t).replace(/^#/, ''))
      .filter((t) => t.length > 1 && t.length < 50 && !/^-+$/.test(t))
      .forEach((t) => {
        if (!tags.includes(t)) tags.push(t);
      });
  }

  return { description, tags };
}
