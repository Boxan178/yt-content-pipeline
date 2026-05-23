'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { JobOptionsPicker, type ClaudeModel, type ClaudeEffort } from './JobOptionsPicker';
import { JobChatPanel } from './JobChatPanel';
import { addNotification } from '@/lib/notifications';
import { awardOnce } from '@/lib/gamification-client';
import type { StreamEvent } from '@/lib/stream-events';

interface Props {
  /** El prompt que se manda a `claude -p`. */
  prompt: string;
  /** CWD donde se ejecuta claude. Default: raíz de J.A.R.V.I.S. */
  cwd?: string;
  /** Carpeta del vídeo. Asocia el job a ese vídeo (para badges en kanban). */
  videoFolder?: string;
  /** Skill ID corto, ej 'sara'. Se persiste en el job para badges. */
  skill: string;
  /** Etiqueta humana del job para badges. */
  jobLabel?: string;
  /** Timeout en ms. Default backend 10 min. */
  timeoutMs?: number;
  /** Modelo recomendado por el builder. Pablo puede override desde el picker. */
  model?: ClaudeModel;
  /** Effort recomendado por el builder. */
  effort?: ClaudeEffort;
  /** Configuración de loop (re-run hasta encontrar successMarker). */
  loop?: { successMarker: string; maxRetries: number };
  /** Título humano del vídeo para mostrar en notificaciones. */
  videoTitle?: string;
  /** Texto del botón. */
  label: string;
  /** Tooltip antes de ejecutar. */
  hint?: string;
  /** Estado deshabilitado externo (con motivo). */
  disabledReason?: string;
  variant?: 'primary' | 'subtle';
}

const VARIANT_CLASSES: Record<NonNullable<Props['variant']>, string> = {
  primary: 'border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20',
  subtle: 'border border-border bg-bg text-zinc-200 hover:border-accent/60 hover:text-white',
};

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

const POLL_MS = 3000;

type JobStatus = 'running' | 'done' | 'failed' | 'cancelled' | 'timeout';
type Approval = 'approved' | 'rejected' | null;

interface JobShape {
  jobId: string;
  status: JobStatus;
  startedAt: string;
  finishedAt?: string;
  approval?: Approval;
}

