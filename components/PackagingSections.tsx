'use client';

import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  markdown: string;
}

interface Section {
  heading: string;       // texto del heading (sin ##)
  level: 1 | 2;
  raw: string;           // contenido completo de la sección (sin el heading)
  /** Si la sección debería estar abierta por defecto. */
  defaultOpen: boolean;
}

// Heurísticas: secciones "importantes" abiertas por defecto
const OPEN_BY_DEFAULT = [
  'pendientes',
  'decisiones',
  'titulo',
  'título',
];

function shouldOpenByDefault(heading: string): boolean {
  const lower = heading.toLowerCase();
  return OPEN_BY_DEFAULT.some((k) => lower.includes(k));
}

function splitSections(md: string): { intro: string; sections: Section[] } {
  // Detectamos secciones por ## H2. Si no hay ningún ##, fallback a # H1.
  const hasH2 = /^##\s+/m.test(md);
  const headingRe = hasH2 ? /^(##)\s+(.+)$/gm : /^(#)\s+(.+)$/gm;

  const matches: Array<{ index: number; level: 1 | 2; heading: string; lineEnd: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(md))) {
    matches.push({
      index: m.index,
      level: m[1].length === 2 ? 2 : 1,
      heading: m[2].trim(),
      lineEnd: m.index + m[0].length,
    });
  }
  if (matches.length === 0) {
    return { intro: md, sections: [] };
  }
  const intro = md.slice(0, matches[0].index).trim();
  const sections: Section[] = matches.map((mm, idx) => {
    const start = mm.lineEnd;
    const end = idx + 1 < matches.length ? matches[idx + 1].index : md.length;
    const raw = md.slice(start, end).trim();
    return {
      heading: mm.heading,
      level: mm.level,
      raw,
      defaultOpen: shouldOpenByDefault(mm.heading),
    };
  });
  return { intro, sections };
}

/**
 * Renderiza un packaging.md largo dividido en `<details>` colapsables por
 * sección (cada `## H2` o, si no hay, cada `# H1`). Algunas secciones clave
 * empiezan abiertas (Pendientes, Decisiones, Título…).
 *
 * Toggle "Expandir / Colapsar todo" arriba.
 */
export function PackagingSections({ markdown }: Props) {
  const { intro, sections } = useMemo(() => splitSections(markdown), [markdown]);
  // Estado: openMap[idx] = true/false. Inicializado con los defaultOpen.
  const [openMap, setOpenMap] = useState<Record<number, boolean>>(() => {
    const map: Record<number, boolean> = {};
    sections.forEach((s, i) => { map[i] = s.defaultOpen; });
    return map;
  });

  const setAll = (open: boolean) => {
    const next: Record<number, boolean> = {};
    sections.forEach((_s, i) => { next[i] = open; });
    setOpenMap(next);
  };

  if (sections.length === 0) {
    // No hay headings — render plano
    return (
      <div className="prose-tg glass overflow-hidden rounded-3xl p-5">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-1.5 px-1 text-[10px]">
        <button
          onClick={() => setAll(true)}
          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
        >
          Expandir todo
        </button>
        <button
          onClick={() => setAll(false)}
          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
        >
          Colapsar todo
        </button>
      </div>

      {intro && (
        <div className="prose-tg glass overflow-hidden rounded-3xl p-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{intro}</ReactMarkdown>
        </div>
      )}

      {sections.map((s, idx) => {
        const open = !!openMap[idx];
        return (
          <div
            key={`${idx}-${s.heading}`}
            className="glass overflow-hidden rounded-3xl"
          >
            <button
              onClick={() => setOpenMap((prev) => ({ ...prev, [idx]: !open }))}
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-white/5"
            >
              <span className="font-display text-sm font-semibold tracking-display text-white">
                {s.heading}
              </span>
              <span className={`text-zinc-500 transition-transform ${open ? 'rotate-90' : ''}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </span>
            </button>
            {open && (
              <div className="border-t border-white/10 px-4 py-3">
                <div className="prose-tg">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.raw}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
