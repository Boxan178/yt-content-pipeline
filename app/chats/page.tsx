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

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(
      (c) => c.preview.toLowerCase().includes(q) || c.project.toLowerCase().includes(q),
    );
  }, [chats, search]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">💬 Historial de chats</h1>
        <p className="mt-1 text-sm text-muted">
          Todas las sesiones de claude code guardadas localmente. Vienen del directorio
          <code className="ml-1 text-zinc-400">~/.claude/projects/</code>.
        </p>
      </header>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔎 Buscar en previews…"
        className="mb-4 w-full rounded border border-border bg-bg/40 px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:border-accent/60 focus:outline-none"
      />

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-24 text-center text-muted">
          <p className="text-lg">{chats.length === 0 ? 'No hay sesiones guardadas.' : 'Sin resultados.'}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((c) => (
            <li
              key={c.filePath}
              className="rounded-lg border border-border bg-panel p-3 transition hover:border-accent/60"
            >
              <Link href={`/chats/${c.sessionId}`} className="block">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm text-zinc-200">
                      {c.preview || <span className="text-muted italic">(sin preview)</span>}
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-500">
                      {relTime(c.mtime)} · {c.turns} turnos · {c.sizeKb} KB
                      <span className="ml-2 font-mono text-[9px] text-zinc-600">{c.project}</span>
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted">→</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
