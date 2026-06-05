'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import type { VideoState } from '@/lib/channels';
import { VideoCard, type VideoCardData } from '@/components/VideoCard';
import { VideoDetailModal } from '@/components/VideoDetailModal';
import { BulkEnqueueModal } from '@/components/BulkEnqueueModal';
import { IdeaCard } from '@/components/IdeaCard';
import { ExploreIdeasModal } from '@/components/ExploreIdeasModal';
import { StartIdeasQueueModal } from '@/components/StartIdeasQueueModal';
import type { Idea } from '@/lib/lab/types';
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
  const [showScheduled, setShowScheduled] = useState(true);
  const [showIdeas, setShowIdeas] = useState(true);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [ideasAutoPipeline, setIdeasAutoPipeline] = useState(false);
  const [showExplore, setShowExplore] = useState(false);
  const [batchArchiving, setBatchArchiving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selected, setSelected] = useState<VideoCardData | null>(null);
  const [celebrating, setCelebrating] = useState<Set<string>>(new Set());
  const [showBulkEnqueue, setShowBulkEnqueue] = useState(false);
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
      // Ideas del canal (columna virtual). No bloquea si falla.
      try {
        const ir = await fetch(`/api/channels/${channelSlug}/ideas`, { cache: 'no-store' });
        if (ir.ok) {
          const ij = await ir.json();
          if (ij.ok) {
            setIdeas(Array.isArray(ij.ideas) ? ij.ideas : []);
            setIdeasAutoPipeline(!!ij.autoPipeline);
          }
        }
      } catch {}
      // Tick de la cola: la cola es lazy (solo avanza cuando algo llama a
      // /api/queue). Al refrescar el kanban la empujamos para que "Empezar
      // cola" siga lanzando vídeos uno detrás de otro aunque Pablo no esté en
      // /queue. Fire-and-forget.
      fetch('/api/queue', { cache: 'no-store' }).catch(() => {});
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

  // VisualState = VideoState + 'scheduled' (columna virtual, no estado físico).
  // Un vídeo con scheduledUpload pendiente/subiendo se mueve VISUALMENTE a
  // 'scheduled' aunque físicamente esté en `ready` o `production`.
  type VisualState = VideoState | 'scheduled' | 'ideas' | 'render_queue';
  const VISUAL_LABEL: Record<VisualState, string> = {
    ideas: 'Ideas',
    pending_locution: 'Pendiente locución',
    production: 'En producción',
    render_queue: 'Cola de render',
    ready: 'Listos para subir',
    scheduled: 'Programados',
    uploaded: 'Subidos',
    archived: 'Archivados',
  };

  const grouped = useMemo(() => {
    const g: Record<VisualState, VideoCardData[]> = {
      ideas: [], pending_locution: [], production: [], render_queue: [], ready: [], scheduled: [], uploaded: [], archived: [],
    };
    const q = search.trim().toLowerCase();
    // Un vídeo de producción SIN job activo y con TODO el pre-edit hecho menos el
    // render (packaging+guion+locución+brutos+miniatura ✓, renderPrincipal ✗) ya no
    // se está "trabajando": está listo para renderizar. Lo separamos en "Cola de render".
    const isRenderReady = (v: VideoCardData): boolean => {
      const d = v.progress?.details;
      return (
        !!d &&
        d.hasPackagingMd &&
        d.scriptWritten &&
        d.locucionReady &&
        d.brutosVisuales &&
        d.miniaturaFinal &&
        !d.renderPrincipal
      );
    };
    for (const v of data?.videos ?? []) {
      // Filtros
      if (q && !`${v.title} ${v.displayTitle ?? ''}`.toLowerCase().includes(q)) continue;
      if (filterMode === 'compilation' && !v.isCompilation) continue;
      if (filterMode === 'working' && (!v.activeJobs || v.activeJobs.length === 0)) continue;
      if (filterMode === 'incomplete' && v.progress.percent === 100) continue;
      // Override visual: hay JERARQUÍA de prioridad.
      //  1. Job claude activo → 'production' (rojo, está currando).
      //  2. Subida programada pending/uploading → 'scheduled' (azul).
      //  3. Producción + pre-edit completo sin render → 'render_queue' (cola de render).
      //  4. Su estado físico real.
      let targetState: VisualState;
      if (v.activeJobs && v.activeJobs.length > 0) {
        targetState = 'production';
      } else if (v.scheduledUpload) {
        targetState = 'scheduled';
      } else if (v.state === 'production' && isRenderReady(v)) {
        targetState = 'render_queue';
      } else {
        targetState = v.state;
      }
      g[targetState].push(v);
    }
    return g;
  }, [data, search, filterMode]);

  const visibleStates: VisualState[] = useMemo(() => {
    const order: VisualState[] = ['ideas', 'pending_locution', 'production', 'render_queue', 'ready', 'scheduled', 'uploaded', 'archived'];
    return order.filter((s) => {
      if (s === 'ideas') return showIdeas;
      if (s === 'archived') return showArchived;
      if (s === 'scheduled') return showScheduled;
      return true;
    });
  }, [showIdeas, showArchived, showScheduled]);

  const [showStartQueue, setShowStartQueue] = useState(false);

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
  const [dragOverState, setDragOverState] = useState<VisualState | null>(null);
  const handleDropOnColumn = useCallback(
    async (e: React.DragEvent, toState: VisualState) => {
      e.preventDefault();
      setDragOverState(null);
      // 'scheduled' es una columna VIRTUAL — no se mueve físicamente nada al
      // soltar ahí. Para programar una subida hay que usar el botón Subir
      // del modal de detalle. Si arrastran aquí avisamos sin tocar disco.
      if (toState === 'scheduled') {
        flashToast('Para programar una subida usa el botón Subir del vídeo, no arrastrando.');
        return;
      }
      // 'ideas' también es virtual (JSON), no carpeta física: no se arrastra aquí.
      if (toState === 'ideas') {
        flashToast('La columna Ideas se llena con "Explorar ideas", no arrastrando vídeos.');
        return;
      }
      // 'render_queue' es VIRTUAL: un vídeo entra ahí solo cuando su pre-edit está
      // completo sin render. No se arrastra — soltar aquí no mueve nada físico.
      if (toState === 'render_queue') {
        flashToast('«Cola de render» se llena sola cuando un vídeo tiene todo menos el render.');
        return;
      }
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

  // Render MANUAL desde la columna «Cola de render»: lanza el render (LUIS) del
  // primero de la cola. Respeta el gate secuencial (el endpoint da 409 si hay
  // otro render en curso). Los renders van de uno en uno.
  const [rendering, setRendering] = useState(false);
  const renderFirstInQueue = useCallback(async () => {
    const v = grouped.render_queue[0];
    if (!v || rendering) return;
    setRendering(true);
    try {
      const r = await fetch('/api/render/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: v.channel,
          videoFolder: v.folderPath.replace(/\\/g, '/'),
          title: v.title,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        flashToast(`Render: ${d.error || `HTTP ${r.status}`}`);
      } else {
        flashToast(`🎬 Render lanzado: ${v.title}`);
        load();
      }
    } catch (err) {
      flashToast(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRendering(false);
    }
  }, [grouped, rendering, flashToast, load]);

  const totalVideos = data
    ? data.counts.pending_locution + data.counts.production + data.counts.ready + data.counts.uploaded + data.counts.archived
    : 0;

  return (
    <main className="mx-auto max-w-[1600px] px-6 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/"
            className="mb-3 inline-flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-white"
          >
            <IconArrowLeft />
            Canales
          </Link>
          <h1 className="font-display text-3xl font-semibold tracking-display text-white">
            {data?.name ?? channelSlug}
          </h1>
          {data && (
            <p className="mt-2 text-sm text-zinc-400">
              <span className="nums text-zinc-200">{totalVideos}</span> vídeos
              {data.counts.pending_locution > 0 && (
                <> · <span className="nums text-zinc-200">{data.counts.pending_locution}</span> pendiente locución</>
              )}
              {' · '}<span className="nums text-zinc-200">{grouped.production.length}</span> en producción
              {grouped.render_queue.length > 0 && (
                <> · <span className="nums text-zinc-200">{grouped.render_queue.length}</span> en cola de render</>
              )}
              {' · '}<span className="nums text-zinc-200">{data.counts.ready}</span> listos
              {grouped.scheduled.length > 0 && (
                <> · <span className="nums text-zinc-200">{grouped.scheduled.length}</span> programados</>
              )}
              {' · '}<span className="nums text-zinc-200">{data.counts.uploaded}</span> subidos
              {data.counts.archived > 0 && (
                <> · <span className="nums text-zinc-200">{data.counts.archived}</span> archivados</>
              )}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowExplore(true)}
            className="btn-gold"
            title="MARIO analiza tu canal y propone ideas replicables"
          >
            <IconSpark />
            Explorar ideas
          </button>
          <button
            onClick={() => setShowBulkEnqueue(true)}
            className="btn-glass"
            title="Encolar la misma skill sobre varios vídeos en serie"
          >
            <IconList />
            Encolar lote
          </button>
          <label className="flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-white/10">
            <input
              type="checkbox"
              checked={showIdeas}
              onChange={(e) => setShowIdeas(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer rounded border-white/20 bg-white/10 accent-accent"
            />
            Ideas
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-white/10">
            <input
              type="checkbox"
              checked={showScheduled}
              onChange={(e) => setShowScheduled(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer rounded border-white/20 bg-white/10 accent-accent"
            />
            Programados
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-white/10">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer rounded border-white/20 bg-white/10 accent-accent"
            />
            Archivados
          </label>
          <button
            onClick={() => load()}
            disabled={refreshing}
            className="btn-glass disabled:opacity-50"
          >
            <IconRefresh spinning={refreshing} />
            {refreshing ? 'Actualizando' : 'Refrescar'}
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Error: {error}
        </div>
      )}

      {/* Filtros */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="glass relative flex flex-1 items-center gap-2 min-w-[220px] rounded-full px-4 py-2">
          <span className="text-zinc-500">
            <IconSearch />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none"
          />
        </div>
        <nav className="glass flex gap-0.5 rounded-full p-1">
          {(
            [
              ['all', 'Todos'],
              ['working', 'Con job'],
              ['compilation', 'Recopilaciones'],
              ['incomplete', 'Incompletos'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilterMode(k)}
              className={`rounded-full px-3 py-1 text-xs transition ${
                filterMode === k
                  ? 'bg-accent/15 text-accent shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-white'
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
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            Limpiar
          </button>
        )}
      </div>

      {toast && (
        <div className="glass-premium animate-toast-in fixed bottom-6 right-6 z-50 max-w-md rounded-2xl px-4 py-3 text-sm text-white">
          {toast}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-zinc-500">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
        </div>
      ) : (
        <section
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${visibleStates.length}, minmax(260px, 1fr))` }}
        >
          {visibleStates.map((state) => {
            if (state === 'ideas') {
              return (
                <KanbanColumn<Idea>
                  key={state}
                  state={state}
                  label={VISUAL_LABEL[state]}
                  videos={ideas}
                  emptyHint="Sin ideas — pulsa “Explorar ideas”"
                  isDragOver={dragOverState === state}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverState !== state) setDragOverState(state);
                  }}
                  onDragLeave={(e) => {
                    if (e.currentTarget === e.target) setDragOverState(null);
                  }}
                  onDrop={(e) => handleDropOnColumn(e, state)}
                  actions={
                    <>
                      {ideas.length > 0 && ideasAutoPipeline && (
                        <button
                          onClick={() => setShowStartQueue(true)}
                          title="Elige cuántas ideas meter en la cola; SARA las produce una detrás de otra"
                          className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[10px] text-accent transition hover:bg-accent/20"
                        >
                          ▶ Empezar cola
                        </button>
                      )}
                      <button
                        onClick={() => setShowExplore(true)}
                        className="rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-0.5 text-[10px] text-fuchsia-300 transition hover:bg-fuchsia-500/20"
                      >
                        + Explorar
                      </button>
                    </>
                  }
                  renderCard={(idea) => (
                    <IdeaCard
                      key={idea.id}
                      idea={idea}
                      channelSlug={channelSlug}
                      autoPipeline={ideasAutoPipeline}
                      onChanged={() => load()}
                      onToast={flashToast}
                    />
                  )}
                />
              );
            }
            return (
            <KanbanColumn<VideoCardData>
              key={state}
              state={state}
              label={VISUAL_LABEL[state]}
              videos={grouped[state]}
              isDragOver={dragOverState === state}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverState !== state) setDragOverState(state);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) setDragOverState(null);
              }}
              onDrop={(e) => handleDropOnColumn(e, state)}
              actions={
                <>
                  {state === 'production' && grouped.production.length === 0 && (
                    <button
                      onClick={() => setShowExplore(true)}
                      className="rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-0.5 text-[10px] text-fuchsia-300 transition hover:bg-fuchsia-500/20"
                      title="No tienes nada en producción — explora ideas nuevas"
                    >
                      ✨ Explorar ideas
                    </button>
                  )}
                  {state === 'uploaded' && grouped.uploaded.length > 0 && (
                    <button
                      onClick={archiveAllUploaded}
                      disabled={batchArchiving}
                      className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                    >
                      {batchArchiving ? 'Archivando…' : 'Archivar todos'}
                    </button>
                  )}
                  {state === 'scheduled' && grouped.scheduled.length > 0 && (
                    <Link
                      href="/scheduled"
                      className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] text-zinc-400 transition hover:bg-white/10 hover:text-white"
                      title="Ver todas las subidas programadas"
                    >
                      ver lista →
                    </Link>
                  )}
                  {state === 'render_queue' && grouped.render_queue.length > 0 && (
                    <button
                      onClick={renderFirstInQueue}
                      disabled={rendering}
                      className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
                      title="Renderiza el primero de la cola (LUIS). Los renders van de uno en uno."
                    >
                      {rendering ? 'Lanzando…' : '🎬 Renderizar el 1º'}
                    </button>
                  )}
                </>
              }
              renderCard={(v) => (
                <VideoCard
                  key={`${v.state}:${v.title}`}
                  video={v}
                  onArchived={handleArchived}
                  onOpen={handleOpen}
                  celebrate={celebrating.has(v.folderPath.replace(/\\/g, '/'))}
                />
              )}
            />
            );
          })}
        </section>
      )}

      {selected && <VideoDetailModal video={selected} onClose={handleCloseModal} />}

      {showBulkEnqueue && data && (
        <BulkEnqueueModal
          channelSlug={channelSlug}
          channelName={data.name}
          videos={data.videos}
          onClose={() => setShowBulkEnqueue(false)}
          onEnqueued={(count) => flashToast(`Encolados ${count} item(s) — ver /queue`)}
        />
      )}

      {showExplore && (
        <ExploreIdeasModal
          channelSlug={channelSlug}
          channelName={data?.name ?? channelSlug}
          onClose={() => setShowExplore(false)}
          onIdeasAdded={(count) => {
            flashToast(`Añadidas ${count} idea(s) a la columna Ideas`);
            load();
          }}
        />
      )}

      {showStartQueue && (
        <StartIdeasQueueModal
          channelSlug={channelSlug}
          channelName={data?.name ?? channelSlug}
          ideas={ideas}
          onClose={() => setShowStartQueue(false)}
          onStarted={(enqueued, skipped) => {
            flashToast(
              skipped > 0
                ? `Cola iniciada: ${enqueued} en cola, ${skipped} saltada(s). Ver /queue`
                : `Cola iniciada: ${enqueued} vídeo(s), uno tras otro. Ver /queue`,
            );
            load();
          }}
        />
      )}
    </main>
  );
}

