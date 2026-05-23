'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

interface SleepStory {
  channel: string;
  channelName: string;
  title: string;
  language: 'en' | 'es';
  state: string;
  folderPath: string;
  thumbnailUrl: string | null;
  mtime: string;
  progress: { percent: number; hits: number; total: number };
}

const STATE_LABEL: Record<string, string> = {
  pending_locution: 'Pendiente locución',
  production: 'En producción',
  ready: 'Listos',
  uploaded: 'Subidos',
  archived: 'Archivados',
};

const STATE_COLOR: Record<string, string> = {
  pending_locution: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  production: 'border-red-500/40 bg-red-500/10 text-red-300',
  ready: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  uploaded: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  archived: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300',
};

export default function SleepStoriesPage() {
  const router = useRouter();
  const [stories, setStories] = useState<SleepStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [langFilter, setLangFilter] = useState<'all' | 'en' | 'es'>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/sleep-stories', { cache: 'no-store' });
      const data = await r.json();
      if (data.ok) {
        setStories(data.stories);
        setError(null);
      } else {
        setError(data.error || 'unknown');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stories.filter((s) => {
      if (q && !s.title.toLowerCase().includes(q)) return false;
      if (langFilter !== 'all' && s.language !== langFilter) return false;
      if (stateFilter !== 'all' && s.state !== stateFilter) return false;
      return true;
    });
  }, [stories, search, langFilter, stateFilter]);

  const byLanguage = useMemo(() => {
    const en = stories.filter((s) => s.language === 'en').length;
    const es = stories.filter((s) => s.language === 'es').length;
    return { en, es };
  }, [stories]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">🌙 Sleep Stories</h1>
          <p className="mt-1 text-sm text-muted">
            {stories.length} historias · {byLanguage.en} EN (Moderni Stoici) · {byLanguage.es} ES (Moderno Estoico)
          </p>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔎 Buscar por slug…"
          className="flex-1 min-w-[200px] rounded border border-border bg-bg/40 px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:border-accent/60 focus:outline-none"
        />
        <nav className="flex gap-1 rounded-lg border border-border bg-bg/40 p-1">
          {([['all', 'Todos'], ['en', '🇬🇧 EN'], ['es', '🇪🇸 ES']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setLangFilter(k)}
              className={`rounded px-2 py-0.5 text-xs transition ${
                langFilter === k ? 'bg-accent/20 text-accent' : 'text-muted hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="rounded border border-border bg-bg/40 px-2 py-1.5 text-xs text-white"
        >
          <option value="all">Todos los estados</option>
          {Object.entries(STATE_LABEL).map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
        </div>
      ) : error ? (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Error: {error}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-24 text-center text-muted">
          <p className="text-lg">Sin resultados.</p>
        </div>
      ) : (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
        >
          {visible.map((s) => (
            <article
              key={s.folderPath}
              onClick={() => router.push(`/channels/${s.channel}`)}
              className="cursor-pointer overflow-hidden rounded-lg border border-border bg-panel transition hover:border-accent/60"
              title={s.folderPath}
            >
              <div className="relative h-28 w-full bg-bg">
                {s.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.thumbnailUrl}
                    alt={s.title}
                    className="h-full w-full object-contain"
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-3xl">🌙</div>
                )}
                <span className="absolute top-1.5 left-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">
                  {s.language === 'en' ? '🇬🇧 EN' : '🇪🇸 ES'}
                </span>
                <span
                  className={`absolute top-1.5 right-1.5 rounded border px-1.5 py-0.5 text-[9px] font-semibold ${STATE_COLOR[s.state]}`}
                >
                  {STATE_LABEL[s.state]}
                </span>
              </div>
              <div className="p-2.5">
                <p className="line-clamp-1 text-xs font-medium text-white" title={s.title}>
                  {s.title}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-emerald-200"
                      style={{ width: `${s.progress.percent}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted">
                    {s.progress.hits}/{s.progress.total}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
