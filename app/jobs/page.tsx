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

const STATUS_COLOR: Record<string, string> = {
  running: 'border-red-500/50 bg-red-500/10 text-red-300',
  done: 'border-green-500/40 bg-green-500/10 text-green-300',
  failed: 'border-red-500/40 bg-red-500/10 text-red-300',
  cancelled: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300',
  timeout: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
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
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Jobs activos</h1>
          <p className="mt-1 text-sm text-muted">
            Lista de jobs de Claude corriendo (o terminados recientemente) en todos los canales. Refresh cada 5s.
          </p>
        </div>
        <nav className="flex gap-1 rounded-lg border border-border bg-panel p-1">
          {(['running', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                filter === f ? 'bg-accent/20 text-accent' : 'text-muted hover:bg-bg hover:text-white'
              }`}
            >
              {f === 'running' ? `Corriendo (${runningCount})` : `Todos (${jobs.length})`}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Error: {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-24 text-center text-muted">
          <p className="text-lg">
            {filter === 'running' ? 'No hay jobs corriendo ahora mismo.' : 'No hay jobs en el histórico.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((entry) => {
            const j = entry.job;
            const durationMs =
              new Date(j.finishedAt ?? new Date().toISOString()).getTime() -
              new Date(j.startedAt).getTime();
            return (
              <li
                key={`${entry.videoFolder}-${j.jobId}`}
                className="flex items-start gap-3 rounded-lg border border-border bg-panel p-3"
              >
                <span
                  className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    STATUS_COLOR[j.status] ?? 'border-border bg-bg text-muted'
                  }`}
                >
                  {j.status === 'running' && '●'} {j.status}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">
                    {j.label} · {entry.videoTitle}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    canal: <span className="text-zinc-300">{entry.channelName}</span>
                    {' · '}
                    skill: <span className="text-zinc-300">{j.skill}</span>
                    {j.model && (
                      <>
                        {' · '}
                        modelo: <span className="text-zinc-300">{j.model}</span>
                      </>
                    )}
                    {j.effort && (
                      <>
                        {' · '}
                        effort: <span className="text-zinc-300">{j.effort}</span>
                      </>
                    )}
                  </p>
                  <p className="mt-0.5 text-[10px] text-zinc-500">
                    Empezó: {new Date(j.startedAt).toLocaleTimeString('es-ES')} · Duración: {formatDuration(durationMs)} · PID: {j.pid}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Link
                    href={`/jobs/${j.jobId}`}
                    className="rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-xs text-accent transition hover:bg-accent/20"
                  >
                    ver chat →
                  </Link>
                  <Link
                    href={`/channels/${entry.channel}`}
                    className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-muted transition hover:border-accent/60 hover:text-white"
                  >
                    ver canal →
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
