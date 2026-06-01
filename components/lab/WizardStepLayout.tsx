'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { WizardProgress } from './WizardProgress';
import type { WizardStep } from '@/lib/lab/types';

interface WizardStepLayoutProps {
  step: WizardStep;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** href anterior (paso N-1). Si null/undefined, no se pinta. */
  prevHref?: string | null;
  /** href siguiente (paso N+1). Si null/undefined, no se pinta. */
  nextHref?: string | null;
  /** Si true, deshabilita "Siguiente" hasta que termine algo en `children`. */
  nextDisabled?: boolean;
  /** Texto override del botón siguiente. */
  nextLabel?: string;
  /** Callback opcional disparado al pulsar siguiente (después de la navegación). */
  onNext?: () => void;
}

/**
 * Wizard step layout — Liquid Glass refresh 2026-05-27.
 *
 * Estructura común de cada paso del wizard. Header sticky con progress + title;
 * footer sticky con prev/next; main scrollable. Surfaces .glass y CTAs magenta
 * (excepto el "Atrás" que es .btn-glass neutro).
 */
export function WizardStepLayout({
  step,
  title,
  subtitle,
  children,
  prevHref,
  nextHref,
  nextDisabled,
  nextLabel = 'Siguiente',
  onNext,
}: WizardStepLayoutProps) {
  // Guard transitorio: tras pulsar "Siguiente" lo deshabilitamos para evitar
  // doble-avance (doble click → router.push duplicado / desincronización).
  const [navigating, setNavigating] = useState(false);
  return (
    <div className="flex h-full flex-col">
      {/* Header sticky con glass surface */}
      <header className="sticky top-0 z-10 px-6 pb-3 pt-4">
        <div className="glass rounded-[28px] px-6 py-4">
          <WizardProgress current={step} />
          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-[11px] font-medium uppercase tracking-label text-fuchsia-300/80">
              Paso {step} de 5
            </span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-display text-white">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
              {subtitle}
            </p>
          )}
        </div>
      </header>

      {/* Contenido scrollable */}
      <main className="flex-1 overflow-auto px-6 py-6">{children}</main>

      {/* Footer con CTA magenta y atrás glass */}
      <footer className="sticky bottom-0 z-10 px-6 pt-3 pb-4">
        <div className="glass flex items-center justify-between rounded-[28px] px-6 py-3">
          <div>
            {prevHref ? (
              <Link
                href={prevHref}
                className="btn-glass inline-flex items-center gap-2"
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
                  <path d="M19 12H5M12 5l-7 7 7 7" />
                </svg>
                Atrás
              </Link>
            ) : (
              <span />
            )}
          </div>
          <div>
            {nextHref ? (
              nextDisabled || navigating ? (
                <button
                  disabled
                  className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 font-medium text-zinc-600"
                >
                  {nextLabel}
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
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              ) : onNext ? (
                // Navegación programática (onNext hace router.push). Antes era un
                // <Link href="#"> que además saltaba al hash (#) → scroll-to-top
                // + entrada basura en historial. Un <button> evita ese salto.
                <button
                  type="button"
                  onClick={() => { setNavigating(true); onNext(); }}
                  className="inline-flex items-center gap-2 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/20 px-5 py-2 font-medium text-fuchsia-200 backdrop-blur-md transition hover:bg-fuchsia-500/30"
                  style={{
                    boxShadow:
                      'inset 0 1px 0 0 rgba(255,255,255,0.18), 0 0 24px -6px rgba(217,70,239,0.45)',
                  }}
                >
                  {nextLabel}
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
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <Link
                  href={nextHref}
                  onClick={() => setNavigating(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/20 px-5 py-2 font-medium text-fuchsia-200 backdrop-blur-md transition hover:bg-fuchsia-500/30"
                  style={{
                    boxShadow:
                      'inset 0 1px 0 0 rgba(255,255,255,0.18), 0 0 24px -6px rgba(217,70,239,0.45)',
                  }}
                >
                  {nextLabel}
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
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </Link>
              )
            ) : (
              <span />
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
