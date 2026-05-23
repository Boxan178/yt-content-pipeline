'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Status = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

interface QueueItem {
  id: string;
  skill: string;
  label: string;
  videoFolder: string;
  videoTitle: string;
  cwd: string;
  model?: string;
  effort?: string;
  status: Status;
  addedAt: string;
  startedAt?: string;
  finishedAt?: string;
  jobId?: string;
  pid?: number;
  failReason?: string;
}

const STATUS_COLOR: Record<Status, string> = {
  pending: 'border-zinc-600/50 bg-zinc-700/20 text-zinc-300',
  running: 'border-red-500/50 bg-red-500/10 text-red-300',
  done: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  failed: 'border-red-500/40 bg-red-500/10 text-red-300',
  cancelled: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300',
};

function durationLabel(start: string, end?: string) {
  const a = new Date(start).getTime();
  const b = end ? new Date(end).getTime() : Date.now();
  const ms = b - a;
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(0)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

export default function QueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/queue', { cache: 'no-store' });
      const data = await r.json();
      if (data.ok) setItems(data.queue.items);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [load]);

  const remove = async (id: string) => {
    setBusy(id);
    try {
      await fetch(`/api/queue/${id}`, { method: 'DELETE' });
    } catch {}
    setBusy(null);
    load();
  };
  const cancel = async (id: string) => {
    setBusy(id);
    try {
      await fetch(`/api/queue/${id}?action=cancel`, { method: 'POST' });
    } catch {}
    setBusy(null);
    load();
  };
  const move = async (id: string, dir: 'up' | 'down') => {
    setBusy(id);
    try {
      await fetch(`/api/queue/${id}?action=${dir}`, { method: 'POST' });
    } catch {}
    setBusy(null);
    load();
  };
  const cleanFinished = async () => {
    try {
      await fetch('/api/queue?cleanFinished=1', { method: 'DELETE' });
    } catch {}
    load();
  };

  const pending = items.filter((i) => i.status === 'pending').length;
  const running = items.filter((i) => i.status === 'running').length;
  const done = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'failed' || i.status === 'cancelled').length;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Cola de jobs</h1>
          <p className="mt-1 text-sm text-muted">
            Jobs encolados que se ejecutan secuencialmente. Cuando termina uno, arranca el siguiente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded border border-border bg-bg/40 px-2 py-1 text-xs text-muted">
            ● {running} corriendo · ○ {pending} pendientes · ✓ {done} · ✗ {failed}
          </span>
          {done + failed > 0 && (
            <button
              onClick={cleanFinished}
              className="rounded border border-border bg-bg px-2 py-1 text-xs text-muted hover:text-white"
            >
              Limpiar terminados
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-24 text-center text-muted">
          <p className="text-lg">La cola está vacía.</p>
          <p className="mt-2 text-sm">Encola jobs desde el modal de detalle de cada vídeo (botón &quot;Encolar&quot;).</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it, idx) => (
            <li
              key={it.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-panel p-3"
            >
              <span
                className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_COLOR[it.status]}`}
              >
                {it.status === 'running' && '●'} {it.status}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">
                  {it.label} · {it.videoTitle}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  skill: <span className="text-zinc-300">{it.skill}</span>
                  {it.model && (<>{' · '}modelo: <span className="text-zinc-300">{it.model}</span></>)}
                  {it.effort && (<>{' · '}effort: <span className="text-zinc-300">{it.effort}</span></>)}
                  {it.pid && (<>{' · '}PID: <span className="text-zinc-300">{it.pid}</span></>)}
                </p>
                <p className="mt-0.5 text-[10px] text-zinc-500">
                  Encolado: {new Date(it.addedAt).toLocaleTimeString('es-ES')}
                  {it.startedAt && (<>{' · '}empezó: {new Date(it.startedAt).toLocaleTimeString('es-ES')}</>)}
                  {it.startedAt && (<>{' · '}{durationLabel(it.startedAt, it.finishedAt)}</>)}
                  {it.failReason && (<>{' · '}<span className="text-red-300">{it.failReason}</span></>)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {it.jobId && (
                  <Link
                    href={`/jobs/${it.jobId}`}
                    className="rounded border border-accent/40 bg-accent/10 px-2 py-1 text-xs text-accent hover:bg-accent/20"
                  >
                    ver chat →
                  </Link>
                )}
                {it.status === 'pending' && (
                  <div className="flex gap-1">
                    {idx > 0 && (
                      <button
                        onClick={() => move(it.id, 'up')}
                        disabled={busy === it.id}
                        className="rounded border border-border bg-bg px-1.5 py-0.5 text-[10px] text-muted hover:text-white disabled:opacity-50"
                        title="Subir"
                      >
                        ↑
                      </button>
                    )}
                    {idx < items.length - 1 && (
                      <button
                        onClick={() => move(it.id, 'down')}
                        disabled={busy === it.id}
                        className="rounded border border-border bg-bg px-1.5 py-0.5 text-[10px] text-muted hover:text-white disabled:opacity-50"
                        title="Bajar"
                      >
                        ↓
                      </button>
                    )}
                    <button
                      onClick={() => remove(it.id)}
                      disabled={busy === it.id}
                      className="rounded border border-border bg-bg px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                      title="Eliminar"
                    >
                      ✕
                    </button>
                  </div>
                )}
                {it.status === 'running' && (
                  <button
                    onClick={() => cancel(it.id)}
                    disabled={busy === it.id}
                    className="rounded border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                  >
                    cancelar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
