'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Status = 'pending' | 'uploading' | 'done' | 'failed' | 'cancelled';

interface ScheduledItem {
  id: string;
  videoTitle: string;
  channel: string;
  title: string;
  privacyOnPublish: 'public' | 'unlisted' | 'private';
  scheduledFor: string;
  status: Status;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  jobId?: string;
  youtubeVideoId?: string;
  failReason?: string;
}

const STATUS_PILL: Record<Status, string> = {
  pending: 'pill-soon',
  uploading: 'pill-away',
  done: 'pill-active',
  failed: 'bg-red-500/20 border border-red-500/40 text-red-300 rounded-full px-2.5 py-0.5 text-[10px] font-medium inline-flex items-center gap-1',
  cancelled: 'pill-soon',
};

function tilLabel(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const ms = t - now;
  if (ms <= 0) return 'ya pasó';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `en ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `en ${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `en ${d}d ${h % 24}h`;
}

export default function ScheduledPage() {
  const [items, setItems] = useState<ScheduledItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/uploads', { cache: 'no-store' });
      const data = await r.json();
      if (data.ok) setItems(data.items);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  const cancel = async (id: string) => {
    setBusy(id);
    try { await fetch(`/api/uploads/${id}?action=cancel`, { method: 'DELETE' }); } catch {}
    setBusy(null);
    load();
  };
  const remove = async (id: string) => {
    setBusy(id);
    try { await fetch(`/api/uploads/${id}`, { method: 'DELETE' }); } catch {}
    setBusy(null);
    load();
  };

  return (
    <main className="mx-auto max-w-5xl px-8 pb-12 pt-2">
      <header className="mb-8 flex items-start gap-3">
        <span className="text-accent opacity-80 mt-1">
          <IconCalendar />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-display text-white mb-2">
            Subidas programadas
          </h1>
          <p className="text-sm text-zinc-400">
            La app sube cada vídeo en la fecha que pactaste. Si el PC estaba apagado, sube en cuanto vuelves.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
        </div>
      ) : items.length === 0 ? (
        <div className="glass rounded-3xl py-24 text-center">
          <p className="font-display text-lg text-zinc-300">No hay subidas programadas.</p>
          <p className="mt-2 text-sm text-zinc-500">
            Desde el modal de un vídeo, pulsa &quot;Subir&quot; para programar una.
          </p>
        </div>
      ) : (
        <div className="glass rounded-3xl overflow-hidden">
          <ul>
            {items.map((it) => (
              <li
                key={it.id}
                className="group flex items-start gap-3 border-b border-white/5 px-4 py-3 last:border-b-0 hover:bg-white/5"
              >
                <span className={`${STATUS_PILL[it.status]} shrink-0`}>
                  {it.status === 'uploading' && (
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  )}
                  {it.status}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate" title={it.title}>
                    {it.title}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    canal: <span className="text-zinc-200">{it.channel}</span>
                    {' · '}privacy: <span className="text-zinc-200">{it.privacyOnPublish}</span>
                    {' · '}vídeo: <span className="text-zinc-200">{it.videoTitle}</span>
                  </p>
                  <p className="nums mt-0.5 text-[10px] text-zinc-500">
                    Programado para: {new Date(it.scheduledFor).toLocaleString('es-ES')} ({tilLabel(it.scheduledFor)})
                    {it.failReason && (
                      <span className="ml-2 text-red-300">· {it.failReason}</span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {it.youtubeVideoId && (
                    <a
                      href={`https://studio.youtube.com/video/${it.youtubeVideoId}/edit`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[11px] text-accent transition hover:bg-accent/20"
                    >
                      Ver en YT Studio →
                    </a>
                  )}
                  {it.jobId && (
                    <Link
                      href={`/jobs/${it.jobId}`}
                      className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-zinc-300 transition hover:bg-white/10 hover:text-white"
                    >
                      Ver chat →
                    </Link>
                  )}
                  {(it.status === 'pending' || it.status === 'uploading') && (
                    <button
                      onClick={() => cancel(it.id)}
                      disabled={busy === it.id}
                      className="rounded-full border border-red-500/40 bg-red-500/20 px-2.5 py-0.5 text-[11px] text-red-300 transition hover:bg-red-500/30 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  )}
                  {(it.status === 'done' || it.status === 'failed' || it.status === 'cancelled') && (
                    <button
                      onClick={() => remove(it.id)}
                      disabled={busy === it.id}
                      className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                    >
                      Quitar
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

function IconCalendar() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}
