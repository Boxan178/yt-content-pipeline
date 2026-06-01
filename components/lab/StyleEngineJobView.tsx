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
 * Style-engine job viewer — Liquid Glass refresh 2026-05-27.
 *
 * Visor de un job style-engine en curso. Polleia cada 3s mientras el job está
 * running. Header con status pill (.pill-* family) + label, log en glass card
 * con font-mono y bg-black/40 (estilo terminal). Pulse animation en pill
 * mientras corre.
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
      <div className="glass rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-300">
        <span className="font-medium">Error:</span> {err}
      </div>
    );
  }
  if (!resp) {
    return (
      <div className="glass rounded-2xl p-4 text-sm text-zinc-500">
        Cargando job…
      </div>
    );
  }

  const { job, tail } = resp;
  const isDone = job.status === 'done';
  const isFailed =
    job.status === 'failed' || job.status === 'timeout' || job.status === 'cancelled';

  return (
    <div className="space-y-3">
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <StatusPill status={job.status} />
          <span className="font-display text-sm font-medium tracking-display text-white">
            {job.label}
          </span>
        </div>
      </div>

      <details
        className="glass rounded-2xl"
        open={!isDone}
      >
        <summary className="cursor-pointer px-4 py-2.5 text-[11px] font-medium uppercase tracking-label text-zinc-500 hover:text-zinc-300">
          Log (últimas 300 líneas)
        </summary>
        <pre className="mx-4 mb-4 max-h-80 overflow-auto rounded-2xl bg-black/40 p-4 font-mono text-[11px] leading-relaxed text-zinc-300">
          {tail}
        </pre>
      </details>

      {isFailed && (
        <div className="glass rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-300">
          Job terminó con estado{' '}
          <span className="font-semibold uppercase">{job.status}</span>. Revisa
          el log arriba y vuelve a lanzar.
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: ClaudeJob['status'] }) {
  if (status === 'running') {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/14 px-2.5 py-0.5 text-[11px] font-medium text-amber-300"
        style={{ boxShadow: '0 0 12px -2px rgba(245,158,11,0.4)' }}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
        running
      </span>
    );
  }
  if (status === 'done') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/40 bg-green-500/14 px-2.5 py-0.5 text-[11px] font-medium text-green-300">
        <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
        done
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/14 px-2.5 py-0.5 text-[11px] font-medium text-red-300">
      <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
      {status}
    </span>
  );
}
