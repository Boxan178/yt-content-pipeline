'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClaudeRunButton } from './ClaudeRunButton';
import { buildNoraIris, type VideoContext } from '@/lib/prompts';

interface ImageEntry {
  name: string;
  relPath: string;
  size: number;
  ext: string;
  mtime: string;
}

interface Props {
  channel: string;
  videoTitle: string;
  videoFolder: string;
  ctx: VideoContext;
  /** Solo las imágenes que viven dentro de _PACKAGING/MINIATURAS/. */
  miniaturesImages: ImageEntry[];
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function relTime(iso: string) {
  const d = new Date(iso).getTime();
  const diff = (d - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const RELATIVE = new Intl.RelativeTimeFormat('es-ES', { numeric: 'auto' });
  if (abs < 60) return RELATIVE.format(Math.round(diff), 'second');
  if (abs < 3600) return RELATIVE.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return RELATIVE.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return RELATIVE.format(Math.round(diff / 86400), 'day');
  return RELATIVE.format(Math.round(diff / (86400 * 30)), 'month');
}

export function ThumbnailsPanel({
  channel,
  videoTitle,
  videoFolder,
  ctx,
  miniaturesImages,
}: Props) {
  const [zoomed, setZoomed] = useState<ImageEntry | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busySelect, setBusySelect] = useState<string | null>(null);

  const enc = (s: string) => encodeURIComponent(s);
  const mediaUrl = (relPath: string) =>
    `/api/channels/${enc(channel)}/videos/${enc(videoTitle)}/media?file=${enc(relPath)}`;
  const selectUrl = `/api/channels/${enc(channel)}/videos/${enc(videoTitle)}/select-thumbnail`;

  const nora = buildNoraIris(ctx);

  const loadSelected = useCallback(async () => {
    try {
      const r = await fetch(selectUrl, { cache: 'no-store' });
      const data = await r.json();
      if (data.ok) setSelected(data.selected ?? null);
    } catch {}
  }, [selectUrl]);

  useEffect(() => {
    loadSelected();
  }, [loadSelected]);

  const setSelectedTo = async (filename: string | null) => {
    setBusySelect(filename ?? '__clear__');
    try {
      const r = await fetch(selectUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      const data = await r.json();
      if (data.ok) setSelected(data.selected ?? null);
    } catch {}
    setBusySelect(null);
  };

  // Filtra solo las que están dentro de _PACKAGING/MINIATURAS/
  const minis = miniaturesImages
    .filter((i) =>
      i.relPath.toUpperCase().includes('_PACKAGING/MINIATURAS/') ||
      i.relPath.toUpperCase().includes('_PACKAGING\\MINIATURAS\\'),
    )
    .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));

  // Cuál es la "actual": la elegida explícitamente, o la última modificada.
  const activeName = selected ?? minis[0]?.name ?? null;

  return (
    <section>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-label text-zinc-500">
          Miniaturas <span className="nums normal-case tracking-normal text-zinc-400">({minis.length})</span>
        </h2>
      </header>

      {minis.length === 0 ? (
        <div className="glass mb-4 rounded-3xl px-4 py-8 text-center text-sm text-zinc-500">
          Sin miniaturas en <code className="font-mono text-zinc-400">_PACKAGING/MINIATURAS/</code> todavía.
        </div>
      ) : (
        <div
          className="mb-4 grid gap-3"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(200px, 1fr))` }}
        >
          {minis.map((img) => {
            const isActive = activeName === img.name;
            const isExplicit = selected === img.name;
            return (
              <article
                key={img.relPath}
                className={`glass glass-hover group relative overflow-hidden rounded-2xl ${
                  isActive ? 'ring-1 ring-green-500/40' : ''
                }`}
                style={isActive ? { borderColor: 'rgba(34,197,94,0.4)' } : undefined}
                title={img.name}
              >
                <div
                  className="relative aspect-video w-full cursor-pointer bg-black"
                  onClick={() => setZoomed(img)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl(img.relPath)}
                    alt={img.name}
                    className="h-full w-full object-contain"
                    loading="lazy"
                  />
                  {isActive && (
                    <span
                      className="pill-active absolute top-2 left-2"
                      title={
                        isExplicit
                          ? 'Marcada como elegida'
                          : 'Más reciente (no hay elegida explícita)'
                      }
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                      {isExplicit ? 'elegida' : 'actual'}
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="line-clamp-1 text-[11px] text-zinc-300" title={img.name}>
                    {img.name}
                  </p>
                  <p className="nums mt-0.5 font-mono text-[10px] text-zinc-500">
                    {formatBytes(img.size)} · {relTime(img.mtime)}
                  </p>
                  <div className="mt-2 flex items-center gap-1">
                    {isExplicit ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTo(null);
                        }}
                        disabled={busySelect !== null}
                        className="flex-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                        title="Quitar la marca (vuelve a 'más reciente')"
                      >
                        Quitar marca
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTo(img.name);
                        }}
                        disabled={busySelect !== null}
                        className="flex-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] text-accent transition hover:bg-accent/20 disabled:opacity-50"
                        title="Marcar como miniatura elegida"
                      >
                        {busySelect === img.name ? 'Marcando…' : 'Marcar elegida'}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Acción: generar nueva miniatura con NORA + IRIS (ejecuta kie-bridge directo) */}
      <ClaudeRunButton
        label={minis.length === 0 ? 'Generar miniatura con NORA + IRIS' : 'Iterar miniatura con NORA + IRIS'}
        hint="NORA define concepto + IRIS construye prompt + ejecuta kie-bridge (nano-banana-2) directo. Genera 3 variantes a disco."
        prompt={nora.prompt}
        cwd={nora.cwd}
        videoFolder={videoFolder}
        skill="nora-iris"
        jobLabel="NORA+IRIS"
        timeoutMs={nora.timeoutMs}
        model={nora.model}
        loop={nora.loop}
        variant="primary"
      />

      {/* Lightbox simple al hacer click */}
      {zoomed && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-6 backdrop-blur-sm"
          onClick={() => setZoomed(null)}
        >
          <div className="relative max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaUrl(zoomed.relPath)}
              alt={zoomed.name}
              className="max-h-[88vh] max-w-[88vw] rounded-2xl object-contain"
            />
            <div className="glass-premium absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-2xl px-3 py-2 text-xs text-white">
              <span className="truncate">{zoomed.name}</span>
              <span className="nums shrink-0 pl-3 font-mono text-zinc-400">
                {formatBytes(zoomed.size)} · {relTime(zoomed.mtime)}
              </span>
            </div>
            <button
              onClick={() => setZoomed(null)}
              className="glass-premium absolute -top-3 -right-3 flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:text-accent"
              title="Cerrar (Esc)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