/* ─────────────── KanbanColumn ─────────────── */
interface KanbanColumnProps<T> {
  state: string;
  label: string;
  videos: T[];
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  actions: React.ReactNode;
  renderCard: (v: T) => React.ReactNode;
  /** Texto del estado vacío (default "vacío"). */
  emptyHint?: string;
}

function KanbanColumn<T>({
  state,
  label,
  videos,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  actions,
  renderCard,
  emptyHint = 'vacío',
}: KanbanColumnProps<T>) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`glass flex min-h-[200px] flex-col rounded-[28px] p-4 transition ${
        isDragOver ? 'border-accent/60 ring-2 ring-accent/30' : ''
      }`}
    >
      <header className="mb-3 flex items-center justify-between gap-2 px-1">
        <h2 className="text-[11px] font-medium uppercase tracking-label text-zinc-500">
          {label}
        </h2>
        <div className="flex items-center gap-2">
          {actions}
          <span className="nums rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-400">
            {videos.length}
          </span>
        </div>
      </header>
      <div
        className="flex flex-col gap-3 overflow-y-auto pr-1"
        style={{ maxHeight: 'calc(100vh - 240px)' }}
      >
        {videos.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 px-3 py-6 text-center text-xs text-zinc-600">
            {emptyHint}
          </p>
        ) : (
          videos.map(renderCard)
        )}
      </div>
    </div>
  );
}

/* ─────────────── SF Symbols-style icons ─────────────── */
function IconArrowLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
function IconList() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6.5l1.5 1.5L8.5 5M4 12.5l1.5 1.5L8.5 11M4 18.5l1.5 1.5L8.5 17M13 7h7M13 13h7M13 19h7" />
    </svg>
  );
}
function IconSpark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4L12 3zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14z" />
    </svg>
  );
}
function IconRefresh({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={spinning ? 'animate-spin' : ''}
    >
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15" />
    </svg>
  );
}
