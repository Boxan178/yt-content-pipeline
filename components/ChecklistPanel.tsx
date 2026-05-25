'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChecklistItem } from '@/lib/parse-checkboxes';
import type { VideoContext } from '@/lib/prompts';
import { ChecklistItemRow } from './ChecklistItemRow';

interface Props {
  items: ChecklistItem[];
  ctx: VideoContext;
  /** Miniaturas disponibles en _PACKAGING/MINIATURAS/ — se cascade al DecisionModal
   *  cuando un item tipa como `thumbnail_pick`. */
  thumbnailOptions?: Array<{ name: string; url: string }>;
  onResolved?: () => void;
}

export function ChecklistPanel({ items, ctx, thumbnailOptions, onResolved }: Props) {
  const folder = ctx.folderPath.replace(/\\/g, '/');
  const [order, setOrder] = useState<string[] | null>(null);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);

  // Cargar orden personalizado
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/checklist-order?folder=${encodeURIComponent(folder)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.ok) setOrder(data.order ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [folder]);

  const persistOrder = useCallback(
    (next: string[]) => {
      setOrder(next);
      fetch(`/api/checklist-order?folder=${encodeURIComponent(folder)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: next }),
      }).catch(() => {});
    },
    [folder],
  );

  const { sortedPending, done } = useMemo(() => {
    const p = items.filter((i) => !i.done);
    const d = items.filter((i) => i.done);
    // Aplicar orden si existe
    if (order && order.length > 0) {
      const idx: Record<string, number> = {};
      order.forEach((k, i) => { idx[k] = i; });
      p.sort((a, b) => {
        const ai = idx[a.text] ?? 1e9;
        const bi = idx[b.text] ?? 1e9;
        return ai - bi;
      });
    }
    return { sortedPending: p, done: d };
  }, [items, order]);

  const handleDragStart = (e: React.DragEvent, key: string) => {
    setDraggedKey(key);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/x-ytcp-checklist', key);
  };
  const handleDropOn = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    const srcKey = draggedKey || e.dataTransfer.getData('text/x-ytcp-checklist');
    if (!srcKey || srcKey === targetKey) return;
    const currentOrder = sortedPending.map((p) => p.text);
    const srcIdx = currentOrder.indexOf(srcKey);
    const tgtIdx = currentOrder.indexOf(targetKey);
    if (srcIdx < 0 || tgtIdx < 0) return;
    const next = [...currentOrder];
    next.splice(srcIdx, 1);
    next.splice(tgtIdx, 0, srcKey);
    persistOrder(next);
    setDraggedKey(null);
  };

  if (items.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-bg/40 p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Checklist
        </h3>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-1.5 py-0.5 text-yellow-300">
            {sortedPending.length} pendientes
          </span>
          <span className="rounded-full border border-green-500/40 bg-green-500/10 px-1.5 py-0.5 text-green-300">
            {done.length} hechos
          </span>
          {order && order.length > 0 && (
            <button
              onClick={() => persistOrder([])}
              className="rounded border border-border bg-bg px-1.5 py-0.5 text-muted hover:text-white"
              title="Volver al orden original del packaging.md"
            >
              ↺
            </button>
          )}
        </div>
      </header>

      {sortedPending.length === 0 ? (
        <p className="rounded border border-dashed border-green-500/30 bg-green-500/5 px-3 py-3 text-center text-xs text-green-300">
          ✓ Sin pendientes
        </p>
      ) : (
        <ul className="space-y-1.5">
          {sortedPending.map((item) => (
            <li
              key={item.text}
              draggable
              onDragStart={(e) => handleDragStart(e, item.text)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDropOn(e, item.text)}
              className={`transition ${draggedKey === item.text ? 'opacity-50' : ''}`}
            >
              <ChecklistItemRow
                item={item}
                ctx={ctx}
                thumbnailOptions={thumbnailOptions}
                onResolved={onResolved}
              />
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-muted hover:text-zinc-300">
            Ya hechos ({done.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {done.map((item, idx) => (
              <li
                key={`done:${idx}:${item.text.slice(0, 40)}`}
                className="flex items-start gap-2 px-1 text-[11px] text-zinc-500"
              >
                <span className="mt-0.5 text-green-500">✓</span>
                <span className="flex-1 leading-snug line-through decoration-zinc-700">{item.text}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
