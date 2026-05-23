'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CHANNELS } from '@/lib/channels';
import { fetchStats } from '@/lib/gamification-client';
import { titleForLevel, deriveLevel, type Stats } from '@/lib/gamification-types';

export default function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetchStats().then(setStats).catch(() => {});
  }, []);

  const lv = stats ? deriveLevel(stats.xp) : null;
  const enabled = CHANNELS.filter((c) => c.enabled);

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-10">
        <h1 className="text-3xl font-bold text-white">
          {stats && lv ? (
            <>Hola, {titleForLevel(lv.level)} <span className="text-amber-300">(nivel {lv.level})</span></>
          ) : (
            'YouTube Content Pipeline'
          )}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          {enabled.length === 0
            ? 'Aún no hay canales activos. Configura uno en lib/channels.ts (campo `enabled: true` + `rootPath` real).'
            : `${enabled.length} canal${enabled.length > 1 ? 'es' : ''} activos. Selecciona uno para entrar al kanban.`}
        </p>
      </header>

      {stats && (
        <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Vídeos subidos" value={stats.counters.videos_uploaded} icon="📤" />
          <Stat label="Jobs completados" value={stats.counters.jobs_done} icon="⚙️" />
          <Stat label="Logros" value={`${stats.achievements.length} / 12`} icon="🏆" />
          <Stat
            label="Racha"
            value={stats.streak.current > 0 ? `${stats.streak.current} días 🔥` : 'sin racha'}
            icon="🔥"
          />
        </section>
      )}

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {CHANNELS.map((c) =>
          c.enabled ? (
            <Link
              key={c.slug}
              href={`/channels/${c.slug}`}
              className="group block rounded-xl border border-border bg-panel p-5 transition hover:border-accent/60 hover:bg-panel/80"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white group-hover:text-accent">
                  {c.name}
                </h2>
                <span className="rounded-full border border-green-500/40 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-300">
                  activo
                </span>
              </div>
              <p className="font-mono text-xs text-muted">{c.rootPath}</p>
            </Link>
          ) : (
            <div
              key={c.slug}
              className="block rounded-xl border border-dashed border-border bg-bg/40 p-5 opacity-60"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-400">{c.name}</h2>
                <span className="rounded-full border border-zinc-500/40 bg-zinc-500/10 px-2 py-0.5 text-xs font-medium text-zinc-400">
                  coming soon
                </span>
              </div>
              <p className="font-mono text-xs text-muted">
                {c.rootPath || 'rootPath no configurado'}
              </p>
            </div>
          ),
        )}
      </section>

      {enabled.length > 0 && (
        <footer className="mt-12 grid grid-cols-2 gap-3 border-t border-border pt-6 sm:grid-cols-4">
          <QuickLink href="/sleep-stories" icon="🌙" label="Sleep Stories" />
          <QuickLink href="/queue" icon="📋" label="Cola de jobs" />
          <QuickLink href="/jobs" icon="⚙️" label="Jobs activos" />
          <QuickLink href="/perfil" icon="🏛️" label="Mi perfil" />
        </footer>
      )}
    </main>
  );
}

function Stat({ label, value, icon }: { label: string; value: number | string; icon: string }) {
  return (
    <div className="rounded-lg border border-border bg-panel px-3 py-3">
      <p className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <span>{icon}</span>
      </p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg border border-border bg-panel px-4 py-2 text-sm text-white transition hover:border-accent/60"
    >
      <span className="text-lg">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className="text-muted">→</span>
    </Link>
  );
}
