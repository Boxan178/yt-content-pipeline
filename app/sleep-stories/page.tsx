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

const STATE_PILL: Record<string, string> = {
  pending_locution: 'bg-orange-500/20 border border-orange-500/40 text-orange-300 rounded-full px-2 py-0.5 text-[9px] font-medium inline-flex items-center',
  production: 'pill-away rounded-full px-2 py-0.5 text-[9px] font-medium',
  ready: 'bg-amber-500/15 border border-amber-500/40 text-amber-300 rounded-full px-2 py-0.5 text-[9px] font-medium inline-flex items-center',
  uploaded: 'pill-active rounded-full px-2 py-0.5 text-[9px] font-medium',
  archived: 'pill-soon rounded-full px-2 py-0.5 text-[9px] font-medium',
};

export default function SleepStoriesPage() {
  const router = useRouter();
  const [stories, setStories] = useState<SleepStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [langFilter, setLangFilter] = useState<'all' | 'en' | 'es'>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
  // Miniaturas que fallaron al cargar → mostramos el placeholder de luna por card.
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

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
    <main className="mx-auto max-w-7xl px-8 pb-12 pt-2">
      <header className="mb-8 flex items-start gap-3">
        <span className="text-accent opacity-80 mt-1">
          <IconMoon />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-display text-white mb-2">
            Sleep Stories
          </h1>
          <p className="text-sm text-zinc-400">
            <span className="nums">{stories.length}</span> historias ·{' '}
            <span className="nums">{byLanguage.en}</span> EN (Moderni Stoici) ·{' '}
            <span className="nums">{byLanguage.es}</span> ES (Moderno Estoico)
          </p>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="glass relative flex-1 min-w-[200px] rounded-full">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
            <IconSearch />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por slug…"
            className="w-full bg-transparent rounded-full pl-9 pr-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none"
          />
        </div>
        <nav className="glass flex gap-0.5 rounded-full p-1">
          {(
            [
              ['all', 'Todos'],
              ['en', 'EN'],
              ['es', 'ES'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setLangFilter(k)}
              className={`rounded-full px-3 py-0.5 text-xs font-medium transition ${
                langFilter === k
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="glass rounded-full px-3 py-1.5 text-xs text-white focus:outline-none cursor-pointer"
        >
          <option value="all">Todos los estados</option>
          {Object.entries(STATE_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Error: {error}
        </div>
      ) : visible.length === 0 ? (
        <div className="glass rounded-3xl py-24 text-center">
          <p className="font-display text-lg text-zinc-300">Sin resultados.</p>
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
        >
          {visible.map((s) => (
            <article
              key={s.folderPath}
              onClick={() => router.push(`/channels/${s.channel}`)}
              className="glass glass-hover cursor-pointer overflow-hidden rounded-3xl"
              title={s.folderPath}
            >
              <div className="relative h-28 w-full bg-black/30">
                {s.thumbnailUrl && !imgErrors[s.folderPath] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.thumbnailUrl}
                    alt={s.title}
                    className="h-full w-full object-contain"
                    loading="lazy"
                    onError={() =>
                      setImgErrors((prev) => ({ ...prev, [s.folderPath]: true }))
                    }
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-zinc-500">
                    <IconMoonLarge />
                  </div>
                )}
                <span className="absolute top-2 left-2 rounded-full bg-black/70 backdrop-blur px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white border border-white/10">
                  {s.language}
                </span>
                <span className={`absolute top-2 right-2 ${STATE_PILL[s.state] ?? 'pill-soon'}`}>
                  {STATE_LABEL[s.state] ?? s.state}
                </span>
              </div>
              <div className="p-3">
                <p
                  className="line-clamp-1 text-xs font-medium text-white"
                  title={s.title}
                >
                  {s.title}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="xp-fill h-full"
                      style={{ width: `${s.progress.percent}%` }}
                    />
                  </div>
                  <span className="nums text-[10px] text-zinc-500">
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

function IconMoon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function IconMoonLarge() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
