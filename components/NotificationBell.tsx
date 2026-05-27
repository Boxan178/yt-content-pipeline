'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  countUnread,
  listNotifications,
  markAllAsRead,
  clearNotification,
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
  'job-done': '✓ OK',
  'job-failed': '✗ Falló',
  'job-cancelled': '⊘ Cancelado',
  'job-timeout': '⏱ Timeout',
  info: 'ℹ',
};

function relTime(iso: string) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const fmt = new Intl.RelativeTimeFormat('es-ES', { numeric: 'auto' });
  if (abs < 60) return fmt.format(Math.round(diff), 'second');
  if (abs < 3600) return fmt.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return fmt.format(Math.round(diff / 3600), 'hour');
  return fmt.format(Math.round(diff / 86400), 'day');
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setItems(listNotifications().slice(0, 12));
      setUnread(countUnread());
    };
    refresh();
    return onChange(refresh);
  }, []);

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-notification-bell]')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className="relative" data-notification-bell>
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open && unread > 0) markAllAsRead();
        }}
        className="glass glass-hover relative flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition hover:text-white"
        title={unread > 0 ? `${unread} notificación(es) sin leer` : 'Notificaciones'}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white"
            style={{ boxShadow: '0 0 8px rgba(239,68,68,0.5)' }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="glass absolute right-0 top-12 z-50 w-96 overflow-hidden rounded-2xl shadow-2xl">
          <header className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
            <span className="text-[10px] font-medium uppercase tracking-label text-zinc-500">
              Notificaciones
            </span>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-[10px] text-accent hover:underline"
            >
              ver todas →
            </Link>
          </header>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-zinc-500">Sin notificaciones</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => (
                <li
                  key={n.id}
                  className="group flex items-start gap-2 border-b border-white/5 px-3 py-2 last:border-b-0 hover:bg-white/5"
                >
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold ${KIND_COLOR[n.kind]}`}
                  >
                    {KIND_LABEL[n.kind]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-xs font-medium text-white" title={n.title}>
                      {n.title}
                    </p>
                    <p className="line-clamp-1 text-[11px] text-zinc-400" title={n.body}>
                      {n.body}
                    </p>
                    <p className="nums mt-0.5 text-[9px] text-zinc-500">{relTime(n.createdAt)}</p>
                  </div>
                  <button
                    onClick={() => clearNotification(n.id)}
                    className="shrink-0 text-[10px] text-zinc-500 opacity-0 transition hover:text-white group-hover:opacity-100"
                    title="Descartar"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
