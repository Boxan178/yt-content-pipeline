'use client';

import { useCallback, useEffect, useState } from 'react';
import { CHANNELS } from '@/lib/channels';
import { NotionPollerSection } from '@/components/NotionPollerSection';

interface AppSettings {
  enableConfetti: boolean;
  enableNativeNotifications: boolean;
  pollIntervalMs: number;
  showCompilationBadge: boolean;
  defaultEffortMax: boolean;
  channelNasPaths: Record<string, string>;
  archiveMoveDeleteLocal: boolean;
}

/**
 * Configuración — Liquid Glass refresh 2026-05-27.
 *
 * Página fuera del módulo /lab, así que usa accent gold (no magenta). Toggle
 * rows en glass cards, NAS paths por canal en glass cards. Toggle switch
 * Apple-style con accent gold.
 */
export default function ConfiguracionPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/settings', { cache: 'no-store' });
      const data = await r.json();
      if (data.ok) setSettings(data.settings);
    } catch {}
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (patch: Partial<AppSettings>) => {
    setBusy(true);
    try {
      const r = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await r.json();
      if (data.ok) setSettings(data.settings);
    } catch {}
    setBusy(false);
  };

  if (!settings) {
    return (
      <main className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-8 pb-12 pt-2">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-display text-white">
          Configuración
        </h1>
        <p className="mt-1.5 text-sm text-zinc-400">
          Preferencias de la app. Se guardan en{' '}
          <code className="font-mono text-[12px] text-accent">
            ~/.yt-content-pipeline/settings.json
          </code>
          .
        </p>
      </header>

      <section className="space-y-3">
        <ToggleRow
          label="Confetti al subir de nivel"
          description="Lanza confetti animado cuando subes nivel o desbloqueas un logro."
          value={settings.enableConfetti}
          onChange={(v) => update({ enableConfetti: v })}
          busy={busy}
        />
        <ToggleRow
          label="Notificaciones nativas del sistema"
          description="Avisos del OS (ding) cuando un job termina o sube nivel."
          value={settings.enableNativeNotifications}
          onChange={(v) => update({ enableNativeNotifications: v })}
          busy={busy}
        />
        <ToggleRow
          label="Mostrar badge de recopilación"
          description="Pinta el badge RECOP en las cards de vídeos compuestos."
          value={settings.showCompilationBadge}
          onChange={(v) => update({ showCompilationBadge: v })}
          busy={busy}
        />
        <ToggleRow
          label="Effort 'max' por defecto en jobs nuevos"
          description="Activa effort=max al lanzar un job sin override. Más caro, más profundo."
          value={settings.defaultEffortMax}
          onChange={(v) => update({ defaultEffortMax: v })}
          busy={busy}
        />

        <div className="glass rounded-[24px] p-5">
          <p className="font-display text-sm font-medium tracking-display text-white">
            Refresh del kanban
          </p>
          <p className="mt-1 mb-3 text-xs leading-relaxed text-zinc-400">
            Cada cuántos ms refresca la lista de vídeos. Más rápido = más carga.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={5000}
              max={300000}
              step={5000}
              value={settings.pollIntervalMs}
              onChange={(e) =>
                setSettings((s) =>
                  s ? { ...s, pollIntervalMs: Number(e.target.value) } : s,
                )
              }
              onBlur={(e) =>
                update({ pollIntervalMs: Number(e.currentTarget.value) })
              }
              className="w-32 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-1.5 nums font-mono text-sm text-white focus:border-accent/40 focus:bg-white/[0.06] focus:outline-none"
            />
            <span className="text-xs text-zinc-500">
              ms (<span className="nums">{Math.round(settings.pollIntervalMs / 1000)}</span>s)
            </span>
          </div>
        </div>
      </section>

      {/* Sección: rutas NAS por canal */}
      <section className="mt-8">
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-label text-zinc-500">
          Rutas de archivo en NAS (por canal)
        </h2>
        <p className="mb-4 text-xs leading-relaxed text-zinc-400">
          Cuando muevas un vídeo a <b>_ARCHIVO</b> (arrastrándolo a la columna
          archivados, o vía el botón Archivar), la app copia la carpeta también
          al NAS si tienes una ruta configurada aquí. Útil para liberar espacio
          del disco local sin perder el material.
        </p>
        <div className="space-y-3">
          {CHANNELS.filter((c) => c.enabled).map((c) => {
            const current = settings.channelNasPaths?.[c.slug] ?? '';
            return (
              <div key={c.slug} className="glass rounded-[24px] p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="font-display text-sm font-medium tracking-display text-white">
                    {c.name}
                  </p>
                  <span className="font-mono text-[10px] text-zinc-500">
                    {c.slug}
                  </span>
                </div>
                <input
                  type="text"
                  value={current}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSettings((s) =>
                      s
                        ? {
                            ...s,
                            channelNasPaths: { ...s.channelNasPaths, [c.slug]: v },
                          }
                        : s,
                    );
                  }}
                  onBlur={(e) => {
                    update({
                      channelNasPaths: {
                        ...settings.channelNasPaths,
                        [c.slug]: e.currentTarget.value.trim(),
                      },
                    });
                  }}
                  placeholder="Ej: Z:/ARCHIVO/MS  (deja vacío para no copiar a NAS)"
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 font-mono text-[12px] text-white placeholder:text-zinc-500 focus:border-accent/40 focus:bg-white/[0.06] focus:outline-none"
                />
              </div>
            );
          })}
        </div>
        <div className="mt-3">
          <ToggleRow
            label="Borrar copia local tras mover al NAS"
            description="Si está activo, la carpeta local se borra después de copiarse al NAS (move real). Si no, queda en ambos sitios (copy). Default: solo copia."
            value={settings.archiveMoveDeleteLocal}
            onChange={(v) => update({ archiveMoveDeleteLocal: v })}
            busy={busy}
          />
        </div>
      </section>

      <NotionPollerSection />

      <footer className="mt-10 text-xs text-zinc-500">
        Cambios se aplican al instante. Algunos toggles requieren refrescar la
        página para verse del todo.
      </footer>
    </main>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
  busy,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  busy: boolean;
}) {
  return (
    <div className="glass flex items-center justify-between gap-4 rounded-[24px] p-5">
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-medium tracking-display text-white">
          {label}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
          {description}
        </p>
      </div>
      <ToggleSwitch value={value} onChange={onChange} disabled={busy} />
    </div>
  );
}

function ToggleSwitch({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border transition disabled:opacity-50 ${
        value
          ? 'border-accent/60 bg-accent/30'
          : 'border-white/10 bg-white/[0.06]'
      }`}
      style={
        value
          ? { boxShadow: '0 0 12px -2px rgba(201,169,106,0.4)' }
          : undefined
      }
    >
      <span
        aria-hidden
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
          value ? 'translate-x-[22px]' : 'translate-x-[2px]'
        }`}
        style={{ marginTop: '2px' }}
      />
    </button>
  );
}
