'use client';

// Editor de cadencia editorial de UN canal (N/semana + días preferidos). Extraído
// de app/calendar/page.tsx para reutilizarlo también en el modal "Explorar ideas"
// (components/ExploreIdeasModal). Fuente única → cero divergencia entre los dos sitios.
//
// Persiste vía /api/calendar/cadence (lib/channel-cadence.ts → channel-cadence.json),
// la MISMA cadencia que consume la detección de huecos del calendario.

import { useState } from 'react';
import { WEEKDAY_LABELS } from '@/lib/calendar-types';

/** Patch que viaja al PUT /api/calendar/cadence. */
export interface CadenceCfg {
  channel: string;
  enabled: boolean;
  targetPerWeek: number;
  preferredWeekdays?: number[];
  hour?: number;
}

/** Fila de canal devuelta por GET /api/calendar/cadence. */
export interface CadenceChannel {
  slug: string;
  name: string;
  color: string;
  autoPipeline: boolean;
  cadence: CadenceCfg | null;
}

export function CadenceRow({ ch, onSave }: { ch: CadenceChannel; onSave: (patch: CadenceCfg) => void }) {
  const [target, setTarget] = useState<number>(ch.cadence?.targetPerWeek ?? 0);
  const [weekdays, setWeekdays] = useState<number[]>(ch.cadence?.preferredWeekdays ?? []);
  const [enabled, setEnabled] = useState<boolean>(ch.cadence?.enabled ?? true);
  const dirty =
    target !== (ch.cadence?.targetPerWeek ?? 0) ||
    enabled !== (ch.cadence?.enabled ?? true) ||
    JSON.stringify(weekdays) !== JSON.stringify(ch.cadence?.preferredWeekdays ?? []);

  const toggleDay = (d: number) =>
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-200">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ch.color }} />
          {ch.name}
        </span>
        <label className="flex items-center gap-1.5 text-[10px] text-zinc-400">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-[#c9a96a]" />
          activa
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          <span>/sem</span>
          <input
            type="number"
            min={0}
            max={14}
            value={target}
            onChange={(e) => setTarget(Math.max(0, Math.min(14, Number(e.target.value) || 0)))}
            className="w-14 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white accent-[#c9a96a] focus:border-accent/60 focus:outline-none"
          />
        </label>
        <div className="flex gap-0.5">
          {WEEKDAY_LABELS.map((lbl, d) => (
            <button
              key={d}
              onClick={() => toggleDay(d)}
              className={`h-6 w-6 rounded-md text-[10px] font-medium transition ${
                weekdays.includes(d)
                  ? 'bg-[color:var(--accent)]/20 text-accent'
                  : 'bg-white/5 text-zinc-500 hover:text-zinc-300'
              }`}
              title={`Día preferido: ${lbl}`}
            >
              {lbl}
            </button>
          ))}
        </div>
        <button
          onClick={() => onSave({ channel: ch.slug, enabled, targetPerWeek: target, preferredWeekdays: weekdays })}
          disabled={!dirty}
          className="ml-auto rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] text-accent transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}
