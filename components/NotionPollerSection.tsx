'use client';

import { useCallback, useEffect, useState } from 'react';

interface PollerState {
  enabled: boolean;
  lastSyncAt: string | null;
  lastStatus: 'ok' | 'error' | 'noop' | null;
  lastError: string | null;
  processedCount: number;
  recentSuccessIds: string[];
  nextRetryAt: string | null;
  consecutiveErrors: number;
}

interface ConfigInfo {
  enabled: boolean;
  hasToken: boolean;
  dataSourceId: string;
  state: PollerState;
}

function fmtRelative(iso: string | null): string {
  if (!iso) return 'nunca';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'en el futuro';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

/**
 * Notion poller section — Liquid Glass refresh 2026-05-27.
 *
 * Sección de configuración del Notion poller. Glass surfaces, toggle switch
 * dorado, pill de status con SVG dot, refrescos en glass-hover.
 */
export function NotionPollerSection() {
  const [info, setInfo] = useState<ConfigInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [tickResult, setTickResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/notion/status', { cache: 'no-store' });
      const data = await r.json();
      if (data.ok) setInfo(data);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      await fetch('/api/notion/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      await load();
    } catch {}
    setBusy(false);
  };

  const syncNow = async () => {
    setSyncing(true);
    setTickResult(null);
    try {
      const r = await fetch('/api/notion/sync?force=1', { method: 'POST' });
      const data = await r.json();
      if (data.ok && data.result) {
        const { matched, processed, reason } = data.result as {
          matched: number;
          processed: number;
          reason?: string;
        };
        if (reason && processed === 0) {
          setTickResult(`Noop: ${reason}`);
        } else {
          setTickResult(`Encontradas ${matched} fila(s), procesadas ${processed}.`);
        }
      } else if (!data.ok) {
        setTickResult(`Error: ${data.error ?? 'desconocido'}`);
      }
      await load();
    } catch (e) {
      setTickResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setSyncing(false);
  };

  if (!info) {
    return (
      <section className="mt-8">
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-label text-zinc-500">
          Notion poller
        </h2>
        <div className="glass rounded-[24px] p-5 text-xs text-zinc-500">
          Cargando…
        </div>
      </section>
    );
  }

  const { enabled, hasToken, dataSourceId, state } = info;
  const statusDot =
    state.lastStatus === 'error'
      ? 'bg-red-500'
      : state.lastStatus === 'ok'
        ? 'bg-emerald-500'
        : state.lastStatus === 'noop'
          ? 'bg-zinc-500'
          : 'bg-zinc-700';
  const backoffActive = state.nextRetryAt && new Date(state.nextRetryAt) > new Date();

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[11px] font-medium uppercase tracking-label text-zinc-500">
        Notion poller
      </h2>
      <p className="mb-3 text-xs leading-relaxed text-zinc-400">
        Cada 30s revisa la DB{' '}
        <code className="font-mono text-[11px] text-accent">📋 Pipeline</code> del
        dashboard Notion y, por cada fila con{' '}
        <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
          Arrancar
        </span>{' '}
        marcado, crea la carpeta del vídeo y lanza SARA. Setup: ver RELEASE.md
        §6.
      </p>

      {!hasToken && (
        <div className="glass mb-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 text-xs leading-relaxed text-amber-200">
          <span className="font-medium uppercase tracking-label">Aviso:</span>{' '}
          Falta <code className="font-mono">NOTION_TOKEN</code> en{' '}
          <code className="font-mono">.env.local</code>. El poller no podrá
          conectar hasta que lo añadas y reinicies la app.
        </div>
      )}

      <div className="glass rounded-[24px] p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-medium tracking-display text-white">
              Poller activo
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
              Cuando está activo, la app revisa Notion cada 30s automáticamente.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => toggle(!enabled)}
            disabled={busy}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border transition disabled:opacity-50 ${
              enabled
                ? 'border-accent/60 bg-accent/30'
                : 'border-white/10 bg-white/[0.06]'
            }`}
            style={
              enabled
                ? { boxShadow: '0 0 12px -2px rgba(201,169,106,0.4)' }
                : undefined
            }
          >
            <span
              aria-hidden
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                enabled ? 'translate-x-[22px]' : 'translate-x-[2px]'
              }`}
              style={{ marginTop: '2px' }}
            />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-[10px] font-medium uppercase tracking-label text-zinc-500">
              Último sync
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-zinc-200">
              <span className={`inline-block h-2 w-2 rounded-full ${statusDot}`} />
              {fmtRelative(state.lastSyncAt)}
              {state.lastStatus && (
                <span className="text-zinc-500">· {state.lastStatus}</span>
              )}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-[10px] font-medium uppercase tracking-label text-zinc-500">
              Filas procesadas
            </p>
            <p className="mt-1 nums font-display text-lg font-bold tracking-display text-white">
              {state.processedCount}
            </p>
          </div>
        </div>

        {state.lastError && (
          <div className="mt-3 rounded-2xl border border-red-500/40 bg-red-500/5 p-3 text-[11px] text-red-300">
            <span className="font-medium uppercase tracking-label">
              Último error:
            </span>{' '}
            {state.lastError}
          </div>
        )}

        {backoffActive && state.nextRetryAt && (
          <div className="mt-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3 text-[11px] text-amber-300">
            Backoff activo · próximo retry {fmtRelative(state.nextRetryAt)}{' '}
            (consecutivos:{' '}
            <span className="nums">{state.consecutiveErrors}</span>)
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={syncNow}
            disabled={syncing}
            className="btn-glass text-xs disabled:opacity-50"
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
              className={syncing ? 'animate-spin' : ''}
            >
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15" />
            </svg>
            {syncing ? 'Sincronizando…' : 'Sync ahora'}
          </button>
          {tickResult && (
            <span className="text-[11px] text-zinc-500">{tickResult}</span>
          )}
        </div>

        <p className="mt-4 nums font-mono text-[10px] text-zinc-600">
          data_source_id: {dataSourceId}
        </p>
      </div>
    </section>
  );
}
