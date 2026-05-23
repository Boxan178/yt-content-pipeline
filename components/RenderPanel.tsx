'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type RenderStatus = 'running' | 'done' | 'failed' | 'cancelled';

interface RenderJob {
  jobId: string;
  pid: number;
  status: RenderStatus;
  startedAt: string;
  finishedAt?: string;
  slug: string;
  scriptPath: string;
  projectFolder: string;
  exitCode?: number | null;
}

interface StatusResponse {
  ok: boolean;
  job: RenderJob | null;
  tail?: string;
  durationSec?: number;
}

interface Props {
  channel: string;
  video: string;
}

const POLL_MS = 5_000;

function formatDuration(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function statusBadge(s: RenderStatus) {
  switch (s) {
    case 'running':
      return { label: 'Renderizando', cls: 'border-blue-500/40 bg-blue-500/10 text-blue-300' };
    case 'done':
      return { label: 'OK', cls: 'border-green-500/40 bg-green-500/10 text-green-300' };
    case 'failed':
      return { label: 'Fallido', cls: 'border-red-500/40 bg-red-500/10 text-red-300' };
    case 'cancelled':
      return { label: 'Cancelado', cls: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300' };
  }
}

export function RenderPanel({ channel, video }: Props) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const enc = encodeURIComponent;
  const base = `/api/channels/${enc(channel)}/videos/${enc(video)}/render`;

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch(`${base}/status`, { cache: 'no-store' });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || `HTTP ${r.status}`);
      }
      const json = (await r.json()) as StatusResponse;
      setStatus(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [base]);

  // Poll automático mientras running
  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (status?.job?.status === 'running') {
      pollRef.current = setInterval(loadStatus, POLL_MS);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [status?.job?.status, loadStatus]);

  const startRender = async () => {
    if (!confirm('Arrancar render? Lleva 18-25 min. Se ejecuta `render_project.py` sin LUIS (sin auto-audit ni AMELIA/MARCUS).')) return;
    setBusy(true);
    try {
      const r = await fetch(base, { method: 'POST' });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || `HTTP ${r.status}`);
      }
      await loadStatus();
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const cancelRender = async () => {
    if (!confirm('Cancelar el render en curso? El proceso será matado.')) return;
    setBusy(true);
    try {
      const r = await fetch(`${base}/cancel`, { method: 'POST' });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || `HTTP ${r.status}`);
      }
      await loadStatus();
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const job = status?.job;

  return (
    <section className="rounded-lg border border-border bg-bg/40 p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Render (sin LUIS)
        </h3>
        {job && (
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusBadge(job.status).cls}`}
          >
            {statusBadge(job.status).label}
          </span>
        )}
      </header>

      {error && (
        <div className="mb-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {!job && (
        <div>
          <p className="mb-3 text-sm text-muted">
            Lanza <code className="rounded bg-bg px-1 text-zinc-300">render_project.py</code> en background.
            Sin auto-audit visual, sin AMELIA, sin MARCUS, sin mover carpeta. Solo el render técnico.
          </p>
          <button
            onClick={startRender}
            disabled={busy}
            className="w-full rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
          >
            {busy ? 'Arrancando…' : 'Renderizar'}
          </button>
        </div>
      )}

      {job && (
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-muted">Slug</dt>
            <dd className="font-mono text-zinc-300">{job.slug}</dd>
            <dt className="text-muted">PID</dt>
            <dd className="font-mono text-zinc-300">{job.pid}</dd>
            <dt className="text-muted">Inicio</dt>
            <dd className="text-zinc-300">{new Date(job.startedAt).toLocaleTimeString('es-ES')}</dd>
            <dt className="text-muted">Duración</dt>
            <dd className="text-zinc-300">
              {status?.durationSec != null ? formatDuration(status.durationSec) : '—'}
            </dd>
          </dl>

          {status?.tail && (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-muted">Log (últimas líneas)</p>
              <pre className="max-h-60 overflow-auto rounded border border-border bg-bg p-2 font-mono text-[10px] leading-relaxed text-zinc-400">
                {status.tail || '(vacío)'}
              </pre>
            </div>
          )}

          <div className="flex gap-2">
            {job.status === 'running' && (
              <button
                onClick={cancelRender}
                disabled={busy}
                className="flex-1 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
              >
                {busy ? '…' : 'Cancelar'}
              </button>
            )}
            {(job.status === 'failed' || job.status === 'cancelled' || job.status === 'done') && (
              <button
                onClick={startRender}
                disabled={busy}
                className="flex-1 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm text-accent transition hover:bg-accent/20 disabled:opacity-50"
              >
                {busy ? '…' : 'Renderizar otra vez'}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
