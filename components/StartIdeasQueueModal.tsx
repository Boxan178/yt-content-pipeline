'use client';

import { useEffect, useState } from 'react';
import type { Idea } from '@/lib/lab/types';

interface Props {
  channelSlug: string;
  channelName: string;
  ideas: Idea[];
  onClose: () => void;
  /** Tras encolar: (enqueued, skipped). */
  onStarted: (enqueued: number, skipped: number) => void;
}

/**
 * Modal para elegir QUÉ ideas meter en la cola de producción. Por defecto todas
 * seleccionadas; Pablo puede dejar solo 2-3. POST a .../ideas/start-queue con
 * el subconjunto de ideaIds. La cola las procesa una detrás de otra.
 */
export function StartIdeasQueueModal({ channelSlug, channelName, ideas, onClose, onStarted }: Props) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(ideas.map((i) => i.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const allSelected = picked.size === ideas.length;

  const start = async () => {
    if (picked.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/channels/${encodeURIComponent(channelSlug)}/ideas/start-queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaIds: Array.from(picked) }),
      });
      const data = await r.json();
      if (!r.ok && !data.ok) throw new Error(data.error || `HTTP ${r.status}`);
      onStarted(data.enqueued ?? 0, data.skipped ?? 0);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="glass-premium flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-display text-white">Empezar cola de producción</h2>
            <p className="text-xs text-zinc-400">{channelName} · SARA produce las elegidas una detrás de otra (~20-30 min c/u)</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-zinc-400 hover:text-white">
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
            <span>{picked.size} de {ideas.length} seleccionadas</span>
            <button
              onClick={() => setPicked(allSelected ? new Set() : new Set(ideas.map((i) => i.id)))}
              className="text-zinc-400 hover:text-white"
            >
              {allSelected ? 'Deseleccionar todas' : 'Seleccionar todas'}
            </button>
          </div>
          <ul className="space-y-2">
            {ideas.map((idea) => {
              const sel = picked.has(idea.id);
              return (
                <li
                  key={idea.id}
                  onClick={() => toggle(idea.id)}
                  className={`cursor-pointer rounded-2xl border p-3 transition ${
                    sel ? 'border-accent/50 bg-accent/10' : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() => toggle(idea.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 h-4 w-4 cursor-pointer rounded border-white/20 bg-white/10 accent-accent"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-sm font-medium text-white">{idea.title}</span>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-400">
                          P{idea.priority}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-400">{idea.description}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {error && (
            <div className="mt-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-white/10 px-6 py-4">
          <p className="text-[11px] text-zinc-500">Si una se bloquea, la cola sigue con la siguiente. Ver progreso en /queue.</p>
          <button onClick={start} disabled={busy || picked.size === 0} className="btn-gold disabled:opacity-50">
            {busy ? 'Encolando…' : `▶ Empezar cola (${picked.size})`}
          </button>
        </footer>
      </div>
    </div>
  );
}
