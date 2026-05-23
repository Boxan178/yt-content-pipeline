// Browser-safe parser de checkboxes Markdown.
// Extrae líneas tipo "- [ ] texto" y "- [x] texto" del packaging.md.

export interface ChecklistItem {
  done: boolean;
  text: string;
  /** Heading de la sección donde apareció el item, si lo hay. */
  section: string | null;
}

const CHECKBOX_RE = /^\s*[-*]\s*\[([ xX])\]\s*(.+?)\s*$/;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

export function parseChecklists(markdown: string): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  let currentSection: string | null = null;

  const lines = markdown.split(/\r?\n/);
  for (const raw of lines) {
    const h = HEADING_RE.exec(raw);
    if (h) {
      currentSection = h[2].replace(/[*_`]/g, '').trim();
      continue;
    }
    const m = CHECKBOX_RE.exec(raw);
    if (m) {
      items.push({
        done: m[1].toLowerCase() === 'x',
        text: m[2]
          // limpiar **bold** y *italic* superficial para mostrarlos limpios
          .replace(/\*\*(.+?)\*\*/g, '$1')
          .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
          // limpiar tachado ~~...~~ pero conservar el texto
          .replace(/~~(.+?)~~/g, '$1')
          .trim(),
        section: currentSection,
      });
    }
  }
  return items;
}
