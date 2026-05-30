'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Status = 'pending' | 'running' | 'done' | 'failed' | 'cancelled' | 'blocked';

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
  attempts?: number;
  maxAttempts?: number;
  blockReason?: string;
}

const STATUS_PILL: Record<Status, string> = {
  pending: 'pill-soon',
  running: 'pill-away',
  done: 'pill-active',
  failed: 'bg-red-500/20 border border-red-500/40 text-red-300 rounded-full px-2.5 py-0.5 text-[10px] font-medium inline-flex items-center gap-1',
  cancelled: 'pill-soon',
  blocked: 'bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-full px-2.5 py-0.5 text-[10px] font-medium inline-flex items-center gap-1',
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
  const blocked = items.filter((i) => i.status === 'blocked').length;
  const failed = items.filter((i) => i.status === 'failed' || i.status === 'cancelled').length;

  return (
    <main className="mx-auto max-w-5xl px-8 pb-12 pt-2">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-display text-white mb-2">
            Cola de jobs
          </h1>
          <p className="text-sm text-zinc-400">
            Jobs encolados que se ejecutan secuencialmente. Cuando termina uno, arranca el siguiente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="glass rounded-full px-3 py-1.5 text-[11px] text-zinc-400 nums">
            <span className="text-cyan-300">{running}</span> corriendo ·{' '}
            <span className="text-zinc-300">{pending}</span> pendientes ·{' '}
            <span className="text-green-300">{done}</span> done ·{' '}
            <span className="text-amber-300">{blocked}</span> bloqueado ·{' '}
            <span className="text-red-300">{failed}</span> falló
          </span>
          {done + failed + blocked > 0 && (
            <button onClick={cleanFinished} className="btn-glass text-xs">
              Limpiar terminados
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
        </div>
      ) : items.length === 0 ? (
        <div className="glass rounded-3xl py-24 text-center">
          <p className="font-display text-lg text-zinc-300">La cola está vacía.</p>
          <p className="mt-2 text-sm text-zinc-500">
            Encola jobs desde el modal de detalle de cada vídeo (botón &quot;Encolar&quot;).
          </p>
        </div>
      ) : (
        <div className="glass rounded-3xl overflow-hidden">
          <ul>
            {items.map((it, idx) => (
              <li
                key={it.id}
                className="group flex items-start gap-3 border-b border-white/5 px-4 py-3 last:border-b-0 hover:bg-white/5"
              >
                <span className={`${STATUS_PILL[it.status]} shrink-0`}>
                  {it.status === 'running' && (
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  )}
                  {it.status}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">
                    {it.label} · {it.videoTitle}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    skill: <span className="text-zinc-200">{it.skill}</span>
                    {it.model && (
                      <>
                        {' · '}modelo: <span className="text-zinc-200">{it.model}</span>
                      </>
                    )}
                    {it.effort && (
                      <>
                        {' · '}effort: <span className="text-zinc-200">{it.effort}</span>
                      </>
                    )}
                    {it.pid && (
                      <>
                        {' · '}PID: <span className="font-mono text-[11px] text-zinc-300">{it.pid}</span>
                      </>
                    )}
                  </p>
                  <p className="nums mt-0.5 text-[10px] text-zinc-500">
                    Encolado: {new Date(it.addedAt).toLocaleTimeString('es-ES')}
                    {it.startedAt && (
                      <>{' · '}empezó: {new Date(it.startedAt).toLocaleTimeString('es-ES')}</>
                    )}
                    {it.startedAt && <>{' · '}{durationLabel(it.startedAt, it.finishedAt)}</>}
                    {(it.attempts ?? 1) > 1 && (
                      <>{' · '}turno <span className="text-zinc-300">{it.attempts}/{it.maxAttempts ?? 6}</span></>
                    )}
                    {it.failReason && (
                      <>
                        {' · '}<span className="text-red-300">{it.failReason}</span>
                      </>
                    )}
                  </p>
                  {it.status === 'blocked' && it.blockReason && (
                    <p className="mt-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
                      🔒 Bloqueado: {it.blockReason} — se dejó para resolver a mano; la cola siguió.
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {it.jobId && (
                    <Link
                      href={`/jobs/${it.jobId}`}
                      className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[11px] text-accent transition hover:bg-accent/20"
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
                          className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                          title="Subir"
                        >
                          <UpArrow />
                        </button>
                      )}
                      {idx < items.length - 1 && (
                        <button
                          onClick={() => move(it.id, 'down')}
                          disabled={busy === it.id}
                          className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                          title="Bajar"
                        >
                          <DownArrow />
                        </button>
                      )}
                      <button
                        onClick={() => remove(it.id)}
                        disabled={busy === it.id}
                        className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                        title="Eliminar"
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  )}
                  {it.status === 'running' && (
                    <button
                      onClick={() => cancel(it.id)}
                      disabled={busy === it.id}
                      className="rounded-full border border-red-500/40 bg-red-500/20 px-2.5 py-0.5 text-[11px] text-red-300 transition hover:bg-red-500/30 disabled:opacity-50"
                    >
                      cancelar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}

/* ─── icons ─── */
function UpArrow() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}
function DownArrow() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
