'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface JobEntry {
  channel: string;
  channelName: string;
  videoTitle: string;
  videoFolder: string;
  job: {
    jobId: string;
    pid: number;
    skill: string;
    label: string;
    status: 'running' | 'done' | 'failed' | 'cancelled' | 'timeout';
    startedAt: string;
    finishedAt?: string;
    model?: string;
    effort?: string;
  };
}

const STATUS_PILL: Record<string, string> = {
  running: 'pill-away',
  done: 'pill-active',
  failed:
    'bg-red-500/20 border border-red-500/40 text-red-300 rounded-full px-2.5 py-0.5 text-[10px] font-medium inline-flex items-center gap-1',
  cancelled: 'pill-soon',
  timeout:
    'bg-orange-500/15 border border-orange-500/40 text-orange-300 rounded-full px-2.5 py-0.5 text-[10px] font-medium inline-flex items-center gap-1',
};

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(0)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'running' | 'all'>('running');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/claude/jobs/all', { cache: 'no-store' });
      const data = await r.json();
      if (data.ok) {
        setJobs(data.jobs);
        setError(null);
      } else {
        setError(data.error || 'unknown');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  const visible = filter === 'running' ? jobs.filter((j) => j.job.status === 'running') : jobs;
  const runningCount = jobs.filter((j) => j.job.status === 'running').length;

  return (
    <main className="mx-auto max-w-5xl px-8 pb-12 pt-2">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="text-accent opacity-80 mt-1">
            <IconActivity />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-display text-white mb-2">
              Jobs activos
            </h1>
            <p className="text-sm text-zinc-400">
              Lista de jobs de Claude corriendo (o terminados recientemente) en todos los canales. Refresh cada 5s.
            </p>
          </div>
        </div>
        <nav className="glass flex gap-0.5 rounded-full p-1">
          {(['running', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filter === f
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {f === 'running' ? `Corriendo (${runningCount})` : `Todos (${jobs.length})`}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <div className="mb-4 rounded-3xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Error: {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
        </div>
      ) : visible.length === 0 ? (
        <div className="glass rounded-3xl py-24 text-center">
          <p className="font-display text-lg text-zinc-300">
            {filter === 'running' ? 'No hay jobs corriendo ahora mismo.' : 'No hay jobs en el histórico.'}
          </p>
        </div>
      ) : (
        <div className="glass rounded-3xl overflow-hidden">
          <ul>
            {visible.map((entry) => {
              const j = entry.job;
              const durationMs =
                new Date(j.finishedAt ?? new Date().toISOString()).getTime() -
                new Date(j.startedAt).getTime();
              return (
                <li
                  key={`${entry.videoFolder}-${j.jobId}`}
                  className="group flex items-start gap-3 border-b border-white/5 px-4 py-3 last:border-b-0 hover:bg-white/5"
                >
                  <span className={`${STATUS_PILL[j.status] ?? 'pill-soon'} shrink-0`}>
                    {j.status === 'running' && (
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    )}
                    {j.status}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">
                      {j.label} · {entry.videoTitle}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      canal: <span className="text-zinc-200">{entry.channelName}</span>
                      {' · '}skill: <span className="text-zinc-200">{j.skill}</span>
                      {j.model && (
                        <>
                          {' · '}modelo: <span className="text-zinc-200">{j.model}</span>
                        </>
                      )}
                      {j.effort && (
                        <>
                          {' · '}effort: <span className="text-zinc-200">{j.effort}</span>
                        </>
                      )}
                    </p>
                    <p className="nums mt-0.5 text-[10px] text-zinc-500">
                      Empezó: {new Date(j.startedAt).toLocaleTimeString('es-ES')} · Duración:{' '}
                      {formatDuration(durationMs)} · PID:{' '}
                      <span className="font-mono text-[10px] text-zinc-400">{j.pid}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Link
                      href={`/jobs/${j.jobId}`}
                      className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[11px] text-accent transition hover:bg-accent/20"
                    >
                      ver chat →
                    </Link>
                    <Link
                      href={`/channels/${entry.channel}`}
                      className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-zinc-400 transition hover:bg-white/10 hover:text-white"
                    >
                      ver canal →
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </main>
  );
}

function IconActivity() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}
