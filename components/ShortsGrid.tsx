'use client';

interface ShortFile {
  name: string;
  relPath: string;
  size: number;
}

interface Props {
  shorts: ShortFile[];
  mediaUrlFor: (relPath: string) => string;
}

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Extrae "N — Título" de "Short N — Título.mp4" para mostrar limpio.
 */
function shortLabel(name: string): { num: string; title: string } {
  const m = /^Short\s+(\d+)\s*[—-]\s*(.+?)\.[^.]+$/i.exec(name);
  if (m) return { num: m[1], title: m[2] };
  return { num: '?', title: name.replace(/\.[^.]+$/, '') };
}

export function ShortsGrid({ shorts, mediaUrlFor }: Props) {
  if (shorts.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
        Shorts derivados ({shorts.length})
      </h2>
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(180px, 1fr))`,
        }}
      >
        {shorts.map((s) => {
          const { num, title } = shortLabel(s.name);
          return (
            <article
              key={s.relPath}
              className="overflow-hidden rounded-lg border border-purple-500/20 bg-bg/60"
            >
              <div className="relative aspect-[9/16] w-full bg-black">
                <video
                  controls
                  preload="metadata"
                  className="h-full w-full"
                  src={mediaUrlFor(s.relPath)}
                />
                <span className="pointer-events-none absolute top-1.5 left-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-purple-300">
                  short #{num}
                </span>
              </div>
              <div className="p-2">
                <p
                  className="line-clamp-2 text-[11px] leading-tight text-zinc-200"
                  title={title}
                >
                  {title}
                </p>
                <p className="mt-1 text-[10px] text-muted">{formatBytes(s.size)}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
