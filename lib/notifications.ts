'use client';

// Gestión de notificaciones en localStorage. Browser-safe.
// Cuando un job termina (done/failed/cancelled/timeout), ClaudeRunButton llama
// addNotification(). La campanita y la vista /notifications las muestran.
// Las notificaciones nativas del OS las dispara Electron via IPC.

export type NotificationKind = 'job-done' | 'job-failed' | 'job-cancelled' | 'job-timeout' | 'info';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Path del videoFolder relacionado, si aplica. */
  videoFolder?: string;
  /** Título humano del vídeo si aplica. */
  videoTitle?: string;
  /** Skill que terminó si aplica. */
  skill?: string;
  /** ISO timestamp. */
  createdAt: string;
  /** Si false, todavía no se ha visto. */
  read: boolean;
}

const KEY = 'ytcp:notifications:items';
const MAX_KEEP = 200;
const LISTENERS = new Set<() => void>();

function readAll(): AppNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppNotification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: AppNotification[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_KEEP)));
    for (const fn of LISTENERS) {
      try { fn(); } catch {}
    }
  } catch {}
}

export function listNotifications(): AppNotification[] {
  return readAll().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function countUnread(): number {
  return readAll().filter((n) => !n.read).length;
}

export function addNotification(n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): AppNotification {
  const item: AppNotification = {
    ...n,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    read: false,
  };
  const all = readAll();
  all.unshift(item);
  writeAll(all);
  // Notif nativa Electron si hay API
  try {
    if (typeof window !== 'undefined' && window.electronAPI?.notify) {
      window.electronAPI.notify({ title: item.title, body: item.body, kind: item.kind });
    } else if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(item.title, { body: item.body });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((perm) => {
          if (perm === 'granted') new Notification(item.title, { body: item.body });
        });
      }
    }
  } catch {}
  return item;
}

export function markAsRead(id: string): void {
  const all = readAll();
  const next = all.map((n) => (n.id === id ? { ...n, read: true } : n));
  writeAll(next);
}

export function markAllAsRead(): void {
  const all = readAll();
  const next = all.map((n) => ({ ...n, read: true }));
  writeAll(next);
}

export function clearNotification(id: string): void {
  const all = readAll();
  writeAll(all.filter((n) => n.id !== id));
}

export function clearAll(): void {
  writeAll([]);
}

/**
 * Suscríbete a cambios. Devuelve unsubscribe.
 * El bell + sidebar usan esto para refrescar count.
 */
export function onChange(cb: () => void): () => void {
  LISTENERS.add(cb);
  // También escuchar cambios cross-tab via storage event
  const storageHandler = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', storageHandler);
  }
  return () => {
    LISTENERS.delete(cb);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', storageHandler);
    }
  };
}
