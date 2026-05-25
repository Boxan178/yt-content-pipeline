/**
 * Parsea la salida de style-engine (`-p` con `stream-json`) y extrae los
 * bloques que cada estado del flujo produce, identificándolos por los headers
 * estándar que la skill usa.
 *
 * Convenciones de style-engine (ver Y:/.../skills/style-engine/SKILL.md):
 *   - Cada bloque empieza con un header en MAYÚSCULAS seguido de una línea
 *     de separación: `─────────────────────────────────────────` (40+ chars).
 *   - Termina con otra línea de separación idéntica.
 *   - Headers conocidos:
 *       ANÁLISIS DEL CANAL
 *       STYLE DNA
 *       WORD COUNT FINAL
 *       VISUAL STYLE PROFILE
 *       THUMBNAIL STYLE PROFILE
 *       THUMBNAIL #N           (N = 1..5)
 *       LOGO PROMPT (...)
 *       BANNER PROMPT (...)
 *
 * Browser-safe: solo string processing. Lo importan tanto API routes como
 * el visor cliente.
 */

const SEPARATOR_RE = /^[─\-_]{20,}$/;

/**
 * Extrae el primer bloque que sigue al header exacto. Devuelve el texto
 * interior entre los dos separadores, sin headers ni separadores.
 *
 * @param text Salida bruta del style-engine job.
 * @param header Header literal (case-sensitive en estados con tilde).
 * @returns Texto del bloque o null si no aparece.
 */
export function extractBlock(text: string, header: string): string | null {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === header) {
      // Espera separador en la siguiente línea
      if (i + 1 < lines.length && SEPARATOR_RE.test(lines[i + 1].trim())) {
        const start = i + 2;
        let end = start;
        while (end < lines.length && !SEPARATOR_RE.test(lines[end].trim())) {
          end++;
        }
        return lines.slice(start, end).join('\n').trim();
      }
    }
  }
  return null;
}

/**
 * Extrae el texto entre dos headers (sin separadores), incluyendo el
 * contenido completo desde el header A hasta el header B. Útil para
 * cuando una sección no usa separadores limpios.
 */
export function extractBetween(text: string, headerA: string, headerB: string): string | null {
  const idxA = text.indexOf(headerA);
  if (idxA === -1) return null;
  const idxB = text.indexOf(headerB, idxA + headerA.length);
  if (idxB === -1) return null;
  return text.slice(idxA + headerA.length, idxB).trim();
}

/**
 * Para cuando style-engine emite varios bloques con el mismo prefijo
 * (ej. THUMBNAIL #1, THUMBNAIL #2, ...). Devuelve todos.
 */
export function extractAllBlocks(text: string, headerPrefix: string): Array<{ header: string; body: string }> {
  const lines = text.split(/\r?\n/);
  const blocks: Array<{ header: string; body: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith(headerPrefix) && i + 1 < lines.length && SEPARATOR_RE.test(lines[i + 1].trim())) {
      const start = i + 2;
      let end = start;
      while (end < lines.length && !SEPARATOR_RE.test(lines[end].trim())) {
        end++;
      }
      blocks.push({
        header: trimmed,
        body: lines.slice(start, end).join('\n').trim(),
      });
      i = end;
    }
  }
  return blocks;
}

export interface ParsedAnalysis {
  channelAnalysis?: string;
  styleDna?: string;
  scriptSample?: string;
  wordCountFinal?: string;
}

export function parseAnalysisJob(text: string): ParsedAnalysis {
  return {
    channelAnalysis: extractBlock(text, 'ANÁLISIS DEL CANAL') ?? undefined,
    styleDna: extractBlock(text, 'STYLE DNA') ?? undefined,
    wordCountFinal: extractBlock(text, 'WORD COUNT FINAL') ?? undefined,
    // El script no tiene header — viene entre WORD COUNT y otro separador.
    // Solo se extrae si encontramos un marcador delimitado.
    scriptSample: extractScript(text) ?? undefined,
  };
}

/**
 * El script style-locked en STATE 6 NO viene con header propio. Se delimita
 * mediante una línea `SCRIPT (style-locked):` o similar. Si no hay marcador
 * explícito, devuelve null y se confía en que el agente refinará el formato.
 */
function extractScript(text: string): string | null {
  const m = text.match(/SCRIPT[^:\n]*:\s*\n([\s\S]+?)(?=\nWORD COUNT FINAL|\n─{20,}|\n$)/i);
  return m ? m[1].trim() : null;
}

export interface ParsedVisuals {
  visualStyleProfile?: string;
  thumbnailStyleProfile?: string;
  thumbnailConcepts?: Array<{ header: string; body: string }>;
}

export function parseVisualsJob(text: string): ParsedVisuals {
  const thumbs = extractAllBlocks(text, 'THUMBNAIL #');
  return {
    visualStyleProfile: extractBlock(text, 'VISUAL STYLE PROFILE') ?? undefined,
    thumbnailStyleProfile: extractBlock(text, 'THUMBNAIL STYLE PROFILE') ?? undefined,
    thumbnailConcepts: thumbs.length > 0 ? thumbs : undefined,
  };
}

/**
 * Filtra los eventos NDJSON emitidos por `claude -p --output-format stream-json`
 * y devuelve el texto concatenado del último mensaje assistant.
 *
 * Cada línea del log tiene la forma:
 *   { "type": "system", ... }
 *   { "type": "assistant", "message": { "content": [{ "type": "text", "text": "..." }, ...] } }
 *   { "type": "result", ... }
 */
export function extractAssistantText(rawLog: string): string {
  const lines = rawLog.split(/\r?\n/);
  const chunks: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const ev = JSON.parse(trimmed) as { type?: string; message?: { content?: Array<{ type?: string; text?: string }> } };
      if (ev.type === 'assistant' && ev.message?.content) {
        for (const c of ev.message.content) {
          if (c.type === 'text' && typeof c.text === 'string') {
            chunks.push(c.text);
          }
        }
      }
    } catch {
      // ignorar líneas no JSON (cabecera ytcp claude-job, etc.)
    }
  }
  return chunks.join('\n').trim();
}
