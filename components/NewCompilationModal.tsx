'use client';

import { useEffect, useMemo, useState } from 'react';
import type { VideoCardData } from './VideoCard';

interface Props {
  channelSlug: string;
  channelName: string;
  videos: VideoCardData[];
  onClose: () => void;
  onCreated: (info: { folderName: string; folderPath: string }) => void;
}

const MAX_DEFAULT = 5;

export function NewCompilationModal({ channelSlug, channelName, videos, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState<1 | 2>(1);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...videos].sort((a, b) => a.title.localeCompare(b.title, 'es')),
    [videos],
  );

  const togglePick = (folder: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  const create = async () => {
    setError(null);
    if (!title.trim()) {
      setError('Necesitas un título');
      return;
    }
    if (picked.size < 2) {
      setError('Selecciona al menos 2 historias');
      return;
    }
    setBusy(true);
    try {
      const sources = sorted
        .filter((v) => picked.has(v.folderPath.replace(/\\/g, '/')))
        .map((v) => ({ folderPath: v.folderPath.replace(/\\/g, '/'), title: v.title }));
      const r = await fetch(`/api/channels/${encodeURIComponent(channelSlug)}/compilations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), level, sources }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setError(data.error || `HTTP ${r.status}`);
      } else {
        onCreated(data.compilation);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  // ESC para cerrar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-lg font-semibold text-white">
            📚 Nueva recopilación · {channelName}
          </h2>
          <button
            onClick={onClose}
            className="rounded border border-border bg-bg px-2 py-1 text-xs text-muted hover:text-white"
          >
            ✕ Cerrar
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted">
              Título
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='Ej. "5 historias estoicas para dormir profundo"'
              className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-white focus:border-accent/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted">
              Nivel
            </label>
            <div className="flex gap-2">
              {[1, 2].map((lv) => (
                <button
                  key={lv}
                  onClick={() => setLevel(lv as 1 | 2)}
                  className={`flex-1 rounded border px-3 py-2 text-sm transition ${
                    level === lv
                      ? 'border-accent/60 bg-accent/10 text-accent'
                      : 'border-border bg-bg text-zinc-300 hover:border-accent/40'
                  }`}
                >
                  Nivel {lv}{lv === 1 ? ' (historias individuales)' : ' (recopilaciones de recopilaciones)'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted">
              <span>Selecciona historias · {picked.size} marcadas</span>
              <span className="text-[10px]">recomendado: {MAX_DEFAULT}</span>
            </label>
            <div className="max-h-72 overflow-y-auto rounded border border-border bg-bg/40">
              {sorted.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted">No hay vídeos en este canal.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {sorted.map((v) => {
                    const folder = v.folderPath.replace(/\\/g, '/');
                    const isPicked = picked.has(folder);
                    return (
                      <li key={folder}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-bg/60">
                          <input
                            type="checkbox"
                            checked={isPicked}
                            onChange={() => togglePick(folder)}
                            className="h-4 w-4 cursor-pointer"
                          />
                          <span className="flex-1 truncate text-sm text-zinc-200">{v.title}</span>
                          <span className="shrink-0 text-[10px] text-muted">{v.state}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border bg-bg/40 px-5 py-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded border border-border bg-bg px-3 py-1.5 text-sm text-muted hover:text-white disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={create}
            disabled={busy || picked.size < 2 || !title.trim()}
            className="rounded border border-accent/40 bg-accent/10 px-4 py-1.5 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
          >
            {busy ? 'Creando…' : 'Crear recopilación'}
          </button>
        </footer>
      </div>
    </div>
  );
}
