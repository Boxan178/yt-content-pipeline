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

const STATUS_PILL: Record<JobStatus, string> = {
  running: 'pill-away',
  done: 'pill-active',
  failed: 'pill-err',
  cancelled: 'pill-soon',
  timeout: 'pill-timeout',
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
        setData((prev) =>
          prev ? { ...prev, job: { ...prev.job, approval: json.job.approval ?? null } } : prev,
        );
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
      <main className="mx-auto max-w-3xl px-8 py-12">
        <Link
          href="/jobs"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 transition hover:text-white"
        >
          <BackArrow /> Jobs
        </Link>
        <div className="mt-4 rounded-3xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error || 'Job no encontrado'}
        </div>
      </main>
    );
  }

  const j = data.job;
  const isRunning = j.status === 'running';
  const durationMs = data.durationMs;

  return (
    <main className="flex h-full flex-col px-8 py-4">
      <header className="glass mb-3 flex flex-wrap items-start justify-between gap-3 rounded-3xl px-4 py-3">
        <div className="min-w-0 flex-1">
          <Link
            href="/jobs"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-white"
          >
            <BackArrow /> Jobs
          </Link>
          <h1 className="mt-1 truncate font-display text-xl font-semibold tracking-display text-white">
            {j.label} · {data.videoTitle}
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            canal: <span className="text-zinc-200">{data.channelName}</span>
            {' · '}skill: <span className="text-zinc-200">{j.skill}</span>
            {j.model && (
              <>
                {' · '}modelo: <span className="text-zinc-200">{j.model}</span>
              </>
            )}
            {j.effort && (
              <>
                {' · '}effort: <span className="text-zinc-200">{j.effort}</span>
              </>
            )}
            {' · '}PID: <span className="font-mono text-[11px] text-zinc-300">{j.pid}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <span className={`${STATUS_PILL[j.status]} shrink-0`}>
            {isRunning && <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />}
            {j.status}
            {j.approval === 'approved' && (
              <span className="ml-1 text-green-400">
                <IconCheck />
              </span>
            )}
            {j.approval === 'rejected' && (
              <span className="ml-1 text-red-400">
                <IconX />
              </span>
            )}
          </span>
          <span className="nums text-[10px] text-zinc-500">
            {new Date(j.startedAt).toLocaleString('es-ES')} · {formatDuration(durationMs)}
          </span>
        </div>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {isRunning ? (
          <button
            onClick={cancel}
            className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/30"
          >
            <IconX /> Cancelar
          </button>
        ) : (
          <>
            <button
              onClick={() => sendApproval(j.approval === 'approved' ? null : 'approved')}
              disabled={approvalBusy}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                j.approval === 'approved'
                  ? 'border-green-500/60 bg-green-500/20 text-green-200'
                  : 'border-green-500/30 bg-green-500/10 text-green-300 hover:bg-green-500/20'
              }`}
            >
              <IconCheck /> Aprobar
            </button>
            <button
              onClick={() => sendApproval(j.approval === 'rejected' ? null : 'rejected')}
              disabled={approvalBusy}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                j.approval === 'rejected'
                  ? 'border-red-500/60 bg-red-500/20 text-red-200'
                  : 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
              }`}
            >
              <IconX /> Rechazar
            </button>
            <button
              onClick={retry}
              className="btn-glass text-xs px-3 py-1.5"
            >
              <IconRefresh /> Reintentar
            </button>
          </>
        )}
        <button
          onClick={() => setShowPrompt((v) => !v)}
          className="ml-auto rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400 transition hover:bg-white/10 hover:text-white"
        >
          {showPrompt ? 'ocultar prompt' : 'ver prompt'}
        </button>
      </div>

      {showPrompt && (
        <details open className="glass mb-3 rounded-3xl px-4 py-3">
          <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-label text-zinc-500">
            Prompt enviado a Claude
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
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

/* ─── icons ─── */
function BackArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
function IconRefresh() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M20.5 9A9 9 0 0 0 5.6 5.6L1 10M23 14l-4.6 4.4A9 9 0 0 1 3.5 15" />
    </svg>
  );
}
