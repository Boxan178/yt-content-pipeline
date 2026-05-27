'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { fetchStats } from '@/lib/gamification-client';
import {
  ACHIEVEMENTS,
  JEDI_RANKS,
  XP_BY_EVENT,
  deriveLevel,
  rankInfoForLevel,
  titleForLevel,
  xpForLevel,
  type Stats,
  type XPEventKind,
} from '@/lib/gamification-types';

/**
 * Perfil — Templo Jedi. Refresh visual 2026-05-27 (Liquid Glass).
 *
 * Estructura:
 *  1. Hero con nivel/título/XP + flame de racha
 *  2. KPI tiles (4 + 4) coherentes con home dashboard
 *  3. Camino del Templo Jedi — todos los rangos como cards
 *  4. Logros — grid de cards con borde gold cuando unlocked
 *  5. XP por acción — chips compactos
 *  6. Actividad reciente — list rows glass
 *
 * Los iconos de ACHIEVEMENTS[].icon son emojis del data layer
 * (identidad de logro), por lo que se mantienen tal cual. El resto
 * de iconos UI son SVG line monocromos.
 */

const EVENT_ICON: Record<XPEventKind, ReactNode> = {
  job_done: <IconCog />,
  job_approved: <IconCheck />,
  job_rejected: <IconX />,
  video_uploaded: <IconUpload />,
  video_ready: <IconPackage />,
  thumbnail_added: <IconImage />,
  checklist_resolved: <IconCheckSquare />,
  streak_day: <IconFlame />,
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
      <main className="mx-auto max-w-3xl px-8 py-12 text-sm text-zinc-400">
        No se pudo cargar las stats.
      </main>
    );
  }

  const lv = deriveLevel(stats.xp);
  const title = titleForLevel(lv.level);
  const { current: currentRank, next: nextRank } = rankInfoForLevel(lv.level);
  const unlockedIds = new Set(stats.achievements.map((a) => a.id));
  const totalActions = Object.values(stats.counters).reduce((s, v) => s + v, 0);

  return (
    <main className="mx-auto max-w-6xl px-8 pb-12 pt-2">
      <header className="mb-8 flex items-start gap-3">
        <span className="text-accent opacity-80 mt-1">
          <IconAward />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-display text-white mb-2">
            Templo Jedi
          </h1>
          <p className="text-sm text-zinc-400">
            Tu progreso en el pipeline. Cada job, cada vídeo subido, cada racha cuenta.
          </p>
        </div>
      </header>

      {/* ─── Hero: nivel + XP + racha ─── */}
      <section className="glass mb-8 rounded-[28px] p-6">
        <div className="flex flex-wrap items-center gap-6">
          <div className="avatar-glow grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-accent/40 to-accent/10 font-display text-3xl font-bold text-accent">
            {lv.level}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-semibold tracking-display text-white">
              {title}
            </h2>
            <p className="text-[11px] font-medium uppercase tracking-label text-accent/70">
              {currentRank.titleEn}
            </p>
            <p className="nums mt-1 text-sm text-zinc-400">
              Nivel <span className="text-zinc-200">{lv.level}</span> ·{' '}
              <span className="text-zinc-200">{lv.intoLevel.toLocaleString('es-ES')}</span>/
              {lv.needed.toLocaleString('es-ES')} XP al nivel {lv.level + 1}
            </p>
            <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-white/8">
              <div
                className="xp-fill h-full transition-all duration-700 ease-out"
                style={{ width: `${lv.percent}%` }}
              />
            </div>
            <p className="nums mt-1.5 text-[10px] text-zinc-500">
              {stats.xp.toLocaleString('es-ES')} XP totales acumuladas
              {nextRank && (
                <>
                  {' · '}Próximo rango:{' '}
                  <span className="text-accent">{nextRank.title}</span> (nivel {nextRank.minLevel})
                </>
              )}
            </p>
          </div>
          {stats.streak.current > 0 && (
            <div className="flex flex-col items-center rounded-2xl border border-orange-500/30 bg-orange-500/5 px-4 py-3 shrink-0">
              <span className="text-orange-300" style={{ filter: 'drop-shadow(0 0 6px rgba(251,146,60,0.55))' }}>
                <IconFlameLarge />
              </span>
              <span className="nums font-display text-2xl font-bold text-orange-300">
                {stats.streak.current}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-label text-orange-300/70">
                días seguidos
              </span>
              {stats.streak.longest > stats.streak.current && (
                <span className="nums mt-1 text-[10px] text-zinc-500">
                  récord: {stats.streak.longest}
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ─── KPI tiles ─── */}
      <section className="mb-10">
        <h2 className="mb-4 text-[11px] font-medium uppercase tracking-label text-zinc-500">
          Contadores
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiTile label="Jobs completados" value={stats.counters.jobs_done} icon={<IconCog />} />
          <KpiTile label="Aprobaciones" value={stats.counters.jobs_approved} icon={<IconCheck />} accent />
          <KpiTile label="Vídeos subidos" value={stats.counters.videos_uploaded} icon={<IconUpload />} />
          <KpiTile label="Miniaturas" value={stats.counters.thumbnails_added} icon={<IconImage />} />
          <KpiTile label="Vídeos listos" value={stats.counters.videos_ready} icon={<IconPackage />} />
          <KpiTile label="Checklist resueltos" value={stats.counters.checklist_resolved} icon={<IconCheckSquare />} />
          <KpiTile label="Rechazos" value={stats.counters.jobs_rejected} icon={<IconX />} />
          <KpiTile label="Total acciones" value={totalActions} icon={<IconChart />} />
        </div>
      </section>

      {/* ─── Camino del Templo Jedi ─── */}
      <section className="mb-10">
        <h2 className="mb-4 text-[11px] font-medium uppercase tracking-label text-zinc-500">
          Camino del Templo Jedi
        </h2>
        <div className="space-y-2.5">
          {JEDI_RANKS.map((rank) => {
            const reached = lv.level >= rank.minLevel;
            const isCurrent = rank.minLevel === currentRank.minLevel;
            return (
              <div
                key={rank.titleEn}
                className={`flex items-start gap-3 rounded-3xl p-4 transition ${
                  isCurrent
                    ? 'glass border border-accent/40 shadow-[0_0_24px_-6px_rgba(201,169,106,0.35)]'
                    : reached
                    ? 'glass border border-green-500/25'
                    : 'glass opacity-50'
                }`}
              >
                <span
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl font-display text-base font-bold ${
                    isCurrent
                      ? 'bg-accent/25 text-accent border border-accent/50'
                      : reached
                      ? 'bg-green-500/15 text-green-300 border border-green-500/30'
                      : 'bg-white/5 text-zinc-500 border border-white/10'
                  }`}
                  title={`Requiere nivel ${rank.minLevel} (~${xpForLevel(rank.minLevel).toLocaleString('es-ES')} XP)`}
                >
                  {rank.minLevel}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span
                      className={`font-display text-sm font-semibold tracking-display ${
                        isCurrent ? 'text-accent' : reached ? 'text-white' : 'text-zinc-400'
                      }`}
                    >
                      {rank.title}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-label text-accent/60">
                      {rank.titleEn}
                    </span>
                    {isCurrent && (
                      <span className="pill-active rounded-full px-2 py-0.5 text-[9px] font-semibold">
                        tú estás aquí
                      </span>
                    )}
                    {!reached && (
                      <span className="pill-soon rounded-full px-2 py-0.5 text-[9px] font-medium">
                        bloqueado
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">{rank.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Logros ─── */}
      <section className="mb-10">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-label text-zinc-500">
            Logros
          </h2>
          <p className="nums text-xs text-zinc-500">
            <span className="text-accent">{stats.achievements.length}</span> / {ACHIEVEMENTS.length}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ACHIEVEMENTS.map((ach) => {
            const unlocked = unlockedIds.has(ach.id);
            return (
              <div
                key={ach.id}
                className={`glass flex items-start gap-3 rounded-3xl p-4 ${
                  unlocked
                    ? 'border border-accent/30 shadow-[0_0_24px_-8px_rgba(201,169,106,0.35)]'
                    : 'opacity-55'
                }`}
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-2xl ${
                    unlocked
                      ? 'bg-accent/15 border border-accent/30'
                      : 'bg-white/5 border border-white/10 grayscale'
                  }`}
                >
                  {ach.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p
                      className={`text-sm font-medium ${
                        unlocked ? 'text-white' : 'text-zinc-400'
                      }`}
                    >
                      {ach.title}
                    </p>
                    {unlocked ? (
                      <span className="pill-active rounded-full px-1.5 py-0 text-[9px] font-medium">
                        unlocked
                      </span>
                    ) : (
                      <span className="pill-soon rounded-full px-1.5 py-0 text-[9px] font-medium">
                        locked
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">
                    {ach.description}
                  </p>
                  <p className="nums mt-1 text-[10px] font-medium text-accent">+{ach.xpReward} XP</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── XP por acción ─── */}
      <section className="mb-10">
        <h2 className="mb-4 text-[11px] font-medium uppercase tracking-label text-zinc-500">
          XP por acción
        </h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {(Object.keys(XP_BY_EVENT) as XPEventKind[]).map((k) => (
            <div
              key={k}
              className="glass flex items-center gap-2 rounded-2xl px-3 py-2 text-xs"
            >
              <span className="text-zinc-400 opacity-80">{EVENT_ICON[k]}</span>
              <span className="flex-1 truncate text-zinc-300">{EVENT_LABEL[k]}</span>
              <span className="nums font-mono text-[11px] text-accent">+{XP_BY_EVENT[k]}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Actividad reciente ─── */}
      <section>
        <h2 className="mb-4 text-[11px] font-medium uppercase tracking-label text-zinc-500">
          Actividad reciente
        </h2>
        {stats.events.length === 0 ? (
          <div className="glass rounded-3xl px-4 py-8 text-center text-xs text-zinc-500">
            Sin eventos todavía. Ejecuta una skill o sube un vídeo y empezará a llenarse.
          </div>
        ) : (
          <div className="glass rounded-3xl overflow-hidden">
            <ul className="max-h-[600px] overflow-y-auto">
              {stats.events.slice(0, 40).map((ev, idx) => (
                <li
                  key={idx}
                  className="flex items-center gap-3 border-b border-white/5 px-4 py-2.5 last:border-b-0 hover:bg-white/5"
                >
                  <span className="text-zinc-400 opacity-80 shrink-0">{EVENT_ICON[ev.kind]}</span>
                  <span className="flex-1 truncate text-xs text-zinc-200">
                    {EVENT_LABEL[ev.kind]}
                    {ev.label && (
                      <span className="ml-2 text-zinc-500">· {ev.label}</span>
                    )}
                  </span>
                  {ev.xp > 0 && (
                    <span className="nums font-mono text-[11px] text-accent shrink-0">
                      +{ev.xp}
                    </span>
                  )}
                  <span className="nums text-[10px] text-zinc-500 shrink-0">
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
          </div>
        )}
      </section>
    </main>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   KPI tile (mismo patrón que home dashboard)
   ────────────────────────────────────────────────────────────────────── */
function KpiTile({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="glass glass-hover rounded-3xl p-5">
      <div className="mb-3 flex items-start justify-between">
        <p className="text-[11px] font-medium uppercase tracking-label text-zinc-500">{label}</p>
        <span className={`opacity-70 ${accent ? 'text-accent' : 'text-zinc-400'}`}>{icon}</span>
      </div>
      <p className="nums font-display text-3xl font-bold tracking-display text-white">
        {value.toLocaleString('es-ES')}
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   SF Symbols-style icons (line, monocromos, stroke 1.5)
   ────────────────────────────────────────────────────────────────────── */
function IconAward() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="9" r="6" />
      <path d="M8.5 13.5L7 22l5-3 5 3-1.5-8.5" />
    </svg>
  );
}
function IconCog() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1A1.6 1.6 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  );
}
function IconUpload() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v12M6 10l6-6 6 6M4 20h16" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
function IconX() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
function IconImage() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5-5L5 21" />
    </svg>
  );
}
function IconPackage() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.3 7L12 12l8.7-5M12 22V12" />
    </svg>
  );
}
function IconCheckSquare() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 4 4 5-5" />
    </svg>
  );
}
function IconFlame() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#fb923c' }}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.5 0 3-1.2 3-3.5 0-2-1-3-1.5-3.5-.5 1-1 1.5-1.5 1.5-.5 0-.5-1.5 0-3.5C7.5 8 5 11 5 14a7 7 0 0 0 14 0c0-2.5-1.5-5-3-6.5-.5 1-1 1.5-1.5 1.5-1.5 0-1.5-3-1.5-5-3 1.5-5 4.5-5 7" />
    </svg>
  );
}
function IconFlameLarge() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.5 0 3-1.2 3-3.5 0-2-1-3-1.5-3.5-.5 1-1 1.5-1.5 1.5-.5 0-.5-1.5 0-3.5C7.5 8 5 11 5 14a7 7 0 0 0 14 0c0-2.5-1.5-5-3-6.5-.5 1-1 1.5-1.5 1.5-1.5 0-1.5-3-1.5-5-3 1.5-5 4.5-5 7" />
    </svg>
  );
}