export function ClaudeRunButton({
  prompt,
  cwd,
  videoFolder,
  skill,
  jobLabel,
  timeoutMs,
  model,
  effort,
  loop,
  videoTitle,
  label,
  hint,
  disabledReason,
  variant = 'primary',
}: Props) {
  const [job, setJob] = useState<JobShape | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [rawLog, setRawLog] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [modelOverride, setModelOverride] = useState<ClaudeModel | null>(null);
  const [effortOverride, setEffortOverride] = useState<ClaudeEffort | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [attempt, setAttempt] = useState(1);
  const [useSSE, setUseSSE] = useState(true);
  const lastNotifiedStatus = useRef<JobStatus | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SSE: stream de eventos en vivo mientras el job corre. Si falla, fallback a polling.
  useEffect(() => {
    if (!job || !videoFolder) return;
    if (job.status !== 'running') return;
    if (!useSSE) return;
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      setUseSSE(false);
      return;
    }
    const url = `/api/claude/jobs/${job.jobId}/stream?videoFolder=${encodeURIComponent(videoFolder)}`;
    const es = new EventSource(url);
    es.addEventListener('event', (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data) as StreamEvent;
        setEvents((prev) => [...prev, ev]);
      } catch {}
    });
    es.addEventListener('done', () => {
      es.close();
      // Trigger un refetch normal para sincronizar estado del job
      setTimeout(() => {
        if (videoFolder && job.jobId) {
          fetch(`/api/claude/jobs/${job.jobId}?videoFolder=${encodeURIComponent(videoFolder)}`)
            .then((r) => r.json())
            .then((data) => {
              if (data.ok && data.job) {
                setJob({
                  jobId: data.job.jobId,
                  status: data.job.status,
                  startedAt: data.job.startedAt,
                  finishedAt: data.job.finishedAt,
                  approval: data.job.approval ?? null,
                });
                setEvents(Array.isArray(data.events) ? data.events : []);
              }
            })
            .catch(() => {});
        }
      }, 300);
    });
    es.onerror = () => {
      es.close();
      // Fallback a polling
      setUseSSE(false);
    };
    return () => {
      es.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.jobId, job?.status, videoFolder, useSSE]);

  // Polling del job mientras corre (sólo si SSE no disponible o falló)
  useEffect(() => {
    if (!job || !videoFolder) return;
    if (job.status !== 'running') return;
    if (useSSE) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const u = `/api/claude/jobs/${job.jobId}?videoFolder=${encodeURIComponent(videoFolder)}`;
        const r = await fetch(u);
        const data = await r.json();
        if (cancelled) return;
        if (data.ok && data.job) {
          const newStatus = data.job.status as JobStatus;
          if (
            lastNotifiedStatus.current === 'running' &&
            newStatus !== 'running'
          ) {
            const kindMap: Record<string, 'job-done' | 'job-failed' | 'job-cancelled' | 'job-timeout'> = {
              done: 'job-done',
              failed: 'job-failed',
              cancelled: 'job-cancelled',
              timeout: 'job-timeout',
            };
            const verb = newStatus === 'done' ? 'terminó OK' : newStatus === 'failed' ? 'falló' : newStatus === 'cancelled' ? 'fue cancelado' : 'timeout';
            addNotification({
              kind: kindMap[newStatus] ?? 'info',
              title: `${jobLabel ?? skill} · ${verb}`,
              body: videoTitle ? `Sobre "${videoTitle}"` : (videoFolder ?? 'job global'),
              videoFolder,
              videoTitle,
              skill,
            });
            // Gamificación: XP solo cuando el job termina bien
            if (newStatus === 'done') {
              awardOnce({
                dedupId: data.job.jobId,
                kind: 'job_done',
                label: `${jobLabel ?? skill}${videoTitle ? ` · ${videoTitle}` : ''}`,
              });
            }
            lastNotifiedStatus.current = newStatus;
          }
          setJob({
            jobId: data.job.jobId,
            status: newStatus,
            startedAt: data.job.startedAt,
            finishedAt: data.job.finishedAt,
            approval: data.job.approval ?? null,
          });
          setEvents(Array.isArray(data.events) ? data.events : []);
          setRawLog(data.tail || '');
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
  }, [job?.jobId, job?.status, videoFolder, useSSE]);

  // Cuando el job ya no está running, hacer un último fetch para asegurar events finales.
  // Además, si hay loop activo y NO se encuentra successMarker, relanzar mismo prompt.
  useEffect(() => {
    if (!job || !videoFolder) return;
    if (job.status === 'running') return;
    let cancelled = false;
    (async () => {
      try {
        const u = `/api/claude/jobs/${job.jobId}?videoFolder=${encodeURIComponent(videoFolder)}`;
        const r = await fetch(u);
        const data = await r.json();
        if (cancelled || !data.ok) return;
        const evs = Array.isArray(data.events) ? data.events : [];
        setEvents(evs);
        setRawLog(data.tail || '');
        if (data.job?.approval !== undefined) {
          setJob((prev) => (prev ? { ...prev, approval: data.job.approval ?? null } : prev));
        }
        // LOOP: si está configurado y el output NO contiene el marker, relanzar
        if (loop && job.status === 'done' && attempt < loop.maxRetries) {
          const allText = evs
            .filter((e: any) => e.type === 'assistant')
            .flatMap((e: any) => (e.message?.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text))
            .join('\n');
          const ok = allText.toLowerCase().includes(loop.successMarker.toLowerCase());
          if (!ok) {
            setAttempt((a) => a + 1);
            // Pequeño defer y re-run
            setTimeout(() => run(), 600);
          }
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.jobId, job?.status, videoFolder]);

  const run = async () => {
    if (disabledReason) return;
    setStartError(null);
    setError(null);
    setEvents([]);
    setRawLog('');
    setExpanded(true);
    try {
      const effectiveModel = modelOverride ?? model;
      const effectiveEffort = effortOverride ?? effort;
      const r = await fetch('/api/claude/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          cwd,
          videoFolder,
          skill,
          label: jobLabel ?? skill,
          timeoutMs,
          model: effectiveModel,
          effort: effectiveEffort,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setStartError(data.error || `HTTP ${r.status}`);
        return;
      }
      lastNotifiedStatus.current = data.job.status as JobStatus;
      setJob({
        jobId: data.job.jobId,
        status: data.job.status,
        startedAt: data.job.startedAt,
        finishedAt: data.job.finishedAt,
        approval: data.job.approval ?? null,
      });
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e));
    }
  };

  const cancel = async () => {
    if (!job || !videoFolder) return;
    try {
      await fetch(
        `/api/claude/jobs/${job.jobId}/cancel?videoFolder=${encodeURIComponent(videoFolder)}`,
        { method: 'POST' },
      );
    } catch {}
  };

  const enqueueIt = async () => {
    if (disabledReason || !videoFolder) return;
    setStartError(null);
    try {
      const effectiveModel = modelOverride ?? model;
      const effectiveEffort = effortOverride ?? effort;
      const r = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill,
          label: jobLabel ?? skill,
          videoFolder,
          videoTitle: videoTitle ?? videoFolder.split('/').pop() ?? '?',
          prompt,
          cwd: cwd ?? 'Y:/04_DEV/J.A.R.V.I.S',
          timeoutMs: timeoutMs ?? 10 * 60 * 1000,
          model: effectiveModel,
          effort: effectiveEffort,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setStartError(data.error || `HTTP ${r.status}`);
        return;
      }
      // Pequeña marca visual: simular "encolado" con un toast inline
      setStartError(null);
      setExpanded(false);
      // Aprovechar notif OS si está
      if (typeof window !== 'undefined') {
        window.electronAPI?.notify?.({
          title: 'Encolado',
          body: `${jobLabel ?? skill} · ${videoTitle ?? ''}`,
          kind: 'queued',
        });
      }
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e));
    }
  };

  const sendApproval = async (next: Approval) => {
    if (!job || !videoFolder) return;
    setApprovalBusy(true);
    try {
      const r = await fetch(
        `/api/claude/jobs/${job.jobId}/approval?videoFolder=${encodeURIComponent(videoFolder)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approval: next }),
        },
      );
      const data = await r.json();
      if (data.ok && data.job) {
        setJob((prev) => (prev ? { ...prev, approval: data.job.approval ?? null } : prev));
        // Gamificación: solo dispara XP en transiciones a approved/rejected,
        // no al limpiar (next === null).
        if (next === 'approved') {
          awardOnce({
            dedupId: job.jobId,
            kind: 'job_approved',
            label: `${jobLabel ?? skill}${videoTitle ? ` · ${videoTitle}` : ''}`,
          });
        } else if (next === 'rejected') {
          awardOnce({
            dedupId: job.jobId,
            kind: 'job_rejected',
            label: `${jobLabel ?? skill}${videoTitle ? ` · ${videoTitle}` : ''}`,
          });
        }
        // Cosmético + cierra el panel
        setExpanded(false);
      }
    } catch {}
    setApprovalBusy(false);
  };

  const reset = () => {
    setJob(null);
    setEvents([]);
    setRawLog('');
    setError(null);
    setStartError(null);
    setExpanded(false);
    setAttempt(1);
  };

  const isRunning = job?.status === 'running';
  const isDone = job?.status === 'done';
  const isFailed = job?.status === 'failed' || job?.status === 'timeout' || job?.status === 'cancelled';
  const durationMs = job
    ? new Date(job.finishedAt ?? new Date().toISOString()).getTime() -
      new Date(job.startedAt).getTime()
    : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={run}
          disabled={isRunning || !!disabledReason}
          title={disabledReason || hint}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]}`}
        >
          {isRunning ? (
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {jobLabel ?? skill} trabajando ({formatDuration(durationMs)})
              {loop && attempt > 1 && (
                <span className="rounded bg-amber-500/20 px-1 text-[10px] text-amber-300">
                  intento {attempt}/{loop.maxRetries}
                </span>
              )}
            </span>
          ) : (
            label
          )}
        </button>
        {videoFolder && !isRunning && !disabledReason && (
          <button
            onClick={enqueueIt}
            className="rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-muted transition hover:border-accent/60 hover:text-white"
            title="Encolar este job (se ejecuta en la cola, no ya)"
          >
            📋
          </button>
        )}
        {isRunning && videoFolder && (
          <button
            onClick={cancel}
            className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-300 transition hover:bg-red-500/20"
            title="Cancelar job"
          >
            ✕
          </button>
        )}
        {(isDone || isFailed) && !isRunning && (
          <button
            onClick={reset}
            className="rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-muted transition hover:text-white"
            title="Limpiar y volver al estado inicial"
          >
            ↻
          </button>
        )}
      </div>

      {disabledReason && !job && (
        <p className="text-[11px] text-yellow-300/80">⚠ {disabledReason}</p>
      )}
      {hint && !job && !disabledReason && (
        <p className="text-[11px] text-muted">{hint}</p>
      )}

      {!job && !disabledReason && model && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted">Opciones:</span>
          <JobOptionsPicker
            model={model}
            effort={effort}
            modelOverride={modelOverride}
            effortOverride={effortOverride}
            onChange={(next) => {
              if ('model' in next) setModelOverride(next.model ?? null);
              if ('effort' in next) setEffortOverride(next.effort ?? null);
            }}
            compact
          />
        </div>
      )}

      {startError && (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <p className="font-semibold">No se pudo arrancar el job</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{startError}</p>
        </div>
      )}

      {job && expanded && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] text-muted">
            <span>
              {isRunning && 'Trabajando…'}
              {isDone && '✓ Terminó OK'}
              {isFailed && `✗ ${job.status}`}
              {job.approval === 'approved' && ' · 👍 aprobado'}
              {job.approval === 'rejected' && ' · 👎 rechazado'}
            </span>
            <div className="flex items-center gap-2">
              <span>{formatDuration(durationMs)}</span>
              <Link
                href={`/jobs/${job.jobId}`}
                className="rounded border border-border px-1.5 py-0.5 hover:text-white"
                title="Abrir chat a pantalla completa"
              >
                ↗ grande
              </Link>
            </div>
          </div>

          <JobChatPanel
            events={events}
            running={isRunning}
            rawLog={rawLog}
            maxHeightClass="max-h-96"
          />

          {!isRunning && (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => sendApproval(job.approval === 'approved' ? null : 'approved')}
                disabled={approvalBusy}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                  job.approval === 'approved'
                    ? 'border-green-500/60 bg-green-500/15 text-green-200'
                    : 'border-green-500/30 bg-green-500/5 text-green-300 hover:bg-green-500/15'
                }`}
              >
                👍 Aprobar
              </button>
              <button
                onClick={() => sendApproval(job.approval === 'rejected' ? null : 'rejected')}
                disabled={approvalBusy}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                  job.approval === 'rejected'
                    ? 'border-red-500/60 bg-red-500/15 text-red-200'
                    : 'border-red-500/30 bg-red-500/5 text-red-300 hover:bg-red-500/15'
                }`}
              >
                👎 Rechazar
              </button>
              <button
                onClick={() => {
                  reset();
                  // Pequeño defer para que el reset surta efecto antes de re-spawn
                  setTimeout(() => run(), 0);
                }}
                className="flex-1 rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-zinc-200 transition hover:border-accent/60 hover:text-white"
                title="Volver a ejecutar el mismo prompt"
              >
                ↻ Reintentar
              </button>
            </div>
          )}
        </div>
      )}

      {job && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="text-[10px] text-muted hover:text-white"
        >
          ▸ Mostrar chat
        </button>
      )}

      {error && (
        <p className="text-[10px] text-red-300">Error polling: {error}</p>
      )}
    </div>
  );
}
