'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MonthGrid } from '@/components/calendar/MonthGrid';
import { CHANNELS, getChannel } from '@/lib/channels';
import {
  CALENDAR_STATUS_STYLE,
  type CalendarItem,
  type CalendarDragPayload,
} from '@/lib/calendar-types';

/**
 * Calendario de contenidos — vista editorial de pájaro.
 *
 * Fase 1 (MVP): vista MES de las subidas (scheduled-uploads.json).
 * Fase 2 (plan editorial): items planificados (content-calendar.json) +
 *   - "+" en un día para planificar a mano,
 *   - arrastrar una IDEA del backlog a un día → queda planificada,
 *   - arrastrar un VÍDEO LISTO a un día → /upload con la fecha puesta (publishAt),
 *   - arrastrar un planificado entre días → cambia su fecha.
 * Fase 3 (integración pipeline): cadencia objetivo por canal + huecos +
 *   "Arrancar pipeline" desde un planificado (reusa lib/idea-pipeline.ts).
 */

const REFRESH_MS = 30_000;
const ENABLED_CHANNELS = CHANNELS.filter((c) => c.enabled);
const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function monthLabel(date: Date): string {
  return capitalize(date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }));
}
function fmtFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    capitalize(d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })) +
    ' · ' +
    d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  );
}
function fmtWeek(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return 'semana del ' + d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
function fmtDayShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return capitalize(d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }));
}
/** ISO de un día del mes visible, a una hora dada (local). */
function dayToIso(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month, day, hour, 0, 0).toISOString();
}
/** ISO → value de <input type="datetime-local"> (zona local). */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface BacklogIdea { id: string; title: string; channelId: string | null; status: string }
interface BacklogVideo { channel: string; channelName: string; channelColor: string; title: string; folderPath: string }
interface ModalState { day: number; dateLocal: string; title: string; channel: string; ideaId?: string }

interface GapDay { date: string; channel: string; channelName: string; channelColor: string }
interface GapWeek {
  channel: string; channelName: string; channelColor: string;
  weekStart: string; target: number; scheduled: number; missing: number; gapDays: GapDay[];
}
interface CadenceCfg { channel: string; enabled: boolean; targetPerWeek: number; preferredWeekdays?: number[]; hour?: number }
interface CadenceChannel { slug: string; name: string; color: string; autoPipeline: boolean; cadence: CadenceCfg | null }

