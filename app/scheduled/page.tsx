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

const STATUS_COLOR: Record<Status, string> = {
  pending: 'border-zinc-600/50 bg-zinc-700/20 text-zinc-300',
  uploading: 'border-red-500/50 bg-red-500/10 text-red-300',
  done: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  failed: 'border-red-500/40 bg-red-500/10 text-red-300',
  cancelled: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300',
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
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">📅 Subidas programadas</h1>
        <p className="mt-1 text-sm text-muted">
          La app sube cada vídeo en la fecha que pactaste. Si el PC estaba apagado, sube en cuanto vuelves.
        </p>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-24 text-center text-muted">
          <p className="text-lg">No hay subidas programadas.</p>
          <p className="mt-2 text-sm">Desde el modal de un vídeo, pulsa "📤 Subir" para programar una.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="flex items-start gap-3 rounded-lg border border-border bg-panel p-3">
              <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_COLOR[it.status]}`}>
                {it.status === 'uploading' && '●'} {it.status}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white" title={it.title}>{it.title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  canal: <span className="text-zinc-300">{it.channel}</span>
                  {' · '}privacy: <span className="text-zinc-300">{it.privacyOnPublish}</span>
                  {' · '}vídeo: <span className="text-zinc-300">{it.videoTitle}</span>
                </p>
                <p className="mt-0.5 text-[10px] text-zinc-500">
                  Programado para: {new Date(it.scheduledFor).toLocaleString('es-ES')} ({tilLabel(it.scheduledFor)})
                  {it.failReason && <span className="ml-2 text-red-300">· {it.failReason}</span>}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {it.youtubeVideoId && (
                  <a
                    href={`https://studio.youtube.com/video/${it.youtubeVideoId}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded border border-accent/40 bg-accent/10 px-2 py-1 text-xs text-accent hover:bg-accent/20"
                  >
                    Ver en YT Studio →
                  </a>
                )}
                {it.jobId && (
                  <Link
                    href={`/jobs/${it.jobId}`}
                    className="rounded border border-border bg-bg px-2 py-1 text-xs text-muted hover:text-white"
                  >
                    Ver chat →
                  </Link>
                )}
                {(it.status === 'pending' || it.status === 'uploading') && (
                  <button
                    onClick={() => cancel(it.id)}
                    disabled={busy === it.id}
                    className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                )}
                {(it.status === 'done' || it.status === 'failed' || it.status === 'cancelled') && (
                  <button
                    onClick={() => remove(it.id)}
                    disabled={busy === it.id}
                    className="rounded border border-border bg-bg px-2 py-1 text-xs text-muted hover:text-white disabled:opacity-50"
                  >
                    Quitar
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
