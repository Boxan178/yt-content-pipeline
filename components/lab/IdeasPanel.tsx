'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Idea } from '@/lib/lab/types';

interface Props {
  initialIdeas: Idea[];
}

type Tab = 'bank' | 'assigned';

export function IdeasPanel({ initialIdeas }: Props) {
  const [ideas, setIdeas] = useState<Idea[]>(initialIdeas);
  const [tab, setTab] = useState<Tab>('bank');
  const router = useRouter();
  const [form, setForm] = useState({
    title: '',
    description: '',
    tags: '',
    channelId: '',
    priority: 3 as 1 | 2 | 3 | 4 | 5,
  });
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const visible = ideas.filter((i) => (tab === 'bank' ? i.channelId === null : i.channelId !== null));

  async function create() {
    setErr(null);
    setCreating(true);
    try {
      const r = await fetch('/api/lab/ideas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          tags: form.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          channelId: form.channelId.trim() || null,
          priority: form.priority,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setIdeas([j.idea, ...ideas]);
      setForm({ title: '', description: '', tags: '', channelId: '', priority: 3 });
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar esta idea?')) return;
    const r = await fetch(`/api/lab/ideas/${id}`, { method: 'DELETE' });
    if (!r.ok) return;
    setIdeas(ideas.filter((i) => i.id !== id));
  }

  const canCreate = form.title.trim().length >= 3 && form.description.trim().length >= 5 && !creating;

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-2">
        <TabBtn label={`Banco (${ideas.filter((i) => i.channelId === null).length})`} active={tab === 'bank'} onClick={() => setTab('bank')} />
        <TabBtn label={`Asignadas (${ideas.filter((i) => i.channelId !== null).length})`} active={tab === 'assigned'} onClick={() => setTab('assigned')} />
      </div>

      {/* Form crear */}
      <div className="rounded-md border border-border bg-panel/40 p-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">
          Crear idea
        </h4>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <input
            type="text"
            placeholder="Título (mín 3 chars)"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-white focus:border-accent"
          />
          <input
            type="text"
            placeholder="Canal (slug o uuid de draft) — vacío = Banco"
            value={form.channelId}
            onChange={(e) => setForm({ ...form, channelId: e.target.value })}
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-white focus:border-accent"
          />
        </div>
        <textarea
          placeholder="Descripción (1-3 párrafos)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
          className="mt-2 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-white focus:border-accent"
        />
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
          <input
            type="text"
            placeholder="Tags (separados por coma)"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-white focus:border-accent"
          />
          <select
            value={form.priority}
            onChange={(e) =>
              setForm({ ...form, priority: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 })
            }
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-white focus:border-accent"
          >
            <option value={1}>Prioridad 1 (baja)</option>
            <option value={2}>Prioridad 2</option>
            <option value={3}>Prioridad 3 (media)</option>
            <option value={4}>Prioridad 4</option>
            <option value={5}>Prioridad 5 (top)</option>
          </select>
        </div>
        {err && (
          <div className="mt-2 rounded border border-red-700/60 bg-red-900/20 p-2 text-xs text-red-300">
            Error: {err}
          </div>
        )}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={create}
            disabled={!canCreate}
            className={`rounded-md border px-4 py-1.5 text-xs font-semibold ${
              canCreate
                ? 'border-accent/60 bg-accent/20 text-accent hover:bg-accent/30'
                : 'cursor-not-allowed border-border bg-panel text-zinc-600'
            }`}
          >
            {creating ? 'Creando…' : '+ Crear idea'}
          </button>
        </div>
      </div>

      {/* Listado */}
      {visible.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {tab === 'bank' ? 'El banco está vacío.' : 'No hay ideas asignadas a canal todavía.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((i) => (
            <li key={i.id} className="rounded-md border border-border bg-panel p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white">
                    {i.title}
                    <span className="ml-2 inline-block rounded-full bg-bg px-2 py-0.5 text-[10px] text-zinc-500">
                      P{i.priority}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-400">{i.description}</div>
                  {i.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {i.tags.map((t) => (
                        <span key={t} className="rounded-full bg-bg px-2 py-0.5 text-[10px] text-zinc-400">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {i.channelId && (
                    <div className="mt-1 text-[10px] text-accent">→ canal: {i.channelId}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(i.id)}
                  className="text-xs text-zinc-500 hover:text-red-400"
                  title="Eliminar"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? 'border-accent/60 bg-accent/20 text-accent'
          : 'border-border bg-panel text-zinc-400 hover:border-zinc-500 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}