export default function CalendarPage() {
  const router = useRouter();
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [ideas, setIdeas] = useState<BacklogIdea[]>([]);
  const [readyVideos, setReadyVideos] = useState<BacklogVideo[]>([]);
  const [gaps, setGaps] = useState<GapWeek[]>([]);
  const [cadenceChannels, setCadenceChannels] = useState<CadenceChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [channelFilter, setChannelFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [showPlanner, setShowPlanner] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const loadItems = useCallback(() => {
    fetch('/api/calendar', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.ok) setItems(d.items ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadBacklog = useCallback(() => {
    fetch('/api/calendar/backlog', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.ok) { setIdeas(d.ideas ?? []); setReadyVideos(d.readyVideos ?? []); } })
      .catch(() => {});
  }, []);

  const loadGaps = useCallback(() => {
    fetch('/api/calendar/gaps?weeks=4', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.ok) setGaps(d.gaps ?? []); })
      .catch(() => {});
  }, []);

  const loadCadence = useCallback(() => {
    fetch('/api/calendar/cadence', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.ok) setCadenceChannels(d.channels ?? []); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadItems();
    loadBacklog();
    loadGaps();
    loadCadence();
    const id = setInterval(() => { loadItems(); loadGaps(); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [loadItems, loadBacklog, loadGaps, loadCadence]);

  const channelsPresent = useMemo(() => {
    const map = new Map<string, { slug: string; name: string; color: string }>();
    for (const it of items) {
      if (!map.has(it.channel)) map.set(it.channel, { slug: it.channel, name: it.channelName, color: it.channelColor });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const filtered = useMemo(
    () => (channelFilter ? items.filter((i) => i.channel === channelFilter) : items),
    [items, channelFilter],
  );

  const monthCount = useMemo(
    () => filtered.filter((i) => {
      const d = new Date(i.date);
      return !Number.isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month;
    }).length,
    [filtered, year, month],
  );

  // Huecos visibles: filtrados por canal seleccionado, solo con déficit.
  const visibleGaps = useMemo(
    () => gaps.filter((g) => g.missing > 0 && (!channelFilter || g.channel === channelFilter)),
    [gaps, channelFilter],
  );
  const totalMissing = useMemo(() => visibleGaps.reduce((s, g) => s + g.missing, 0), [visibleGaps]);

  const goPrev = () => setCurrentDate(new Date(year, month - 1, 1));
  const goNext = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  // ── Acciones ──────────────────────────────────────────────────────────────
  const createPlanned = useCallback(async (body: { channel: string; date: string; title: string; ideaId?: string }) => {
    await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
    loadItems();
    loadGaps();
  }, [loadItems, loadGaps]);

  const movePlanned = useCallback(async (plannedId: string, date: string) => {
    await fetch(`/api/calendar/${plannedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    }).catch(() => {});
    loadItems();
    loadGaps();
  }, [loadItems, loadGaps]);

  const deletePlanned = useCallback(async (plannedId: string) => {
    await fetch(`/api/calendar/${plannedId}`, { method: 'DELETE' }).catch(() => {});
    setSelected(null);
    loadItems();
    loadGaps();
  }, [loadItems, loadGaps]);

  const startPipeline = useCallback(async (plannedId: string, title: string) => {
    if (!window.confirm(`¿Arrancar la producción de "${title}"? Se creará la carpeta del vídeo y se encolará a SARA.`)) return;
    setBusyId(plannedId);
    try {
      const r = await fetch(`/api/calendar/${plannedId}/start-pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'queue' }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) setNotice(d.error || `Error HTTP ${r.status}`);
      else { setNotice('Producción encolada. SARA la procesará en la cola.'); setSelected(null); }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
    setBusyId(null);
    loadItems();
  }, [loadItems]);

  const saveCadence = useCallback(async (patch: CadenceCfg) => {
    await fetch('/api/calendar/cadence', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => {});
    loadCadence();
    loadGaps();
  }, [loadCadence, loadGaps]);

  const onDropOnDay = useCallback((day: number, payload: CalendarDragPayload) => {
    const iso = dayToIso(year, month, day);
    if (payload.kind === 'planned') {
      movePlanned(payload.plannedId, iso);
    } else if (payload.kind === 'video') {
      router.push(
        `/upload?channel=${encodeURIComponent(payload.channel)}&video=${encodeURIComponent(payload.title)}&date=${encodeURIComponent(iso)}`,
      );
    } else if (payload.kind === 'idea') {
      const ch = payload.channel || channelFilter;
      if (ch) createPlanned({ channel: ch, date: iso, title: payload.title, ideaId: payload.ideaId });
      else setModal({ day, dateLocal: isoToLocalInput(iso), title: payload.title, channel: ENABLED_CHANNELS[0]?.slug ?? '', ideaId: payload.ideaId });
    }
  }, [year, month, channelFilter, movePlanned, createPlanned, router]);

  const openAddModal = useCallback((day: number) => {
    setModal({
      day,
      dateLocal: isoToLocalInput(dayToIso(year, month, day)),
      title: '',
      channel: channelFilter ?? ENABLED_CHANNELS[0]?.slug ?? '',
    });
  }, [year, month, channelFilter]);

  /** Planificar directamente en un día-hueco sugerido. */
  const planGapDay = useCallback((g: GapDay) => {
    setModal({ day: new Date(g.date).getDate(), dateLocal: isoToLocalInput(g.date), title: '', channel: g.channel });
  }, []);

  const submitModal = useCallback(async () => {
    if (!modal || !modal.title.trim() || !modal.channel) return;
    await createPlanned({
      channel: modal.channel,
      date: new Date(modal.dateLocal).toISOString(),
      title: modal.title.trim(),
      ideaId: modal.ideaId,
    });
    setModal(null);
  }, [modal, createPlanned]);

  function dragStart(e: React.DragEvent, payload: CalendarDragPayload) {
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = payload.kind === 'planned' ? 'move' : 'copy';
  }

  return (
    <main className="mx-auto max-w-[1500px] px-8 pb-12 pt-2">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-display text-white">Calendario de contenidos</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Vista editorial de todo lo programado y planificado. Arrastra una idea o un vídeo listo a un día,
            o pulsa <span className="text-zinc-200">+</span> en un día para planificar a mano.
          </p>
        </div>
        <button
          onClick={() => setShowPlanner((v) => !v)}
          className="glass glass-hover flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm text-zinc-300"
        >
          Cadencia y huecos
          {totalMissing > 0 && (
            <span className="rounded-full bg-amber-500/20 px-1.5 text-[10px] font-medium text-amber-300">{totalMissing}</span>
          )}
        </button>
      </div>

      {notice && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-zinc-500 hover:text-white">✕</button>
        </div>
      )}

      {/* Panel de cadencia + huecos (colapsable) */}
      {showPlanner && (
        <CadencePanel
          channels={cadenceChannels}
          gaps={visibleGaps}
          onSave={saveCadence}
          onPlanGapDay={planGapDay}
        />
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={goPrev} className="glass glass-hover rounded-xl px-3 py-1.5 text-sm text-zinc-300" title="Mes anterior">←</button>
          <button onClick={goToday} className="glass glass-hover rounded-xl px-3 py-1.5 text-sm text-zinc-300">Hoy</button>
          <button onClick={goNext} className="glass glass-hover rounded-xl px-3 py-1.5 text-sm text-zinc-300" title="Mes siguiente">→</button>
          <h2 className="ml-2 font-display text-lg font-semibold tracking-display text-white">{monthLabel(currentDate)}</h2>
          <span className="ml-1 text-xs text-zinc-500">
            <span className="nums">{monthCount}</span> {monthCount === 1 ? 'entrada' : 'entradas'}
          </span>
        </div>

        {channelsPresent.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip label="Todos" active={channelFilter === null} onClick={() => setChannelFilter(null)} />
            {channelsPresent.map((c) => (
              <FilterChip
                key={c.slug}
                label={c.name}
                color={c.color}
                active={channelFilter === c.slug}
                onClick={() => setChannelFilter(channelFilter === c.slug ? null : c.slug)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Calendario */}
        <div className="glass min-w-0 flex-1 rounded-[28px] p-5">
          {loading ? (
            <p className="py-12 text-center text-sm text-zinc-500">Cargando…</p>
          ) : (
            <MonthGrid
              year={year}
              month={month}
              items={filtered}
              onItemClick={setSelected}
              onDropOnDay={onDropOnDay}
              onAddToDay={openAddModal}
            />
          )}
        </div>

        {/* Backlog arrastrable */}
        <aside className="glass w-full shrink-0 rounded-[28px] p-4 lg:w-[280px]">
          <h3 className="mb-1 text-[11px] font-medium uppercase tracking-label text-zinc-500">Backlog</h3>
          <p className="mb-3 text-[11px] text-zinc-500">Arrastra al calendario →</p>

          <div className="mb-2 text-[11px] font-medium text-zinc-400">Ideas ({ideas.length})</div>
          <div className="mb-4 max-h-[220px] space-y-1.5 overflow-auto pr-1">
            {ideas.length === 0 ? (
              <p className="text-[11px] text-zinc-600">No hay ideas en el banco.</p>
            ) : (
              ideas.map((idea) => {
                const slug = idea.channelId && getChannel(idea.channelId) ? idea.channelId : null;
                return (
                  <div
                    key={idea.id}
                    draggable
                    onDragStart={(e) => dragStart(e, { kind: 'idea', ideaId: idea.id, title: idea.title, channel: slug })}
                    className="cursor-grab rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-zinc-200 transition hover:border-white/20 active:cursor-grabbing"
                    title={idea.title}
                  >
                    <span className="line-clamp-2">{idea.title}</span>
                    {slug && <span className="mt-0.5 block text-[9px] text-zinc-500">{getChannel(slug)?.name}</span>}
                  </div>
                );
              })
            )}
          </div>

          <div className="mb-2 text-[11px] font-medium text-zinc-400">Vídeos listos ({readyVideos.length})</div>
          <div className="max-h-[220px] space-y-1.5 overflow-auto pr-1">
            {readyVideos.length === 0 ? (
              <p className="text-[11px] text-zinc-600">Sin vídeos listos para programar.</p>
            ) : (
              readyVideos.map((v) => (
                <div
                  key={v.folderPath}
                  draggable
                  onDragStart={(e) => dragStart(e, { kind: 'video', channel: v.channel, title: v.title, videoFolder: v.folderPath })}
                  className="cursor-grab rounded-lg border px-2.5 py-1.5 text-[11px] text-zinc-200 transition hover:brightness-125 active:cursor-grabbing"
                  style={{ backgroundColor: v.channelColor + '14', borderColor: v.channelColor + '40', borderLeft: `2px solid ${v.channelColor}` }}
                  title={`${v.channelName} · ${v.title}`}
                >
                  <span className="line-clamp-2">{v.title}</span>
                  <span className="mt-0.5 block text-[9px] text-zinc-500">{v.channelName}</span>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>

      {selected && (
        <DetailPanel
          item={selected}
          busy={busyId === selected.plannedId}
          onClose={() => setSelected(null)}
          onDelete={deletePlanned}
          onStartPipeline={startPipeline}
        />
      )}

      {modal && (
        <PlanModal
          modal={modal}
          onChange={setModal}
          onClose={() => setModal(null)}
          onSubmit={submitModal}
        />
      )}
    </main>
  );
}

/* ─────────────── Filtro / leyenda ─────────────── */
function FilterChip({ label, color, active, onClick }: { label: string; color?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
        active ? 'border-white/20 bg-white/10 text-white' : 'border-white/8 bg-white/[0.03] text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {label}
    </button>
  );
}

/* ─────────────── Panel de cadencia + huecos ─────────────── */
function CadencePanel({
  channels,
  gaps,
  onSave,
  onPlanGapDay,
}: {
  channels: CadenceChannel[];
  gaps: GapWeek[];
  onSave: (patch: CadenceCfg) => void;
  onPlanGapDay: (g: GapDay) => void;
}) {
  return (
    <div className="glass mb-4 rounded-[28px] p-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Editor de cadencia */}
        <div>
          <h3 className="mb-3 text-[11px] font-medium uppercase tracking-label text-zinc-500">Cadencia objetivo por canal</h3>
          <div className="space-y-2.5">
            {channels.map((c) => (
              <CadenceRow key={c.slug} ch={c} onSave={onSave} />
            ))}
          </div>
        </div>

        {/* Huecos */}
        <div>
          <h3 className="mb-3 text-[11px] font-medium uppercase tracking-label text-zinc-500">
            Próximos huecos {gaps.length === 0 && <span className="text-zinc-600">· al día ✓</span>}
          </h3>
          {gaps.length === 0 ? (
            <p className="text-xs text-zinc-500">
              No hay déficit en las próximas semanas (o no has fijado cadencia todavía).
            </p>
          ) : (
            <div className="space-y-2">
              {gaps.map((g) => (
                <div key={`${g.channel}-${g.weekStart}`} className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 text-zinc-200">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.channelColor }} />
                      {g.channelName}
                    </span>
                    <span className="text-amber-300">
                      faltan <span className="nums font-semibold">{g.missing}</span> · {fmtWeek(g.weekStart)}
                    </span>
                  </div>
                  {g.gapDays.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {g.gapDays.map((d) => (
                        <button
                          key={d.date}
                          onClick={() => onPlanGapDay(d)}
                          className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-300 transition hover:border-white/25 hover:text-white"
                          title="Planificar en este día"
                        >
                          + {fmtDayShort(d.date)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CadenceRow({ ch, onSave }: { ch: CadenceChannel; onSave: (patch: CadenceCfg) => void }) {
  const [target, setTarget] = useState<number>(ch.cadence?.targetPerWeek ?? 0);
  const [weekdays, setWeekdays] = useState<number[]>(ch.cadence?.preferredWeekdays ?? []);
  const [enabled, setEnabled] = useState<boolean>(ch.cadence?.enabled ?? true);
  const dirty =
    target !== (ch.cadence?.targetPerWeek ?? 0) ||
    enabled !== (ch.cadence?.enabled ?? true) ||
    JSON.stringify(weekdays) !== JSON.stringify(ch.cadence?.preferredWeekdays ?? []);

  const toggleDay = (d: number) =>
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-200">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ch.color }} />
          {ch.name}
        </span>
        <label className="flex items-center gap-1.5 text-[10px] text-zinc-400">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          activa
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          <span>/sem</span>
          <input
            type="number"
            min={0}
            max={14}
            value={target}
            onChange={(e) => setTarget(Math.max(0, Math.min(14, Number(e.target.value) || 0)))}
            className="w-14 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white focus:border-accent/60 focus:outline-none"
          />
        </label>
        <div className="flex gap-0.5">
          {WEEKDAY_LABELS.map((lbl, d) => (
            <button
              key={d}
              onClick={() => toggleDay(d)}
              className={`h-6 w-6 rounded-md text-[10px] font-medium transition ${
                weekdays.includes(d)
                  ? 'bg-[color:var(--accent)]/20 text-accent'
                  : 'bg-white/5 text-zinc-500 hover:text-zinc-300'
              }`}
              title={`Día preferido: ${lbl}`}
            >
              {lbl}
            </button>
          ))}
        </div>
        <button
          onClick={() => onSave({ channel: ch.slug, enabled, targetPerWeek: target, preferredWeekdays: weekdays })}
          disabled={!dirty}
          className="ml-auto rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] text-accent transition hover:bg-accent/20 disabled:opacity-40"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}

/* ─────────────── Panel de detalle ─────────────── */
function DetailPanel({
  item,
  busy,
  onClose,
  onDelete,
  onStartPipeline,
}: {
  item: CalendarItem;
  busy: boolean;
  onClose: () => void;
  onDelete: (plannedId: string) => void;
  onStartPipeline: (plannedId: string, title: string) => void;
}) {
  const st = CALENDAR_STATUS_STYLE[item.status];
  const channel = getChannel(item.channel);
  const canStart = item.source === 'planned' && item.status === 'planned' && !!channel?.autoPipeline && !!item.plannedId;
  return (
    <div className="glass mt-4 rounded-[28px] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.channelColor }} />
            <span className="text-xs font-medium text-zinc-400">{item.channelName}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
            {item.source === 'planned' && (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">plan editorial</span>
            )}
            {item.nativeSchedule && (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">programado en YouTube</span>
            )}
          </div>
          <h3 className="truncate font-display text-lg font-semibold tracking-display text-white" title={item.title}>{item.title}</h3>
          <p className="mt-1 text-sm text-zinc-400">{fmtFull(item.date)}</p>
          {item.videoFolder && (
            <p className="mt-2 truncate font-mono text-[11px] text-zinc-500" title={item.videoFolder}>{item.videoFolder}</p>
          )}
          {item.status === 'done' && item.youtubeVideoId && (
            <a href={`https://youtu.be/${item.youtubeVideoId}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-accent hover:underline">
              Ver en YouTube ↗
            </a>
          )}
          {(canStart || (item.source === 'planned' && item.plannedId)) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {canStart && (
                <button
                  onClick={() => onStartPipeline(item.plannedId!, item.title)}
                  disabled={busy}
                  className="btn-gold text-xs disabled:opacity-50"
                >
                  {busy ? 'Arrancando…' : '▶ Arrancar pipeline'}
                </button>
              )}
              {item.source === 'planned' && item.plannedId && (
                <button
                  onClick={() => onDelete(item.plannedId!)}
                  className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-[11px] text-red-300 transition hover:bg-red-500/20"
                >
                  Quitar del plan
                </button>
              )}
            </div>
          )}
          {item.source === 'planned' && item.status === 'planned' && !channel?.autoPipeline && (
            <p className="mt-2 text-[10px] text-zinc-500">
              El pipeline automático no está habilitado para este canal — planifícalo y prodúcelo a mano.
            </p>
          )}
        </div>
        <button onClick={onClose} className="shrink-0 text-zinc-500 hover:text-white" title="Cerrar">✕</button>
      </div>
    </div>
  );
}

/* ─────────────── Modal planificar ─────────────── */
function PlanModal({
  modal,
  onChange,
  onClose,
  onSubmit,
}: {
  modal: ModalState;
  onChange: (m: ModalState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-premium w-full max-w-md rounded-[28px] p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 font-display text-lg font-semibold tracking-display text-white">Planificar contenido</h3>
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-label text-zinc-500">Canal</label>
        <select
          value={modal.channel}
          onChange={(e) => onChange({ ...modal, channel: e.target.value })}
          className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-accent/60 focus:outline-none"
        >
          {ENABLED_CHANNELS.map((c) => (
            <option key={c.slug} value={c.slug} className="bg-zinc-900">{c.name}</option>
          ))}
        </select>

        <label className="mb-1 block text-[11px] font-medium uppercase tracking-label text-zinc-500">Título</label>
        <input
          type="text"
          value={modal.title}
          autoFocus
          onChange={(e) => onChange({ ...modal, title: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
          placeholder="Tema o título de trabajo…"
          className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-accent/60 focus:outline-none"
        />

        <label className="mb-1 block text-[11px] font-medium uppercase tracking-label text-zinc-500">Fecha</label>
        <input
          type="datetime-local"
          value={modal.dateLocal}
          onChange={(e) => onChange({ ...modal, dateLocal: e.target.value })}
          className="mb-5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-accent/60 focus:outline-none"
        />

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-glass text-sm">Cancelar</button>
          <button onClick={onSubmit} disabled={!modal.title.trim() || !modal.channel} className="btn-gold text-sm disabled:opacity-50">
            Planificar
          </button>
        </div>
      </div>
    </div>
  );
}
