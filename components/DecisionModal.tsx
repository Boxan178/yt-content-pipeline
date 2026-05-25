'use client';

import { useEffect, useMemo, useState } from 'react';
import { planForDecision } from '@/lib/decision-types';

interface Props {
  itemText: string;
  /** Path absoluto de la carpeta del vídeo. */
  videoFolder: string;
  /** Lista de miniaturas disponibles si la decisión es thumbnail_pick. */
  thumbnailOptions?: Array<{ name: string; url: string }>;
  onClose: () => void;
  onResolved?: () => void;
}

export function DecisionModal({ itemText, videoFolder, thumbnailOptions, onClose, onResolved }: Props) {
  const plan = useMemo(() => planForDecision(itemText), [itemText]);
  const [decision, setDecision] = useState('');
  const [rationale, setRationale] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ESC para cerrar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    if (!decision.trim()) {
      setError('Tienes que escribir o elegir una decisión');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder: videoFolder,
          itemText,
          decision: decision.trim(),
          rationale: rationale.trim() || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setError(data.error || `HTTP ${r.status}`);
      } else {
        onResolved?.();
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-lg font-semibold text-white">Tu decisión</h2>
          <button
            onClick={onClose}
            className="rounded border border-border bg-bg px-2 py-1 text-xs text-muted hover:text-white"
          >
            ✕ Cerrar
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-yellow-300/70">Item del checklist</p>
            <p className="mt-0.5 text-sm text-zinc-200">{itemText}</p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-white">{plan.question}</p>
            {plan.hint && <p className="mb-2 text-xs text-muted">{plan.hint}</p>}

            {plan.kind === 'choice' && plan.options && (
              <div className="space-y-1.5">
                {plan.options.map((opt) => (
                  <label
                    key={opt}
                    className={`flex cursor-pointer items-start gap-2 rounded border px-3 py-2 text-sm transition ${
                      decision === opt
                        ? 'border-accent/60 bg-accent/10 text-white'
                        : 'border-border bg-bg/40 text-zinc-300 hover:border-accent/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="choice"
                      value={opt}
                      checked={decision === opt}
                      onChange={() => setDecision(opt)}
                      className="mt-0.5"
                    />
                    <span className="flex-1">{opt}</span>
                  </label>
                ))}
                <p className="mt-2 text-[10px] text-muted">¿Ninguna de estas? Escribe tu propia abajo.</p>
              </div>
            )}

            {plan.kind === 'yes_no' && (
              <div className="flex gap-2">
                {(['Sí', 'No'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setDecision(v)}
                    className={`flex-1 rounded border px-4 py-3 text-sm font-medium transition ${
                      decision === v
                        ? v === 'Sí'
                          ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                          : 'border-red-500/60 bg-red-500/15 text-red-200'
                        : 'border-border bg-bg/40 text-zinc-300 hover:border-accent/40'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}

            {plan.kind === 'date' && (
              <input
                type="datetime-local"
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
                className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-white focus:border-accent/60 focus:outline-none"
              />
            )}

            {plan.kind === 'thumbnail_pick' && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(thumbnailOptions ?? []).length === 0 ? (
                  <p className="col-span-full text-xs text-muted">
                    No hay miniaturas en _PACKAGING/MINIATURAS/. Genera primero con NORA+IRIS.
                  </p>
                ) : (
                  (thumbnailOptions ?? []).map((t) => (
                    <button
                      key={t.name}
                      onClick={() => setDecision(t.name)}
                      className={`overflow-hidden rounded border transition ${
                        decision === t.name ? 'border-accent ring-2 ring-accent/40' : 'border-border'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={t.url} alt={t.name} className="aspect-video w-full object-contain bg-black" />
                      <p className="line-clamp-1 px-1 py-0.5 text-[10px] text-zinc-300">{t.name}</p>
                    </button>
                  ))
                )}
              </div>
            )}

            {plan.kind === 'free_text' && (
              <>
                {plan.guide && plan.guide.length > 0 && (
                  <ul className="mb-2 list-inside list-disc space-y-0.5 text-xs text-muted">
                    {plan.guide.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                )}
                <textarea
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                  rows={4}
                  placeholder="Tu decisión…"
                  className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-accent/60 focus:outline-none"
                />
              </>
            )}

            {plan.kind !== 'free_text' && (
              <div className="mt-3">
                <p className="mb-1 text-[10px] uppercase tracking-wider text-muted">
                  Tu decisión final (puedes editar)
                </p>
                <input
                  type="text"
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                  placeholder="Selecciona arriba o escribe aquí…"
                  className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-accent/60 focus:outline-none"
                />
              </div>
            )}
          </div>

          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-muted">
              Razón (opcional)
            </p>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={2}
              placeholder="¿Por qué esta decisión? — opcional"
              className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-accent/60 focus:outline-none"
            />
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
            onClick={submit}
            disabled={busy || !decision.trim()}
            className="rounded border border-accent/40 bg-accent/10 px-4 py-1.5 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
          >
            {busy ? 'Guardando…' : '✓ Confirmar decisión'}
          </button>
        </footer>
      </div>
    </div>
  );
}
