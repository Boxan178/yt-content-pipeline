'use client';

import { useEffect, useState } from 'react';
import {
  clearAll,
  clearNotification,
  listNotifications,
  markAllAsRead,
  onChange,
  type AppNotification,
} from '@/lib/notifications';

const KIND_PILL: Record<AppNotification['kind'], string> = {
  'job-done': 'pill-active',
  'job-failed':
    'bg-red-500/20 border border-red-500/40 text-red-300 rounded-full px-2.5 py-0.5 text-[10px] font-medium inline-flex items-center',
  'job-cancelled': 'pill-soon',
  'job-timeout':
    'bg-orange-500/15 border border-orange-500/40 text-orange-300 rounded-full px-2.5 py-0.5 text-[10px] font-medium inline-flex items-center',
  info:
    'bg-blue-500/15 border border-blue-500/40 text-blue-300 rounded-full px-2.5 py-0.5 text-[10px] font-medium inline-flex items-center',
};

const KIND_LABEL: Record<AppNotification['kind'], string> = {
  'job-done': 'OK',
  'job-failed': 'Falló',
  'job-cancelled': 'Cancelado',
  'job-timeout': 'Timeout',
  info: 'Info',
};

export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    const refresh = () => setItems(listNotifications());
    refresh();
    markAllAsRead();
    return onChange(refresh);
  }, []);

  return (
    <main className="mx-auto max-w-4xl px-8 pb-12 pt-2">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="text-accent opacity-80 mt-1">
            <IconBell />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-display text-white mb-2">
              Notificaciones
            </h1>
            <p className="text-sm text-zinc-400">
              Histórico de eventos (jobs terminados, fallos, timeouts). Máximo 200, las más nuevas arriba.
            </p>
          </div>
        </div>
        {items.length > 0 && (
          <button
            onClick={() => {
              if (confirm('¿Borrar todas las notificaciones?')) clearAll();
            }}
            className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/20 shrink-0"
          >
            Borrar todas
          </button>
        )}
      </header>

      {items.length === 0 ? (
        <div className="glass rounded-3xl py-24 text-center">
          <p className="font-display text-lg text-zinc-300">Sin notificaciones todavía.</p>
          <p className="mt-2 text-sm text-zinc-500">
            Cuando un job termine (SARA, ELENA, CALIOPE, etc.) aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="glass rounded-3xl overflow-hidden">
          <header className="border-b border-white/10 px-4 py-3 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-label text-zinc-500">
              Eventos recientes
            </span>
            <span className="nums text-[10px] text-zinc-500">{items.length} total</span>
          </header>
          <ul>
            {items.map((n) => (
              <li
                key={n.id}
                className="group flex items-start gap-3 border-b border-white/5 px-4 py-3 last:border-b-0 hover:bg-white/5"
              >
                <span className={`shrink-0 ${KIND_PILL[n.kind]}`}>{KIND_LABEL[n.kind]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{n.title}</p>
                  <p className="text-xs text-zinc-400 truncate" title={n.body}>
                    {n.body}
                  </p>
                  <p className="nums mt-0.5 text-[10px] text-zinc-500">
                    {new Date(n.createdAt).toLocaleString('es-ES')}
                    {n.skill && (
                      <>
                        {' · '}skill: <span className="font-mono text-zinc-400">{n.skill}</span>
                      </>
                    )}
                    {n.videoTitle && (
                      <>
                        {' · '}vídeo: <span className="text-zinc-400">{n.videoTitle}</span>
                      </>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => clearNotification(n.id)}
                  className="shrink-0 text-zinc-500 opacity-0 transition hover:text-white group-hover:opacity-100"
                  title="Descartar"
                >
                  <CloseIcon />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}

function IconBell() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
