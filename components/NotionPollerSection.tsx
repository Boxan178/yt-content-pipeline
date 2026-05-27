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
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
          Notion poller
        </h2>
        <div className="rounded-lg border border-border bg-panel p-4 text-xs text-muted">
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
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
        Notion poller
      </h2>
      <p className="mb-3 text-xs text-muted">
        Cada 30s revisa la DB <code className="text-zinc-400">📋 Pipeline</code> del dashboard
        Notion y, por cada fila con <span className="rounded bg-amber-500/20 px-1 text-amber-300">🟡 Arrancar</span> marcado,
        crea la carpeta del vídeo y lanza SARA. Setup: ver RELEASE.md §6.
      </p>

      {!hasToken && (
        <div className="mb-3 rounded-lg border border-amber-700/50 bg-amber-500/10 p-3 text-xs text-amber-200">
          ⚠️ Falta <code>NOTION_TOKEN</code> en <code>.env.local</code>. El poller no podrá conectar
          hasta que lo añadas y reinicies la app.
        </div>
      )}

      <div className="rounded-lg border border-border bg-panel p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white">Poller activo</p>
            <p className="text-xs text-muted">
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
              enabled ? 'border-accent/60 bg-accent/40' : 'border-border bg-zinc-700'
            }`}
          >
            <span
              aria-hidden
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                enabled ? 'translate-x-[22px]' : 'translate-x-[2px]'
              }`}
              style={{ marginTop: '2px' }}
            />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted">Último sync</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-white">
              <span className={`inline-block h-2 w-2 rounded-full ${statusDot}`} />
              {fmtRelative(state.lastSyncAt)}
              {state.lastStatus && (
                <span className="text-muted">· {state.lastStatus}</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-muted">Filas procesadas (acumulado)</p>
            <p className="mt-0.5 text-white">{state.processedCount}</p>
          </div>
        </div>

        {state.lastError && (
          <div className="mt-3 rounded border border-red-800/40 bg-red-950/30 p-2 text-[11px] text-red-300">
            <span className="font-semibold">Último error:</span> {state.lastError}
          </div>
        )}

        {backoffActive && state.nextRetryAt && (
          <div className="mt-3 rounded border border-amber-800/40 bg-amber-950/30 p-2 text-[11px] text-amber-300">
            Backoff activo · próximo retry {fmtRelative(state.nextRetryAt)} (consecutivos:{' '}
            {state.consecutiveErrors})
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={syncNow}
            disabled={syncing}
            className="rounded border border-border bg-bg px-3 py-1.5 text-xs text-white transition hover:border-accent/60 disabled:opacity-50"
          >
            {syncing ? 'Sincronizando…' : 'Sync ahora'}
          </button>
          {tickResult && (
            <span className="text-[11px] text-muted">{tickResult}</span>
          )}
        </div>

        <p className="mt-4 text-[10px] font-mono text-zinc-600">
          data_source_id: {dataSourceId}
        </p>
      </div>
    </section>
  );
}
