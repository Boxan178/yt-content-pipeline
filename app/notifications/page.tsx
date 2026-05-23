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

const KIND_COLOR: Record<AppNotification['kind'], string> = {
  'job-done': 'border-green-500/40 bg-green-500/10 text-green-300',
  'job-failed': 'border-red-500/40 bg-red-500/10 text-red-300',
  'job-cancelled': 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300',
  'job-timeout': 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  info: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
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
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Notificaciones</h1>
          <p className="mt-1 text-sm text-muted">
            Histórico de eventos (jobs terminados, fallos, timeouts). Máximo 200, las más nuevas arriba.
          </p>
        </div>
        {items.length > 0 && (
          <button
            onClick={() => { if (confirm('¿Borrar todas las notificaciones?')) clearAll(); }}
            className="rounded-md border border-border bg-bg px-3 py-1.5 text-xs text-muted transition hover:border-red-500/40 hover:text-red-300"
          >
            Borrar todas
          </button>
        )}
      </header>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-24 text-center text-muted">
          <p className="text-lg">Sin notificaciones todavía.</p>
          <p className="mt-2 text-sm">Cuando un job termine (SARA, ELENA, CALIOPE, etc.) aparecerá aquí.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.id}
              className="group flex items-start gap-3 rounded-lg border border-border bg-panel px-4 py-3"
            >
              <span
                className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${KIND_COLOR[n.kind]}`}
              >
                {KIND_LABEL[n.kind]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{n.title}</p>
                <p className="mt-0.5 text-xs text-zinc-300">{n.body}</p>
                <p className="mt-1 text-[10px] text-muted">
                  {new Date(n.createdAt).toLocaleString('es-ES')}
                  {n.skill && ` · skill: ${n.skill}`}
                  {n.videoTitle && ` · vídeo: ${n.videoTitle}`}
                </p>
              </div>
              <button
                onClick={() => clearNotification(n.id)}
                className="shrink-0 text-xs text-muted opacity-0 transition hover:text-white group-hover:opacity-100"
                title="Descartar"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
