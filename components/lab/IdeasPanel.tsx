'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Idea } from '@/lib/lab/types';

interface Props {
  initialIdeas: Idea[];
}

type Tab = 'bank' | 'assigned';

/**
 * Ideas panel — Liquid Glass refresh 2026-05-27.
 *
 * Tabs glass (banco vs asignadas), form glass para crear, listado glass con
 * priority pill + tags chips. Magenta accent en el tab activo.
 */
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

  const visible = ideas.filter((i) =>
    tab === 'bank' ? i.channelId === null : i.channelId !== null,
  );

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

  const canCreate =
    form.title.trim().length >= 3 &&
    form.description.trim().length >= 5 &&
    !creating;

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-2">
        <TabBtn
          label={`Banco (${ideas.filter((i) => i.channelId === null).length})`}
          active={tab === 'bank'}
          onClick={() => setTab('bank')}
        />
        <TabBtn
          label={`Asignadas (${ideas.filter((i) => i.channelId !== null).length})`}
          active={tab === 'assigned'}
          onClick={() => setTab('assigned')}
        />
      </div>

      {/* Form crear */}
      <div className="glass rounded-[24px] p-5">
        <h4 className="mb-3 text-[11px] font-medium uppercase tracking-label text-fuchsia-300/80">
          Crear idea
        </h4>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <input
            type="text"
            placeholder="Título (mín 3 chars)"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className={INPUT_CLS}
          />
          <input
            type="text"
            placeholder="Canal (slug o uuid de draft) — vacío = Banco"
            value={form.channelId}
            onChange={(e) => setForm({ ...form, channelId: e.target.value })}
            className={INPUT_CLS}
          />
        </div>
        <textarea
          placeholder="Descripción (1-3 párrafos)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
          className={`mt-2 ${INPUT_CLS}`}
        />
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
          <input
            type="text"
            placeholder="Tags (separados por coma)"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            className={INPUT_CLS}
          />
          <select
            value={form.priority}
            onChange={(e) =>
              setForm({
                ...form,
                priority: Number(e.target.value) as 1 | 2 | 3 | 4 | 5,
              })
            }
            className={INPUT_CLS}
          >
            <option value={1}>Prioridad 1 (baja)</option>
            <option value={2}>Prioridad 2</option>
            <option value={3}>Prioridad 3 (media)</option>
            <option value={4}>Prioridad 4</option>
            <option value={5}>Prioridad 5 (top)</option>
          </select>
        </div>
        {err && (
          <div className="mt-3 rounded-2xl border border-red-500/40 bg-red-500/5 p-3 text-xs text-red-300">
            <span className="font-medium">Error:</span> {err}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={create}
            disabled={!canCreate}
            className={
              canCreate
                ? 'inline-flex items-center gap-2 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/20 px-4 py-1.5 text-sm font-medium text-fuchsia-200 backdrop-blur-md transition hover:bg-fuchsia-500/30'
                : 'inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-sm font-medium text-zinc-600'
            }
            style={
              canCreate
                ? {
                    boxShadow:
                      'inset 0 1px 0 0 rgba(255,255,255,0.18), 0 0 16px -4px rgba(217,70,239,0.45)',
                  }
                : undefined
            }
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            {creating ? 'Creando…' : 'Crear idea'}
          </button>
        </div>
      </div>

      {/* Listado */}
      {visible.length === 0 ? (
        <div className="glass flex flex-col items-center gap-2 rounded-[24px] px-6 py-10 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z" />
            </svg>
          </div>
          <p className="text-sm text-zinc-500">
            {tab === 'bank'
              ? 'El banco está vacío.'
              : 'No hay ideas asignadas a canal todavía.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((i) => (
            <li key={i.id} className="glass glass-hover rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-baseline gap-2">
                    <span className="font-display text-sm font-medium tracking-display text-white">
                      {i.title}
                    </span>
                    <PriorityPill priority={i.priority} />
                  </div>
                  <p className="text-xs leading-relaxed text-zinc-400">
                    {i.description}
                  </p>
                  {i.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {i.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-400"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {i.channelId && (
                    <p className="mt-2 font-mono text-[10px] text-fuchsia-300">
                      → canal: {i.channelId}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(i.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-500 hover:border-red-500/30 hover:text-red-400"
                  title="Eliminar"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const INPUT_CLS =
  'w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-fuchsia-500/40 focus:bg-white/[0.06] focus:outline-none';

function TabBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-xs font-medium transition ${
        active
          ? 'border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-200'
          : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:border-white/20 hover:text-white'
      }`}
      style={
        active
          ? { boxShadow: '0 0 12px -2px rgba(217,70,239,0.4)' }
          : undefined
      }
    >
      {label}
    </button>
  );
}

function PriorityPill({ priority }: { priority: 1 | 2 | 3 | 4 | 5 }) {
  const intensity = priority >= 4 ? 'high' : priority === 3 ? 'mid' : 'low';
  const cls =
    intensity === 'high'
      ? 'border-fuchsia-500/40 bg-fuchsia-500/14 text-fuchsia-300'
      : intensity === 'mid'
      ? 'border-white/10 bg-white/[0.04] text-zinc-300'
      : 'border-white/10 bg-white/[0.04] text-zinc-500';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}
    >
      P{priority}
    </span>
  );
}
