'use client';

import { useEffect, useState } from 'react';
import type { ClaudeJob } from '@/lib/claude-jobs';

interface JobStatusResponse {
  ok: boolean;
  job: ClaudeJob;
  tail: string;
  assistantText: string;
  parsed?: unknown;
}

interface StyleEngineJobViewProps {
  draftId: string;
  jobId: string;
  parseMode: 'analyze' | 'visuals' | 'validate' | 'bootstrap' | 'none';
  /** Callback con la response cuando el job pasa a `done`. Se llama una sola vez. */
  onDone?: (resp: JobStatusResponse) => void;
}

/**
 * Visor de un job style-engine en curso. Polleia cada 3s mientras el job está
 * running; pinta tail + bloques parseados cuando el job termina.
 *
 * El padre se encarga de persistir los bloques parseados al draft via PUT.
 */
export function StyleEngineJobView({
  draftId,
  jobId,
  parseMode,
  onDone,
}: StyleEngineJobViewProps) {
  const [resp, setResp] = useState<JobStatusResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [doneCalled, setDoneCalled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const r = await fetch(
          `/api/lab/channels/${draftId}/jobs/${jobId}?parse=${parseMode}`,
          { cache: 'no-store' },
        );
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        const data = (await r.json()) as JobStatusResponse;
        if (cancelled) return;
        setResp(data);
        if (data.job.status === 'done' && !doneCalled) {
          setDoneCalled(true);
          onDone?.(data);
        }
        if (data.job.status === 'running') {
          timer = setTimeout(poll, 3000);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [draftId, jobId, parseMode, onDone, doneCalled]);

  if (err) {
    return (
      <div className="rounded border border-red-700/60 bg-red-900/20 p-3 text-sm text-red-300">
        Error: {err}
      </div>
    );
  }
  if (!resp) {
    return <div className="text-sm text-zinc-500">Cargando job…</div>;
  }

  const { job, tail } = resp;
  const isDone = job.status === 'done';
  const isFailed = job.status === 'failed' || job.status === 'timeout' || job.status === 'cancelled';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            job.status === 'running'
              ? 'animate-pulse bg-amber-400'
              : isDone
              ? 'bg-emerald-500'
              : 'bg-red-500'
          }`}
        />
        <span className="font-semibold text-white">{job.label}</span>
        <span className="text-xs text-zinc-500">· {job.status}</span>
      </div>

      <details className="rounded border border-border bg-bg/60" open={!isDone}>
        <summary className="cursor-pointer px-3 py-2 text-xs text-zinc-400">
          Log (últimas 300 líneas)
        </summary>
        <pre className="max-h-72 overflow-auto px-3 py-2 text-[11px] leading-snug text-zinc-300">
          {tail}
        </pre>
      </details>

      {isFailed && (
        <div className="rounded border border-red-700/60 bg-red-900/20 p-3 text-sm text-red-300">
          Job terminó con estado <strong>{job.status}</strong>. Revisa el log
          arriba y vuelve a lanzar.
        </div>
      )}
    </div>
  );
}
