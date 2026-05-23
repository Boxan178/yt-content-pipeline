'use client';

import { useCallback, useEffect, useState } from 'react';
import { CHANNELS } from '@/lib/channels';

interface AppSettings {
  enableConfetti: boolean;
  enableNativeNotifications: boolean;
  pollIntervalMs: number;
  showCompilationBadge: boolean;
  defaultEffortMax: boolean;
  channelNasPaths: Record<string, string>;
  archiveMoveDeleteLocal: boolean;
}

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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">Configuración</h1>
        <p className="mt-1 text-sm text-muted">
          Preferencias de la app. Se guardan en <code className="text-zinc-400">~/.yt-content-pipeline/settings.json</code>.
        </p>
      </header>

      <section className="space-y-3">
        <Row
          label="Confetti al subir de nivel"
          description="Lanza confetti animado cuando subes nivel o desbloqueas un logro."
          value={settings.enableConfetti}
          onChange={(v) => update({ enableConfetti: v })}
          busy={busy}
        />
        <Row
          label="Notificaciones nativas del sistema"
          description="Avisos del OS (ding) cuando un job termina o sube nivel."
          value={settings.enableNativeNotifications}
          onChange={(v) => update({ enableNativeNotifications: v })}
          busy={busy}
        />
        <Row
          label="Mostrar badge de recopilación"
          description="Pinta el badge 📚 RECOP en las cards de vídeos compuestos."
          value={settings.showCompilationBadge}
          onChange={(v) => update({ showCompilationBadge: v })}
          busy={busy}
        />
        <Row
          label="Effort 'max' por defecto en jobs nuevos"
          description="Activa effort=max al lanzar un job sin override. Más caro, más profundo."
          value={settings.defaultEffortMax}
          onChange={(v) => update({ defaultEffortMax: v })}
          busy={busy}
        />

        <div className="mt-6 rounded-lg border border-border bg-panel p-4">
          <p className="mb-1 text-sm font-medium text-white">Refresh del kanban</p>
          <p className="mb-3 text-xs text-muted">Cada cuántos ms refresca la lista de vídeos. Más rápido = más carga.</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={5000}
              max={300000}
              step={5000}
              value={settings.pollIntervalMs}
              onChange={(e) => setSettings((s) => (s ? { ...s, pollIntervalMs: Number(e.target.value) } : s))}
              onBlur={(e) => update({ pollIntervalMs: Number(e.currentTarget.value) })}
              className="w-32 rounded border border-border bg-bg px-2 py-1 text-sm text-white"
            />
            <span className="text-xs text-muted">ms ({Math.round(settings.pollIntervalMs / 1000)}s)</span>
          </div>
        </div>
      </section>

      {/* Sección: rutas NAS por canal */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
          Rutas de archivo en NAS (por canal)
        </h2>
        <p className="mb-3 text-xs text-muted">
          Cuando muevas un vídeo a <b>_ARCHIVO</b> (arrastrándolo a la columna archivados, o vía el botón Archivar), la app copia la carpeta también al NAS si tienes una ruta configurada aquí. Útil para liberar espacio del disco local sin perder el material.
        </p>
        <div className="space-y-3">
          {CHANNELS.filter((c) => c.enabled).map((c) => {
            const current = settings.channelNasPaths?.[c.slug] ?? '';
            return (
              <div key={c.slug} className="rounded-lg border border-border bg-panel p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">{c.name}</p>
                  <span className="text-[10px] font-mono text-muted">{c.slug}</span>
                </div>
                <input
                  type="text"
                  value={current}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSettings((s) =>
                      s ? { ...s, channelNasPaths: { ...s.channelNasPaths, [c.slug]: v } } : s,
                    );
                  }}
                  onBlur={(e) => {
                    update({
                      channelNasPaths: { ...settings.channelNasPaths, [c.slug]: e.currentTarget.value.trim() },
                    });
                  }}
                  placeholder="Ej: Z:/ARCHIVO/MS  (deja vacío para no copiar a NAS)"
                  className="w-full rounded border border-border bg-bg px-3 py-1.5 font-mono text-xs text-white placeholder-zinc-600 focus:border-accent/60 focus:outline-none"
                />
              </div>
            );
          })}
        </div>
        <div className="mt-3">
          <Row
            label="Borrar copia local tras mover al NAS"
            description="Si está activo, la carpeta local se borra después de copiarse al NAS (move real). Si no, queda en ambos sitios (copy). Default: solo copia."
            value={settings.archiveMoveDeleteLocal}
            onChange={(v) => update({ archiveMoveDeleteLocal: v })}
            busy={busy}
          />
        </div>
      </section>

      <footer className="mt-10 text-xs text-zinc-500">
        Cambios se aplican al instante. Algunos toggles requieren refrescar la página para verse del todo.
      </footer>
    </main>
  );
}

function Row({
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
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-panel p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        disabled={busy}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border transition disabled:opacity-50 ${
          value ? 'border-accent/60 bg-accent/40' : 'border-border bg-zinc-700'
        }`}
      >
        <span
          aria-hidden
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
            value ? 'translate-x-[22px]' : 'translate-x-[2px]'
          }`}
          style={{ marginTop: '2px' }}
        />
      </button>
    </div>
  );
}
