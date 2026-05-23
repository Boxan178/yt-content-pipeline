'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChecklistItem } from '@/lib/parse-checkboxes';
import type { VideoContext } from '@/lib/prompts';
import { inferResolver, type ResolverPlan } from '@/lib/checklist-resolver';
import { awardOnce } from '@/lib/gamification-client';
import { DecisionModal } from './DecisionModal';

interface Props {
  item: ChecklistItem;
  ctx: VideoContext;
  onResolved?: () => void;
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(0)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

type JobStatus = 'running' | 'done' | 'failed' | 'cancelled' | 'timeout';

interface JobShape {
  jobId: string;
  status: JobStatus;
  startedAt: string;
  finishedAt?: string;
}

const POLL_MS = 3000;

export function ChecklistItemRow({ item, ctx, onResolved }: Props) {
  const plan: ResolverPlan = inferResolver(item, ctx);
  const [job, setJob] = useState<JobShape | null>(null);
  const [tail, setTail] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Polling mientras el job corre
  useEffect(() => {
    if (!job) return;
    if (job.status !== 'running') return;
    let cancelled = false;
    const folder = ctx.folderPath.replace(/\\/g, '/');
    const poll = async () => {
      try {
        const r = await fetch(
          `/api/claude/jobs/${job.jobId}?videoFolder=${encodeURIComponent(folder)}`,
        );
        const data = await r.json();
        if (cancelled) return;
        if (data.ok && data.job) {
          const wasRunning = job.status === 'running';
          const nowRunning = data.job.status === 'running';
          setJob({
            jobId: data.job.jobId,
            status: data.job.status,
            startedAt: data.job.startedAt,
            finishedAt: data.job.finishedAt,
          });
          setTail(data.tail || '');
          // Si acaba de terminar OK, dispara el callback para refrescar el detail + XP
          if (wasRunning && !nowRunning && data.job.status === 'done') {
            awardOnce({
              dedupId: data.job.jobId,
              kind: 'checklist_resolved',
              label: item.text.slice(0, 60),
            });
            setTimeout(() => onResolved?.(), 500);
          }
        } else if (!data.ok) {
          setError(data.error || 'unknown');
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
      if (cancelled) return;
      pollTimer.current = setTimeout(poll, POLL_MS);
    };
    pollTimer.current = setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [job?.jobId, job?.status, ctx.folderPath, onResolved]);

  const run = async () => {
    if (plan.kind !== 'auto') return;
    setStartError(null);
    setError(null);
    setTail('');
    setExpanded(true);
    try {
      const r = await fetch('/api/claude/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: plan.prompt,
          cwd: plan.cwd,
          videoFolder: ctx.folderPath.replace(/\\/g, '/'),
          skill: `checklist-${plan.skill}`,
          label: plan.label,
          timeoutMs: plan.timeoutMs,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setStartError(data.error || `HTTP ${r.status}`);
        return;
      }
      setJob({
        jobId: data.job.jobId,
        status: data.job.status,
        startedAt: data.job.startedAt,
        finishedAt: data.job.finishedAt,
      });
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e));
    }
  };

  const cancel = async () => {
    if (!job) return;
    const folder = ctx.folderPath.replace(/\\/g, '/');
    try {
      await fetch(
        `/api/claude/jobs/${job.jobId}/cancel?videoFolder=${encodeURIComponent(folder)}`,
        { method: 'POST' },
      );
    } catch {}
  };

  // Manual: ahora abre un modal con formulario contextual en vez de un
  // botón deshabilitado. La decisión se persiste en packaging.md.
  if (plan.kind === 'manual') {
    return (
      <>
        <li className="flex items-start gap-2 rounded border border-yellow-500/20 bg-yellow-500/5 px-2.5 py-1.5 text-xs text-zinc-200">
          <span className="mt-0.5 text-yellow-400">○</span>
          <span className="flex-1 leading-snug">{item.text}</span>
          <button
            onClick={() => setDecisionOpen(true)}
            className="shrink-0 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[9px] text-accent transition hover:bg-accent/20"
            title={plan.reason}
          >
            decidir →
          </button>
        </li>
        {decisionOpen && (
          <DecisionModal
            itemText={item.text}
            videoFolder={ctx.folderPath.replace(/\\/g, '/')}
            onClose={() => setDecisionOpen(false)}
            onResolved={() => {
              setDecisionOpen(false);
              onResolved?.();
            }}
          />
        )}
      </>
    );
  }

  const isRunning = job?.status === 'running';
  const isDone = job?.status === 'done';
  const isFailed = job && (job.status === 'failed' || job.status === 'timeout' || job.status === 'cancelled');
  const durationMs = job
    ? new Date(job.finishedAt ?? new Date().toISOString()).getTime() -
      new Date(job.startedAt).getTime()
    : 0;
  const outputOnly = tail.includes('--- claude output ---')
    ? tail.split('--- claude output ---')[1]?.trim() ?? ''
    : tail;

  return (
    <li className={`rounded border ${isRunning ? 'border-red-500/50 bg-red-500/5' : 'border-yellow-500/20 bg-yellow-500/5'}`}>
      <div className="flex items-start gap-2 px-2.5 py-1.5 text-xs text-zinc-200">
        <span className={`mt-0.5 ${isRunning ? 'animate-pulse text-red-400' : 'text-yellow-400'}`}>○</span>
        <span className="flex-1 leading-snug">{item.text}</span>
        <div className="flex shrink-0 items-center gap-1">
          {(tail || isRunning) && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="rounded border border-border bg-bg px-1.5 py-0.5 text-[9px] text-muted hover:text-white"
              title={expanded ? 'Ocultar log' : 'Mostrar log'}
            >
              {expanded ? '▾' : '▸'}
            </button>
          )}
          {isRunning ? (
            <>
              <span className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[9px] text-red-300">
                {plan.label} · {formatDuration(durationMs)}
              </span>
              <button
                onClick={cancel}
                className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[9px] text-red-300 hover:bg-red-500/20"
                title="Cancelar job"
              >
                ✕
              </button>
            </>
          ) : (
            <button
              onClick={run}
              className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[9px] text-accent hover:bg-accent/20"
              title={plan.hint}
            >
              {isDone ? '✓ ' : isFailed ? '↻ ' : ''}
              {plan.label}
            </button>
          )}
        </div>
      </div>

      {startError && (
        <div className="border-t border-yellow-500/20 px-2.5 py-1.5">
          <p className="text-[10px] text-red-300">⚠ {startError}</p>
        </div>
      )}

      {expanded && (tail || error) && (
        <div className="border-t border-yellow-500/20 px-2.5 py-2">
          {error && (
            <p className="mb-1 text-[10px] text-red-300">polling: {error}</p>
          )}
          <div className="mb-1 flex items-center justify-between text-[9px] text-muted">
            <span>
              {isRunning && 'Trabajando…'}
              {isDone && '✓ Terminó OK · packaging.md actualizado'}
              {isFailed && `✗ ${job?.status}`}
            </span>
            <span>{formatDuration(durationMs)}</span>
          </div>
          {outputOnly ? (
            <div className="prose-tg max-h-72 overflow-auto rounded border border-border bg-bg/60 p-2 text-[11px]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{outputOnly}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-[10px] text-muted">Esperando output…</p>
          )}
        </div>
      )}
    </li>
  );
}
