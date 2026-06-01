'use client';

import { useEffect, useMemo, useState } from 'react';
import { planForDecision, type DecisionKind, type DecisionPlan } from '@/lib/decision-types';

interface Props {
  itemText: string;
  /** Path absoluto de la carpeta del vídeo. */
  videoFolder: string;
  /** Lista de miniaturas disponibles si la decisión es thumbnail_pick. */
  thumbnailOptions?: Array<{ name: string; url: string }>;
  /** Override del tipo de decisión (para decisiones de packaging ya tipadas). */
  presetKind?: DecisionKind;
  /** Override de opciones (candidatos extraídos del packaging.md). */
  presetOptions?: string[];
  /** Override de la pregunta mostrada. */
  presetQuestion?: string;
  /** Recomendación del equipo a mostrar como pista. */
  presetRecommendation?: string;
  /** Línea de Estado del packaging.md a voltear al resolver (decisiones libres). */
  statusAnchor?: string;
  onClose: () => void;
  onResolved?: () => void;
}

export function DecisionModal({
  itemText,
  videoFolder,
  thumbnailOptions,
  presetKind,
  presetOptions,
  presetQuestion,
  presetRecommendation,
  statusAnchor,
  onClose,
  onResolved,
}: Props) {
  const plan = useMemo<DecisionPlan>(() => {
    if (presetKind) {
      return {
        kind: presetKind,
        question: presetQuestion ?? 'Elige una opción',
        options: presetOptions,
        hint: presetRecommendation ? `Recomendación del equipo: ${presetRecommendation}` : undefined,
      };
    }
    return planForDecision(itemText);
  }, [itemText, presetKind, presetOptions, presetQuestion, presetRecommendation]);
  const [decision, setDecision] = useState('');
  const [rationale, setRationale] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ESC para cerrar + scroll-lock del body mientras está montado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
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
          statusAnchor: statusAnchor || undefined,
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
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="glass-premium flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px]"
      >
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="font-display text-lg font-semibold tracking-display text-white">
            Tu decisión
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            title="Cerrar (Esc)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-label text-yellow-300/70">
              Item del checklist
            </p>
            <p className="mt-1 break-words text-sm text-zinc-200">{itemText}</p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-white">{plan.question}</p>
            {plan.hint && <p className="mb-3 text-xs text-zinc-500">{plan.hint}</p>}

            {plan.kind === 'choice' && plan.options && (
              <div className="space-y-1.5">
                {plan.options.map((opt) => (
                  <label
                    key={opt}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-2xl border px-3 py-2.5 text-sm transition ${
                      decision === opt
                        ? 'border-accent/60 bg-accent/10 text-white'
                        : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'
                    }`}
                  >
                    <input
                      type="radio"
                      name="choice"
                      value={opt}
                      checked={decision === opt}
                      onChange={() => setDecision(opt)}
                      className="mt-0.5 accent-accent"
                    />
                    <span className="min-w-0 flex-1 break-words">{opt}</span>
                  </label>
                ))}
                <p className="mt-2 text-[10px] text-zinc-500">¿Ninguna de estas? Escribe tu propia abajo.</p>
              </div>
            )}

            {plan.kind === 'yes_no' && (
              <div className="flex gap-2">
                {(['Sí', 'No'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setDecision(v)}
                    className={`flex-1 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                      decision === v
                        ? v === 'Sí'
                          ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                          : 'border-red-500/60 bg-red-500/15 text-red-200'
                        : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'
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
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white transition [color-scheme:dark] focus:border-accent/60 focus:bg-white/10 focus:outline-none"
              />
            )}

            {plan.kind === 'thumbnail_pick' && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(thumbnailOptions ?? []).length === 0 ? (
                  <p className="col-span-full rounded-2xl border border-white/10 bg-white/5 px-3 py-4 text-xs text-zinc-500">
                    No hay miniaturas en _PACKAGING/MINIATURAS/. Genera primero con NORA + IRIS.
                  </p>
                ) : (
                  (thumbnailOptions ?? []).map((t) => (
                    <button
                      key={t.name}
                      onClick={() => setDecision(t.name)}
                      className={`overflow-hidden rounded-2xl border transition ${
                        decision === t.name
                          ? 'border-accent ring-2 ring-accent/40'
                          : 'border-white/10 hover:border-white/30'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={t.url} alt={t.name} className="aspect-video w-full bg-black object-contain" />
                      <p className="line-clamp-1 px-2 py-1 text-[10px] text-zinc-300">{t.name}</p>
                    </button>
                  ))
                )}
              </div>
            )}

            {plan.kind === 'free_text' && (
              <>
                {plan.guide && plan.guide.length > 0 && (
                  <ul className="mb-2 list-inside list-disc space-y-0.5 text-xs text-zinc-500">
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
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 transition focus:border-accent/60 focus:bg-white/10 focus:outline-none"
                />
              </>
            )}

            {plan.kind !== 'free_text' && (
              <div className="mt-3">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-label text-zinc-500">
                  Tu decisión final (puedes editar)
                </p>
                <input
                  type="text"
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                  placeholder="Selecciona arriba o escribe aquí…"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 transition focus:border-accent/60 focus:bg-white/10 focus:outline-none"
                />
              </div>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-label text-zinc-500">
              Razón (opcional)
            </p>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={2}
              placeholder="¿Por qué esta decisión? — opcional"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 transition focus:border-accent/60 focus:bg-white/10 focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
          <button
            onClick={onClose}
            disabled={busy}
            className="btn-glass disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={busy || !decision.trim()}
            className="btn-gold disabled:opacity-50"
          >
            {busy ? 'Guardando…' : 'Confirmar decisión'}
          </button>
        </footer>
      </div>
    </div>
  );
}
