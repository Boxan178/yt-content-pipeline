'use client';

import { useState } from 'react';

export type ClaudeModel = 'sonnet' | 'opus';
export type ClaudeEffort = 'low' | 'medium' | 'high' | 'max';

interface Props {
  /** Modelo actualmente activo (default del prompt builder). */
  model: ClaudeModel;
  /** Effort actualmente activo. */
  effort?: ClaudeEffort;
  /** Si el usuario override-ó el modelo, lo guarda aquí. null = usar default. */
  onChange: (next: { model?: ClaudeModel; effort?: ClaudeEffort }) => void;
  /** Modelo y effort override actuales (null si no hay override). */
  modelOverride: ClaudeModel | null;
  effortOverride: ClaudeEffort | null;
  compact?: boolean;
}

const MODELS: ClaudeModel[] = ['sonnet', 'opus'];
const EFFORTS: ClaudeEffort[] = ['low', 'medium', 'high', 'max'];

const MODEL_COLOR: Record<ClaudeModel, string> = {
  sonnet: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
  opus: 'border-purple-500/40 bg-purple-500/10 text-purple-300',
};

const EFFORT_COLOR: Record<ClaudeEffort, string> = {
  low: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300',
  medium: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
  high: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  max: 'border-red-500/40 bg-red-500/10 text-red-300',
};

function cycleNext<T>(arr: readonly T[], current: T): T {
  const idx = arr.indexOf(current);
  return arr[(idx + 1) % arr.length];
}

/**
 * Picker compacto inline. Dos chips: modelo y effort.
 * Click en chip → cicla a la siguiente opción.
 * Si el chip está override, se ve con borde sólido. Si es el default, opacidad menor.
 */
export function JobOptionsPicker({
  model,
  effort,
  modelOverride,
  effortOverride,
  onChange,
  compact,
}: Props) {
  const effectiveModel = modelOverride ?? model;
  const effectiveEffort = effortOverride ?? effort ?? 'medium';
  const modelIsOverride = !!modelOverride && modelOverride !== model;
  const effortIsOverride = !!effortOverride && effortOverride !== (effort ?? 'medium');

  const toggleModel = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = cycleNext(MODELS, effectiveModel);
    onChange({ model: next === model ? undefined : next, effort: effortOverride ?? undefined });
  };
  const toggleEffort = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = cycleNext(EFFORTS, effectiveEffort);
    const def = effort ?? 'medium';
    onChange({ model: modelOverride ?? undefined, effort: next === def ? undefined : next });
  };

  return (
    <div className={`flex items-center gap-1 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
      <button
        type="button"
        onClick={toggleModel}
        className={`rounded border px-1.5 py-0.5 font-mono uppercase transition ${MODEL_COLOR[effectiveModel]} ${
          modelIsOverride ? 'ring-1 ring-current' : 'opacity-80 hover:opacity-100'
        }`}
        title={`Modelo · ${effectiveModel}${modelIsOverride ? ' (override)' : ' (default)'} — click para cambiar`}
      >
        {effectiveModel}
      </button>
      <button
        type="button"
        onClick={toggleEffort}
        className={`rounded border px-1.5 py-0.5 font-mono uppercase transition ${EFFORT_COLOR[effectiveEffort]} ${
          effortIsOverride ? 'ring-1 ring-current' : 'opacity-80 hover:opacity-100'
        }`}
        title={`Effort · ${effectiveEffort}${effortIsOverride ? ' (override)' : ' (default)'} — click para cambiar`}
      >
        {effectiveEffort}
      </button>
    </div>
  );
}
