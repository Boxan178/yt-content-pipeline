'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { JobChatPanel } from '@/components/JobChatPanel';
import type { StreamEvent } from '@/lib/stream-events';

type JobStatus = 'running' | 'done' | 'failed' | 'cancelled' | 'timeout';
type Approval = 'approved' | 'rejected' | null;

interface JobShape {
  jobId: string;
  pid: number;
  skill: string;
  label: string;
  status: JobStatus;
  startedAt: string;
  finishedAt?: string;
  prompt: string;
  cwd: string;
  model?: string;
  effort?: string;
  approval?: Approval;
}

interface FindResponse {
  ok: true;
  job: JobShape;
  events: StreamEvent[];
  tail: string;
  durationMs: number;
  videoFolder: string;
  videoTitle: string;
  channel: string;
  channelName: string;
}

const STATUS_COLOR: Record<JobStatus, string> = {
  running: 'border-red-500/50 bg-red-500/10 text-red-300',
  done: 'border-green-500/40 bg-green-500/10 text-green-300',
  failed: 'border-red-500/40 bg-red-500/10 text-red-300',
  cancelled: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300',
  timeout: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
};

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(0)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

export default function JobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const jobId = params?.jobId;
  const [data, setData] = useState<FindResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);

  const load = useCallback(async () => {
    if (!jobId) return;
    try {
      const r = await fetch(`/api/claude/jobs/find/${jobId}`, { cache: 'no-store' });
      const json = await r.json();
      if (json.ok) {
        setData(json as FindResponse);
        setError(null);
      } else {
        setError(json.error || 'unknown');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
    const id = setInterval(load, data?.job.status === 'running' ? 3000 : 8000);
    return () => clearInterval(id);
  }, [load, data?.job.status]);

  const sendApproval = async (next: Approval) => {
    if (!data) return;
    setApprovalBusy(true);
    try {
      const r = await fetch(
        `/api/claude/jobs/${data.job.jobId}/approval?videoFolder=${encodeURIComponent(data.videoFolder)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approval: next }),
        },
      );
      const json = await r.json();
      if (json.ok && json.job) {
        setData((prev) => (prev ? { ...prev, job: { ...prev.job, approval: json.job.approval ?? null } } : prev));
      }
    } catch {}
    setApprovalBusy(false);
  };

  const cancel = async () => {
    if (!data) return;
    try {
      await fetch(
        `/api/claude/jobs/${data.job.jobId}/cancel?videoFolder=${encodeURIComponent(data.videoFolder)}`,
        { method: 'POST' },
      );
      load();
    } catch {}
  };

  const retry = async () => {
    if (!data) return;
    try {
      const r = await fetch('/api/claude/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: data.job.prompt,
          cwd: data.job.cwd,
          videoFolder: data.videoFolder,
          skill: data.job.skill,
          label: data.job.label,
          model: data.job.model,
          effort: data.job.effort,
        }),
      });
      const json = await r.json();
      if (r.ok && json.ok && json.job?.jobId) {
        router.push(`/jobs/${json.job.jobId}`);
      }
    } catch {}
  };

  if (loading) {
    return (
      <main className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/jobs" className="text-sm text-muted hover:text-white">
          ← Jobs
        </Link>
        <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error || 'Job no encontrado'}
        </div>
      </main>
    );
  }

  const j = data.job;
  const isRunning = j.status === 'running';
  const durationMs = data.durationMs;

  return (
    <main className="flex h-full flex-col px-6 py-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0 flex-1">
          <Link href="/jobs" className="text-xs text-muted hover:text-white">
            ← Jobs
          </Link>
          <h1 className="mt-1 truncate text-xl font-bold text-white">
            {j.label} · {data.videoTitle}
          </h1>
          <p className="mt-1 text-xs text-muted">
            canal: <span className="text-zinc-300">{data.channelName}</span>
            {' · '}skill: <span className="text-zinc-300">{j.skill}</span>
            {j.model && (
              <>
                {' · '}modelo: <span className="text-zinc-300">{j.model}</span>
              </>
            )}
            {j.effort && (
              <>
                {' · '}effort: <span className="text-zinc-300">{j.effort}</span>
              </>
            )}
            {' · '}PID: <span className="text-zinc-300">{j.pid}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <span
            className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_COLOR[j.status]}`}
          >
            {isRunning && '●'} {j.status}
            {j.approval === 'approved' && ' · 👍'}
            {j.approval === 'rejected' && ' · 👎'}
          </span>
          <span className="text-[10px] text-zinc-500">
            {new Date(j.startedAt).toLocaleString('es-ES')} · {formatDuration(durationMs)}
          </span>
        </div>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {isRunning ? (
          <button
            onClick={cancel}
            className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/20"
          >
            ✕ Cancelar
          </button>
        ) : (
          <>
            <button
              onClick={() => sendApproval(j.approval === 'approved' ? null : 'approved')}
              disabled={approvalBusy}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                j.approval === 'approved'
                  ? 'border-green-500/60 bg-green-500/15 text-green-200'
                  : 'border-green-500/30 bg-green-500/5 text-green-300 hover:bg-green-500/15'
              }`}
            >
              👍 Aprobar
            </button>
            <button
              onClick={() => sendApproval(j.approval === 'rejected' ? null : 'rejected')}
              disabled={approvalBusy}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                j.approval === 'rejected'
                  ? 'border-red-500/60 bg-red-500/15 text-red-200'
                  : 'border-red-500/30 bg-red-500/5 text-red-300 hover:bg-red-500/15'
              }`}
            >
              👎 Rechazar
            </button>
            <button
              onClick={retry}
              className="rounded-md border border-border bg-bg px-3 py-1.5 text-xs text-zinc-200 transition hover:border-accent/60 hover:text-white"
            >
              ↻ Reintentar
            </button>
          </>
        )}
        <button
          onClick={() => setShowPrompt((v) => !v)}
          className="ml-auto rounded-md border border-border bg-bg px-3 py-1.5 text-xs text-muted transition hover:text-white"
        >
          {showPrompt ? 'ocultar prompt' : 'ver prompt'}
        </button>
      </div>

      {showPrompt && (
        <details open className="mb-3">
          <summary className="cursor-pointer text-xs text-muted">Prompt enviado a Claude</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-bg/60 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
            {j.prompt}
          </pre>
        </details>
      )}

      <div className="flex-1 overflow-hidden">
        <JobChatPanel events={data.events} running={isRunning} rawLog={data.tail} fullHeight />
      </div>
    </main>
  );
}
