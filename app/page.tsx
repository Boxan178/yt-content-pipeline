'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { CHANNELS } from '@/lib/channels';
import { fetchStats } from '@/lib/gamification-client';
import { type Stats } from '@/lib/gamification-types';

/**
 * Home dashboard — Liquid Glass refresh 2026-05-27.
 *
 * El greeting "Hola, <título Jedi> (nivel N)" vive ahora en TopBar (sticky
 * arriba), así que aquí mostramos solo el subtítulo, KPIs, canales y
 * accesos rápidos en surface .glass rounded-[28px] coherente con el
 * resto del refresh.
 */
interface ChannelWork {
  slug: string;
  name: string;
  liveJobs: number;
  pending: number;
  current: { videoTitle: string; skill: string; label: string; startedAt: string } | null;
}
interface WorkingSummary {
  channels: Record<string, ChannelWork>;
  totals: { liveJobs: number; pending: number; workingChannels: number };
}

const WORK_REFRESH_MS = 15_000;

function elapsedLabel(startedAt: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [work, setWork] = useState<WorkingSummary | null>(null);

  useEffect(() => {
    fetchStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      fetch('/api/working-summary', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => { if (!cancelled && d?.ok) setWork(d as WorkingSummary); })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, WORK_REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const workOf = (slug: string): ChannelWork | undefined => work?.channels?.[slug];

  // Canales activos, con los que están trabajando primero (live > pending > resto).
  const enabled = CHANNELS.filter((c) => c.enabled).slice().sort((a, b) => {
    const wa = workOf(a.slug); const wb = workOf(b.slug);
    const score = (w?: ChannelWork) => (w ? (w.liveJobs > 0 ? 2 : w.pending > 0 ? 1 : 0) : 0);
    return score(wb) - score(wa);
  });
  const comingSoon = CHANNELS.filter((c) => !c.enabled);

  return (
    <main className="mx-auto max-w-[1400px] px-8 pb-12 pt-2">
      <p className="mb-8 text-sm text-zinc-400">
        {enabled.length === 0
          ? 'Aún no hay canales activos. Configura uno en lib/channels.ts (campo `enabled: true` + `rootPath` real).'
          : `${enabled.length} canal${enabled.length > 1 ? 'es' : ''} activos. Selecciona uno para entrar al kanban.`}
      </p>

      {/* ── KPI Grid ── */}
      {stats && (
        <section className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Vídeos subidos" value={stats.counters.videos_uploaded} icon={<IconUpload />} />
          <Stat label="Jobs completados" value={stats.counters.jobs_done} icon={<IconCog />} />
          <Stat
            label="Logros"
            value={
              <>
                {stats.achievements.length}{' '}
                <span className="text-2xl font-medium text-zinc-500">/ 24</span>
              </>
            }
            icon={<IconTrophy />}
            accentIcon
          />
          <Stat
            label="Racha"
            value={
              stats.streak.current > 0 ? (
                <>
                  {stats.streak.current}{' '}
                  <span className="text-xl font-medium text-zinc-500">días</span>
                </>
              ) : (
                'sin racha'
              )
            }
            icon={<IconFlame />}
          />
        </section>
      )}

      {/* ── Canales ── */}
      <section className="mb-10">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-label text-zinc-500">
            Tus canales
          </h2>
          <p className="text-xs text-zinc-500">
            {enabled.length} {enabled.length === 1 ? 'activo' : 'activos'}
            {comingSoon.length > 0 && ` · ${comingSoon.length} próximamente`}
          </p>
        </div>

        {/* Resumen "trabajando ahora" */}
        {work && work.totals.workingChannels > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-red-500/30 bg-red-500/[0.07] px-4 py-2.5 text-xs text-zinc-300">
            <span className="inline-flex items-center gap-1.5 font-medium text-red-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
              Trabajando ahora
            </span>
            <span className="text-zinc-500">·</span>
            <span><span className="nums text-white">{work.totals.liveJobs}</span> en directo</span>
            <span className="text-zinc-500">·</span>
            <span><span className="nums text-white">{work.totals.pending}</span> en cola</span>
            <span className="text-zinc-500">·</span>
            <span><span className="nums text-white">{work.totals.workingChannels}</span> {work.totals.workingChannels === 1 ? 'canal' : 'canales'}</span>
          </div>
        )}

        {/* Activos */}
        {enabled.length > 0 && (
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {enabled.map((c) => {
              const w = workOf(c.slug);
              const live = w?.liveJobs ?? 0;
              const pending = w?.pending ?? 0;
              const isLive = live > 0;
              return (
              <Link
                key={c.slug}
                href={`/channels/${c.slug}`}
                className={`glass glass-hover block rounded-[28px] p-5 transition ${
                  isLive ? 'border-red-500/70 shadow-[0_0_0_2px_rgba(239,68,68,0.25)]' : ''
                }`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold tracking-display text-white">
                    {c.name}
                  </h3>
                  {isLive ? (
                    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-0.5 text-[10px] font-medium text-red-200">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                      trabajando
                    </span>
                  ) : (
                    <span className="pill-active flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                      activo
                    </span>
                  )}
                </div>
                <p className="mb-3 truncate font-mono text-[11px] text-zinc-500" title={c.rootPath}>
                  {c.rootPath}
                </p>
                {isLive && w?.current ? (
                  <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2">
                    <p className="truncate text-[11px] text-zinc-300" title={w.current.videoTitle}>
                      <span className="font-semibold text-red-200">{w.current.label || w.current.skill}</span>
                      {' · '}{w.current.videoTitle}
                    </p>
                    <p className="mt-0.5 text-[10px] text-zinc-500">
                      {elapsedLabel(w.current.startedAt)} en marcha
                      {live > 1 && <> · <span className="nums">{live}</span> jobs vivos</>}
                      {pending > 0 && <> · <span className="nums">{pending}</span> en cola</>}
                    </p>
                  </div>
                ) : pending > 0 ? (
                  <p className="text-[11px] text-amber-300/90">
                    <span className="nums">{pending}</span> en cola, a la espera
                  </p>
                ) : (
                  /* Sin jobs vivos ni cola. No tenemos counts reales todavía
                     (futuro: leer hitos por canal), así que mostramos un
                     estado neutro en vez de una barra de progreso falsa. */
                  <p className="text-[11px] text-zinc-500">Sin actividad</p>
                )}
              </Link>
              );
            })}
          </div>
        )}

        {/* Coming soon */}
        {comingSoon.length > 0 && (
          <div className="grid grid-cols-2 gap-4 opacity-60 sm:grid-cols-3 lg:grid-cols-4">
            {comingSoon.map((c) => (
              <div key={c.slug} className="glass rounded-[28px] p-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h3 className="font-display text-base font-medium tracking-display text-zinc-400">
                    {c.name}
                  </h3>
                  <span className="pill-soon rounded-full px-2.5 py-0.5 text-[10px] font-medium">
                    coming soon
                  </span>
                </div>
                <p className="truncate font-mono text-[11px] italic text-zinc-600">
                  {c.rootPath || 'rootPath no configurado'}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Accesos rápidos ── */}
      {enabled.length > 0 && (
        <section>
          <h2 className="mb-4 text-[11px] font-medium uppercase tracking-label text-zinc-500">
            Accesos rápidos
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <QuickLink href="/sleep-stories" icon={<IconMoon />} label="Sleep Stories" />
            <QuickLink href="/queue" icon={<IconList />} label="Cola de jobs" />
            <QuickLink href="/jobs" icon={<IconActivity />} label="Jobs activos" />
            <QuickLink href="/perfil" icon={<IconAward />} label="Mi perfil" />
          </div>
        </section>
      )}
    </main>
  );
}

/* ─────────────── KPI tile ─────────────── */
function Stat({
  label,
  value,
  icon,
  accentIcon,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  accentIcon?: boolean;
}) {
  return (
    <div className="glass glass-hover rounded-3xl p-6">
      <div className="mb-3 flex items-start justify-between">
        <p className="text-[11px] font-medium uppercase tracking-label text-zinc-500">{label}</p>
        <span className={`opacity-70 ${accentIcon ? 'text-accent' : 'text-zinc-400'}`}>{icon}</span>
      </div>
      <p className="nums font-display text-4xl font-bold tracking-display text-white">{value}</p>
    </div>
  );
}

/* ─────────────── Quick link tile ─────────────── */
function QuickLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link href={href} className="glass glass-hover flex items-center gap-4 rounded-3xl p-5">
      <span className="text-zinc-300">{icon}</span>
      <span className="flex-1 font-display text-sm font-medium text-zinc-100">{label}</span>
      <span className="text-lg text-zinc-500">→</span>
    </Link>
  );
}

/* ─────────────── SF Symbols-style icons ─────────────── */
function IconUpload() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v12M6 10l6-6 6 6M4 20h16" />
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
function IconTrophy() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v4a5 5 0 0 1-10 0z" />
      <path d="M5 4H3v2a3 3 0 0 0 3 3M19 4h2v2a3 3 0 0 1-3 3M12 13v4M9 21h6M10 21v-4h4v4" />
    </svg>
  );
}
function IconFlame() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ filter: 'drop-shadow(0 0 4px rgba(251,146,60,0.6))', color: '#fb923c' }}
    >
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.5 0 3-1.2 3-3.5 0-2-1-3-1.5-3.5-.5 1-1 1.5-1.5 1.5-.5 0-.5-1.5 0-3.5C7.5 8 5 11 5 14a7 7 0 0 0 14 0c0-2.5-1.5-5-3-6.5-.5 1-1 1.5-1.5 1.5-1.5 0-1.5-3-1.5-5-3 1.5-5 4.5-5 7" />
    </svg>
  );
}
function IconMoon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
function IconList() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6.5l1.5 1.5L8.5 5M4 12.5l1.5 1.5L8.5 11M4 18.5l1.5 1.5L8.5 17M13 7h7M13 13h7M13 19h7" />
    </svg>
  );
}
function IconActivity() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}
function IconAward() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="9" r="6" />
      <path d="M8.5 13.5L7 22l5-3 5 3-1.5-8.5" />
    </svg>
  );
}
