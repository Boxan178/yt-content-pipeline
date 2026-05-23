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
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Miniaturas ({minis.length})
        </h2>
      </header>

      {minis.length === 0 ? (
        <p className="mb-3 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          Sin miniaturas en <code className="text-zinc-400">_PACKAGING/MINIATURAS/</code> todavía.
        </p>
      ) : (
        <div
          className="mb-3 grid gap-3"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(200px, 1fr))` }}
        >
          {minis.map((img) => {
            const isActive = activeName === img.name;
            const isExplicit = selected === img.name;
            return (
              <article
                key={img.relPath}
                className={`group relative overflow-hidden rounded-lg border bg-bg/60 transition hover:border-accent/60 ${
                  isActive ? 'border-green-500/50 ring-1 ring-green-500/30' : 'border-border'
                }`}
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
                      className="absolute top-1.5 left-1.5 rounded bg-green-600 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white"
                      title={
                        isExplicit
                          ? 'Marcada como elegida'
                          : 'Más reciente (no hay elegida explícita)'
                      }
                    >
                      {isExplicit ? '✓ elegida' : 'actual'}
                    </span>
                  )}
                </div>
                <div className="p-2">
                  <p className="line-clamp-1 text-[11px] text-zinc-300" title={img.name}>
                    {img.name}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {formatBytes(img.size)} · {relTime(img.mtime)}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1">
                    {isExplicit ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTo(null);
                        }}
                        disabled={busySelect !== null}
                        className="flex-1 rounded border border-border bg-bg px-1.5 py-0.5 text-[10px] text-muted transition hover:text-white disabled:opacity-50"
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
                        className="flex-1 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent transition hover:bg-accent/20 disabled:opacity-50"
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
        label={minis.length === 0 ? '🎨 Generar miniatura con NORA + IRIS' : '🎨 Iterar miniatura con NORA + IRIS'}
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
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-6"
          onClick={() => setZoomed(null)}
        >
          <div className="relative max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaUrl(zoomed.relPath)}
              alt={zoomed.name}
              className="max-h-[88vh] max-w-[88vw] rounded-lg object-contain"
            />
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded bg-black/70 px-3 py-2 text-xs text-white">
              <span className="truncate">{zoomed.name}</span>
              <span className="shrink-0 pl-3 text-muted">
                {formatBytes(zoomed.size)} · {relTime(zoomed.mtime)}
              </span>
            </div>
            <button
              onClick={() => setZoomed(null)}
              className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-panel text-sm text-white hover:bg-bg"
              title="Cerrar (Esc)"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
