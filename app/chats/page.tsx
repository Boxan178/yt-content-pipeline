'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

interface ChatSummary {
  sessionId: string;
  project: string;
  filePath: string;
  mtime: string;
  sizeKb: number;
  preview: string;
  turns: number;
}

function relTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = (d - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'hace segundos';
  if (abs < 3600) return `hace ${Math.round(abs / 60)} min`;
  if (abs < 86400) return `hace ${Math.round(abs / 3600)} h`;
  if (abs < 86400 * 30) return `hace ${Math.round(abs / 86400)} días`;
  return new Date(iso).toLocaleDateString('es-ES');
}

export default function ChatsPage() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/chats', { cache: 'no-store' });
      const data = await r.json();
      if (data.ok) setChats(data.chats);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(
      (c) => c.preview.toLowerCase().includes(q) || c.project.toLowerCase().includes(q),
    );
  }, [chats, search]);

  return (
    <main className="mx-auto max-w-4xl px-8 pb-12 pt-2">
      <header className="mb-8 flex items-start gap-3">
        <span className="text-accent opacity-80 mt-1">
          <IconChat />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-display text-white mb-2">
            Historial de chats
          </h1>
          <p className="text-sm text-zinc-400">
            Todas las sesiones de claude code guardadas localmente. Vienen del directorio{' '}
            <code className="font-mono text-[11px] text-zinc-300">~/.claude/projects/</code>.
          </p>
        </div>
      </header>

      <div className="glass relative mb-6 rounded-full">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
          <IconSearch />
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar en previews…"
          className="w-full bg-transparent rounded-full pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
        </div>
      ) : visible.length === 0 ? (
        <div className="glass rounded-3xl py-24 text-center">
          <p className="font-display text-lg text-zinc-300">
            {chats.length === 0 ? 'No hay sesiones guardadas.' : 'Sin resultados.'}
          </p>
        </div>
      ) : (
        <div className="glass rounded-3xl overflow-hidden">
          <header className="border-b border-white/10 px-4 py-3 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-label text-zinc-500">
              Sesiones
            </span>
            <span className="nums text-[10px] text-zinc-500">
              {visible.length}{search ? ` de ${chats.length}` : ''} total
            </span>
          </header>
          <ul>
            {visible.map((c) => (
              <li key={c.filePath} className="border-b border-white/5 last:border-b-0">
                <Link
                  href={`/chats/${c.sessionId}`}
                  className="group flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm text-zinc-200">
                      {c.preview || <span className="text-zinc-500 italic">(sin preview)</span>}
                    </p>
                    <p className="nums mt-1 text-[10px] text-zinc-500">
                      {relTime(c.mtime)} · {c.turns} turnos · {c.sizeKb} KB
                      <span className="ml-2 font-mono text-[10px] text-zinc-600">{c.project}</span>
                    </p>
                  </div>
                  <span className="shrink-0 text-zinc-500 transition group-hover:text-accent">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}

function IconChat() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9 8.5 8.5 0 0 1 8.5 8.5z" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
