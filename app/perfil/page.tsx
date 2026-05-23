'use client';

import { useEffect, useState } from 'react';
import { fetchStats } from '@/lib/gamification-client';
import {
  ACHIEVEMENTS,
  XP_BY_EVENT,
  deriveLevel,
  titleForLevel,
  type Stats,
  type XPEventKind,
} from '@/lib/gamification-types';

const EVENT_ICON: Record<XPEventKind, string> = {
  job_done: '⚙️',
  job_approved: '👍',
  job_rejected: '👎',
  video_uploaded: '📤',
  video_ready: '📦',
  thumbnail_added: '🖼️',
  checklist_resolved: '✅',
  streak_day: '🔥',
};

const EVENT_LABEL: Record<XPEventKind, string> = {
  job_done: 'Job completado',
  job_approved: 'Aprobaste un resultado',
  job_rejected: 'Rechazaste un resultado',
  video_uploaded: 'Vídeo movido a _SUBIDOS',
  video_ready: 'Vídeo movido a _LISTOS',
  thumbnail_added: 'Miniatura añadida',
  checklist_resolved: 'Checklist resuelto',
  streak_day: 'Día de racha mantenido',
};

export default function PerfilPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const s = await fetchStats();
      if (!cancelled) {
        setStats(s);
        setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (loading) {
    return (
      <main className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
      </main>
    );
  }

  if (!stats) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12 text-sm text-muted">
        No se pudo cargar las stats.
      </main>
    );
  }

  const lv = deriveLevel(stats.xp);
  const title = titleForLevel(lv.level);
  const unlockedIds = new Set(stats.achievements.map((a) => a.id));

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Perfil</h1>
          <p className="mt-1 text-sm text-muted">
            Tu progreso en el pipeline. Cada job, cada vídeo subido, cada racha cuenta.
          </p>
        </div>
      </header>

      {/* Nivel + barra XP */}
      <section className="mb-6 rounded-xl border border-border bg-panel p-6">
        <div className="flex flex-wrap items-center gap-6">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-400/60 to-amber-700/40 text-3xl font-bold text-amber-100 shadow-inner">
            {lv.level}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            <p className="text-sm text-muted">
              Nivel {lv.level} · {lv.intoLevel.toLocaleString('es-ES')}/{lv.needed.toLocaleString('es-ES')} XP al nivel {lv.level + 1}
            </p>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-amber-200 transition-all"
                style={{ width: `${lv.percent}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-zinc-500">
              {stats.xp.toLocaleString('es-ES')} XP totales acumuladas
            </p>
          </div>
          {stats.streak.current > 0 && (
            <div className="flex flex-col items-center rounded-xl border border-orange-500/30 bg-orange-500/5 px-4 py-3">
              <span className="text-3xl">🔥</span>
              <span className="text-2xl font-bold text-orange-300">{stats.streak.current}</span>
              <span className="text-[10px] uppercase tracking-wider text-orange-300/70">
                días seguidos
              </span>
              {stats.streak.longest > stats.streak.current && (
                <span className="mt-1 text-[10px] text-muted">récord: {stats.streak.longest}</span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Contadores */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CounterCard label="Jobs completados" value={stats.counters.jobs_done} icon="⚙️" />
        <CounterCard label="Aprobaciones" value={stats.counters.jobs_approved} icon="👍" />
        <CounterCard label="Vídeos subidos" value={stats.counters.videos_uploaded} icon="📤" />
        <CounterCard label="Miniaturas hechas" value={stats.counters.thumbnails_added} icon="🖼️" />
        <CounterCard label="Vídeos listos" value={stats.counters.videos_ready} icon="📦" />
        <CounterCard label="Checklist resueltos" value={stats.counters.checklist_resolved} icon="✅" />
        <CounterCard label="Rechazos" value={stats.counters.jobs_rejected} icon="👎" />
        <CounterCard label="Total acciones" value={Object.values(stats.counters).reduce((s, v) => s + v, 0)} icon="📊" />
      </section>

      {/* Logros */}
      <section className="mb-6">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
          Logros · {stats.achievements.length}/{ACHIEVEMENTS.length}
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ACHIEVEMENTS.map((ach) => {
            const unlocked = unlockedIds.has(ach.id);
            return (
              <div
                key={ach.id}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${
                  unlocked
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-border bg-bg/40 opacity-60'
                }`}
              >
                <span className={`text-2xl ${unlocked ? '' : 'grayscale'}`}>{ach.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${unlocked ? 'text-white' : 'text-muted'}`}>
                    {ach.title}
                  </p>
                  <p className="text-[11px] text-muted">{ach.description}</p>
                  <p className="text-[10px] text-amber-300/70">+{ach.xpReward} XP</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tabla XP por acción */}
      <section className="mb-6">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
          XP por acción
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(XP_BY_EVENT) as XPEventKind[]).map((k) => (
            <div
              key={k}
              className="flex items-center gap-2 rounded border border-border bg-bg/40 px-2 py-1 text-xs"
            >
              <span>{EVENT_ICON[k]}</span>
              <span className="flex-1 truncate text-muted">{EVENT_LABEL[k]}</span>
              <span className="font-mono text-amber-300/80">+{XP_BY_EVENT[k]}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Actividad reciente */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
          Actividad reciente
        </h3>
        {stats.events.length === 0 ? (
          <p className="rounded border border-dashed border-border px-4 py-6 text-center text-xs text-muted">
            Sin eventos todavía. Ejecuta una skill o sube un vídeo y empezará a llenarse.
          </p>
        ) : (
          <ul className="space-y-1">
            {stats.events.slice(0, 40).map((ev, idx) => (
              <li
                key={idx}
                className="flex items-center gap-2 rounded border border-border bg-bg/40 px-3 py-1.5 text-xs"
              >
                <span>{EVENT_ICON[ev.kind]}</span>
                <span className="flex-1 truncate text-zinc-300">
                  {EVENT_LABEL[ev.kind]}
                  {ev.label && <span className="ml-2 text-muted">· {ev.label}</span>}
                </span>
                {ev.xp > 0 && <span className="font-mono text-amber-300/80">+{ev.xp}</span>}
                <span className="text-[10px] text-zinc-500">
                  {new Date(ev.at).toLocaleString('es-ES', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function CounterCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="rounded-lg border border-border bg-panel px-3 py-3">
      <p className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <span>{icon}</span>
      </p>
      <p className="mt-1 text-2xl font-bold text-white">{value.toLocaleString('es-ES')}</p>
    </div>
  );
}
