'use client';

import type { ReactNode } from 'react';
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

export function WizardStepLayout({
  step,
  title,
  subtitle,
  children,
  prevHref,
  nextHref,
  nextDisabled,
  nextLabel = 'Siguiente →',
  onNext,
}: WizardStepLayoutProps) {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-panel/40 px-6 py-4">
        <WizardProgress current={step} />
        <h1 className="mt-3 text-xl font-bold text-white">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>
        )}
      </header>

      <main className="flex-1 overflow-auto px-6 py-6">{children}</main>

      <footer className="flex items-center justify-between border-t border-border bg-panel/40 px-6 py-3">
        <div>
          {prevHref ? (
            <Link
              href={prevHref}
              className="rounded-md border border-border bg-bg px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              ← Atrás
            </Link>
          ) : (
            <span />
          )}
        </div>
        <div>
          {nextHref ? (
            nextDisabled ? (
              <button
                disabled
                className="cursor-not-allowed rounded-md border border-border bg-panel px-4 py-2 text-sm text-zinc-600"
              >
                {nextLabel}
              </button>
            ) : (
              <Link
                href={nextHref}
                onClick={onNext}
                className="rounded-md border border-accent/60 bg-accent/20 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/30"
              >
                {nextLabel}
              </Link>
            )
          ) : (
            <span />
          )}
        </div>
      </footer>
    </div>
  );
}
