'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { STATE_LABEL, STATE_ORDER, type VideoState } from '@/lib/channels';
import { VideoCard, type VideoCardData } from '@/components/VideoCard';
import { VideoDetailModal } from '@/components/VideoDetailModal';
import { NewCompilationModal } from '@/components/NewCompilationModal';
import { awardOnce } from '@/lib/gamification-client';

interface Transition {
  videoFolder: string;
  videoTitle: string;
  from: string | null;
  to: string;
}

interface ApiResponse {
  channel: string;
  name: string;
  counts: Record<VideoState, number>;
  videos: VideoCardData[];
  transitions?: Transition[];
}

const REFRESH_MS = 60_000;

export default function ChannelPage() {
  const params = useParams<{ channel: string }>();
  const channelSlug = params.channel;

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [batchArchiving, setBatchArchiving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selected, setSelected] = useState<VideoCardData | null>(null);
  const [celebrating, setCelebrating] = useState<Set<string>>(new Set());
  const [showCompilation, setShowCompilation] = useState(false);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'compilation' | 'working' | 'incomplete'>('all');
  const lastLoad = useRef(0);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const r = await fetch(`/api/channels/${channelSlug}/videos`, { cache: 'no-store' });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${r.status}`);
      }
      const payload = (await r.json()) as ApiResponse;
      setData(payload);
      setError(null);
      // Procesar transiciones: dispara XP + animación en la card.
      const trans = payload.transitions ?? [];
      if (trans.length > 0) {
        const newCelebrating = new Set<string>();
        for (const t of trans) {
          newCelebrating.add(t.videoFolder);
          const kind = t.to === 'uploaded' ? 'video_uploaded' : t.to === 'ready' ? 'video_ready' : null;
          if (kind) {
            awardOnce({
              dedupId: `${t.videoFolder}::${t.to}`,
              kind,
              label: t.videoTitle,
            });
          }
        }
        setCelebrating((prev) => new Set([...prev, ...newCelebrating]));
        // Quitar el ring de celebración después de 4s
        setTimeout(() => {
          setCelebrating((prev) => {
            const next = new Set(prev);
            for (const f of newCelebrating) next.delete(f);
            return next;
          });
        }, 4000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      lastLoad.current = Date.now();
      setRefreshing(false);
      setLoading(false);
    }
  }, [channelSlug]);

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 4000);
  }, []);

  const grouped = useMemo(() => {
    const g: Record<VideoState, VideoCardData[]> = { pending_locution: [], production: [], ready: [], uploaded: [], archived: [] };
    const q = search.trim().toLowerCase();
    for (const v of data?.videos ?? []) {
      // Filtros
      if (q && !v.title.toLowerCase().includes(q)) continue;
      if (filterMode === 'compilation' && !v.isCompilation) continue;
      if (filterMode === 'working' && (!v.activeJobs || v.activeJobs.length === 0)) continue;
      if (filterMode === 'incomplete' && v.progress.percent === 100) continue;
      // Si hay un job claude activo sobre este vídeo, lo mostramos visualmente
      // en "En producción" sin importar su estado físico en el filesystem.
      // Cuando el job termine, vuelve solo a su columna real en el siguiente refresh.
      const targetState: VideoState =
        v.activeJobs && v.activeJobs.length > 0 ? 'production' : v.state;
      g[targetState].push(v);
    }
    return g;
  }, [data, search, filterMode]);

  const visibleStates: VideoState[] = useMemo(
    () => STATE_ORDER.filter((s) => s !== 'archived' || showArchived),
    [showArchived],
  );

  const archiveAllUploaded = async () => {
    const uploaded = grouped.uploaded;
    if (uploaded.length === 0) return;
    if (!confirm(`Archivar ${uploaded.length} vídeo(s) de _SUBIDOS? Se mueven todos a _ARCHIVO.`)) return;
    setBatchArchiving(true);
    let ok = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const v of uploaded) {
      try {
        const r = await fetch(
          `/api/channels/${encodeURIComponent(v.channel)}/videos/${encodeURIComponent(v.title)}/archive`,
          { method: 'POST' },
        );
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        ok++;
      } catch (e) {
        failed++;
        errors.push(`${v.title}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setBatchArchiving(false);
    flashToast(
      failed === 0
        ? `Archivados ${ok} vídeo(s).`
        : `Archivados ${ok}, fallaron ${failed}. Primer error: ${errors[0]}`,
    );
    await load();
  };

  const handleArchived = useCallback(
    (v: VideoCardData) => {
      flashToast(`Archivado: ${v.title}`);
      load();
    },
    [flashToast, load],
  );

  const handleOpen = useCallback((v: VideoCardData) => setSelected(v), []);
  const handleCloseModal = useCallback(() => setSelected(null), []);

  // ── Drag & drop entre columnas ─────────────────────────────────────
  const [dragOverState, setDragOverState] = useState<VideoState | null>(null);
  const handleDropOnColumn = useCallback(
    async (e: React.DragEvent, toState: VideoState) => {
      e.preventDefault();
      setDragOverState(null);
      const raw = e.dataTransfer.getData('text/x-ytcp-video');
      if (!raw) return;
      let payload: { channel: string; title: string; fromState: VideoState };
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }
      if (payload.fromState === toState) return;
      try {
        const r = await fetch(
          `/api/channels/${encodeURIComponent(payload.channel)}/videos/${encodeURIComponent(payload.title)}/move-state`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ toState }),
          },
        );
        const data = await r.json();
        if (!r.ok || !data.ok) {
          flashToast(`Error al mover: ${data.error || `HTTP ${r.status}`}`);
        } else {
          flashToast(`Movido "${payload.title}" → ${toState}`);
          load();
        }
      } catch (err) {
        flashToast(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [flashToast, load],
  );

  return (
    <main className="mx-auto max-w-[1600px] px-6 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/" className="mb-2 inline-block text-xs text-muted hover:text-white">
            ← Canales
          </Link>
          <h1 className="text-2xl font-bold text-white">{data?.name ?? channelSlug}</h1>
          {data && (
            <p className="mt-1 text-sm text-muted">
              {data.counts.pending_locution + data.counts.production + data.counts.ready + data.counts.uploaded + data.counts.archived} vídeos
              {data.counts.pending_locution > 0 && ` · ${data.counts.pending_locution} pendiente locución`}
              {' · '}
              {data.counts.production} en producción
              {' · '}
              {data.counts.ready} listos
              {' · '}
              {data.counts.uploaded} subidos
              {data.counts.archived > 0 && ` · ${data.counts.archived} archivados`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCompilation(true)}
            className="rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5 text-sm text-accent transition hover:bg-accent/20"
            title="Crear una recopilación de varias historias"
          >
            📚 Nueva recopilación
          </button>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border-border bg-bg"
            />
            Mostrar archivados
          </label>
          <button
            onClick={() => load()}
            disabled={refreshing}
            className="rounded-md border border-border bg-panel px-3 py-1.5 text-sm text-white transition hover:border-accent/60 disabled:opacity-50"
          >
            {refreshing ? 'Actualizando…' : 'Refrescar'}
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Error: {error}
        </div>
      )}

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔎 Buscar por título…"
          className="flex-1 min-w-[200px] rounded border border-border bg-bg/40 px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:border-accent/60 focus:outline-none"
        />
        <nav className="flex gap-1 rounded-lg border border-border bg-bg/40 p-1">
          {(
            [
              ['all', 'Todos'],
              ['working', 'Con job 🔴'],
              ['compilation', 'Recopilaciones 📚'],
              ['incomplete', 'Incompletos'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilterMode(k)}
              className={`rounded px-2 py-0.5 text-xs transition ${
                filterMode === k ? 'bg-accent/20 text-accent' : 'text-muted hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
        {(search || filterMode !== 'all') && (
          <button
            onClick={() => {
              setSearch('');
              setFilterMode('all');
            }}
            className="rounded border border-border bg-bg px-2 py-1 text-xs text-muted hover:text-white"
          >
            ✕ Limpiar
          </button>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md rounded-lg border border-accent/40 bg-panel px-4 py-3 text-sm text-white shadow-xl">
          {toast}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
        </div>
      ) : (
        <section
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${visibleStates.length}, minmax(260px, 1fr))` }}
        >
          {visibleStates.map((state) => (
            <div
              key={state}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverState !== state) setDragOverState(state);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) setDragOverState(null);
              }}
              onDrop={(e) => handleDropOnColumn(e, state)}
              className={`flex min-h-[200px] flex-col rounded-xl border bg-panel/40 p-3 transition ${
                dragOverState === state ? 'border-accent ring-2 ring-accent/30' : 'border-border'
              }`}
            >
              <header className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
                  {STATE_LABEL[state]}
                </h2>
                <div className="flex items-center gap-2">
                  {state === 'uploaded' && grouped.uploaded.length > 0 && (
                    <button
                      onClick={archiveAllUploaded}
                      disabled={batchArchiving}
                      className="rounded border border-border bg-bg px-2 py-0.5 text-[11px] text-muted transition hover:border-accent/60 hover:text-white disabled:opacity-50"
                    >
                      {batchArchiving ? 'Archivando…' : 'Archivar todos'}
                    </button>
                  )}
                  <span className="rounded-full bg-bg px-2 py-0.5 text-xs text-muted">
                    {grouped[state].length}
                  </span>
                </div>
              </header>
              <div className="flex flex-col gap-3 overflow-y-auto pr-1" style={{ maxHeight: 'calc(100vh - 240px)' }}>
                {grouped[state].length === 0 ? (
                  <p className="rounded border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted">
                    vacío
                  </p>
                ) : (
                  grouped[state].map((v) => (
                    <VideoCard
                      key={`${v.state}:${v.title}`}
                      video={v}
                      onArchived={handleArchived}
                      onOpen={handleOpen}
                      celebrate={celebrating.has(v.folderPath.replace(/\\/g, '/'))}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {selected && <VideoDetailModal video={selected} onClose={handleCloseModal} />}

      {showCompilation && data && (
        <NewCompilationModal
          channelSlug={channelSlug}
          channelName={data.name}
          videos={data.videos}
          onClose={() => setShowCompilation(false)}
          onCreated={(info) => {
            setShowCompilation(false);
            flashToast(`📚 Recopilación creada: ${info.folderName}`);
            load();
          }}
        />
      )}
    </main>
  );
}
