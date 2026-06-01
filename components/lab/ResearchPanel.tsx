'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Research, ValidationVerdict } from '@/lib/lab/types';
import type { ClaudeJob } from '@/lib/claude-jobs';

interface Props {
  initialItems: Research[];
}

type Mode = 'quick' | 'deep';

interface ParsedResearch {
  verdict: ValidationVerdict;
  summary: string;
  outliers: Array<{ title: string; channel: string; views: number; vph: number; url: string }>;
  breakoutChannels: Array<{
    name: string;
    url: string;
    growthRate: number;
    reason: string;
  }>;
  keywordResearch: Array<{
    keyword: string;
    volume: number;
    competition: number;
    trend: 'up' | 'flat' | 'down';
  }>;
  rawReport: string;
}

const VERDICT_PILL: Record<
  ValidationVerdict,
  { cls: string; label: string; icon: JSX.Element }
> = {
  green: {
    cls: 'border-green-500/40 bg-green-500/14 text-green-300',
    label: 'GO',
    icon: (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12l5 5L20 7" />
      </svg>
    ),
  },
  yellow: {
    cls: 'border-amber-500/40 bg-amber-500/14 text-amber-300',
    label: 'CAUTION',
    icon: (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      </svg>
    ),
  },
  red: {
    cls: 'border-red-500/40 bg-red-500/14 text-red-300',
    label: 'NO-GO',
    icon: (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9l6 6M15 9l-6 6" />
      </svg>
    ),
  },
};

/**
 * Research panel — Liquid Glass refresh 2026-05-27.
 *
 * Modo rápido / profundo en mode segmented control. Form glass con inputs
 * magenta-focus. Verdict pill SVG (sin emojis). Listado de research guardado
 * en glass cards.
 */
export function ResearchPanel({ initialItems }: Props) {
  const [items, setItems] = useState<Research[]>(initialItems);
  const [niche, setNiche] = useState('');
  const [language, setLanguage] = useState('en');
  const [mode, setMode] = useState<Mode>('quick');
  const [jobId, setJobId] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedResearch | null>(null);
  const [launching, setLaunching] = useState(false);
  const [jobRunning, setJobRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  // ANTES `canLaunch` exigía `!jobId`, pero jobId no se limpiaba nunca al terminar
  // → el botón quedaba deshabilitado PARA SIEMPRE (no se podía lanzar una 2ª
  // investigación sin recargar la página). Rastreamos "running" aparte y lo
  // liberamos cuando el job alcanza estado terminal (ResearchJobView.onFinished),
  // conservando jobId para que la vista del job siga visible.
  const handleJobFinished = useCallback(() => setJobRunning(false), []);

  async function launch() {
    setErr(null);
    setParsed(null);
    setJobId(null);
    setJobRunning(false);
    setLaunching(true);
    try {
      const r = await fetch('/api/lab/research', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ niche: niche.trim(), language, mode }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setJobId(j.job.jobId);
      setJobRunning(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLaunching(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar esta investigación?')) return;
    const r = await fetch(`/api/lab/research/${id}`, { method: 'DELETE' });
    if (!r.ok) return;
    setItems(items.filter((i) => i.id !== id));
  }

  async function saveDeep() {
    if (!parsed) return;
    try {
      const r = await fetch('/api/lab/research', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'deep',
          niche: niche.trim(),
          keywords: parsed.keywordResearch.map((k) => k.keyword),
          channelDraftId: null,
          summary: parsed.summary,
          outliers: parsed.outliers,
          breakoutChannels: parsed.breakoutChannels,
          keywordResearch: parsed.keywordResearch,
          verdict: parsed.verdict,
          rawReport: parsed.rawReport,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setItems([j.research, ...items]);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const canLaunch = niche.trim().length >= 3 && !launching && !jobRunning;

  return (
    <div className="space-y-5">
      <div className="glass rounded-[24px] p-5">
        {/* Mode toggle */}
        <div className="mb-4 flex gap-2">
          <ModeBtn active={mode === 'quick'} onClick={() => setMode('quick')}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            Rápido
          </ModeBtn>
          <ModeBtn active={mode === 'deep'} onClick={() => setMode('deep')}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            Profundo (guarda)
          </ModeBtn>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <input
            type="text"
            placeholder="Nicho a investigar — ej. 'historia romana faceless'"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            className={`${INPUT_CLS} md:col-span-2`}
          />
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className={INPUT_CLS}
          >
            <option value="en">Inglés</option>
            <option value="es">Español</option>
            <option value="pt">Portugués</option>
            <option value="it">Italiano</option>
            <option value="fr">Francés</option>
          </select>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-[11px] text-zinc-500">
            {mode === 'quick'
              ? 'Resultado solo en pantalla. ~5 min.'
              : 'Resultado más extenso + persistencia opcional. ~15 min.'}
          </p>
          <button
            type="button"
            onClick={launch}
            disabled={!canLaunch}
            className={
              canLaunch
                ? 'inline-flex items-center gap-2 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/20 px-4 py-1.5 text-sm font-medium text-fuchsia-200 backdrop-blur-md transition hover:bg-fuchsia-500/30'
                : 'inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-sm font-medium text-zinc-600'
            }
            style={
              canLaunch
                ? {
                    boxShadow:
                      'inset 0 1px 0 0 rgba(255,255,255,0.18), 0 0 16px -4px rgba(217,70,239,0.45)',
                  }
                : undefined
            }
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="6 4 20 12 6 20 6 4" />
            </svg>
            {launching ? 'Lanzando…' : 'Investigar'}
          </button>
        </div>

        {err && (
          <div className="mt-3 rounded-2xl border border-red-500/40 bg-red-500/5 p-3 text-xs text-red-300">
            <span className="font-medium">Error:</span> {err}
          </div>
        )}
      </div>

      {jobId && <ResearchJobView jobId={jobId} onParsed={setParsed} onFinished={handleJobFinished} />}

      {parsed && (
        <div className="glass rounded-[24px] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${
                VERDICT_PILL[parsed.verdict].cls
              }`}
            >
              {VERDICT_PILL[parsed.verdict].icon}
              {VERDICT_PILL[parsed.verdict].label}
            </span>
            {mode === 'deep' && (
              <button
                type="button"
                onClick={saveDeep}
                className="inline-flex items-center gap-2 rounded-full border border-green-500/40 bg-green-500/20 px-4 py-1.5 text-xs font-medium text-green-200 backdrop-blur-md transition hover:bg-green-500/30"
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
                >
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <path d="M17 21v-8H7v8M7 3v5h8" />
                </svg>
                Guardar en research.json
              </button>
            )}
          </div>
          <p className="text-sm leading-relaxed text-zinc-200">{parsed.summary}</p>

          {parsed.outliers.length > 0 && (
            <details
              className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03]"
              open
            >
              <summary className="cursor-pointer px-4 py-2.5 text-[11px] font-medium uppercase tracking-label text-zinc-500 hover:text-zinc-300">
                Outliers ({parsed.outliers.length})
              </summary>
              <ul className="space-y-1 px-4 pb-4 text-xs text-zinc-300">
                {parsed.outliers.slice(0, 10).map((o, i) => (
                  <li
                    key={i}
                    className="border-t border-white/5 py-1.5 first:border-t-0"
                  >
                    <a
                      href={o.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-sky-300 underline-offset-2 hover:underline"
                    >
                      {o.title}
                    </a>
                    <span className="ml-2 text-zinc-500">
                      @{o.channel} ·{' '}
                      <span className="nums">{o.views.toLocaleString()}</span>{' '}
                      views · <span className="nums">{o.vph.toFixed(1)}</span> VPH
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <details className="mt-2 rounded-2xl border border-white/10 bg-white/[0.03]">
            <summary className="cursor-pointer px-4 py-2.5 text-[11px] font-medium uppercase tracking-label text-zinc-500 hover:text-zinc-300">
              Informe completo
            </summary>
            <pre className="whitespace-pre-wrap px-4 pb-4 text-[11px] leading-relaxed text-zinc-300">
              {parsed.rawReport}
            </pre>
          </details>
        </div>
      )}

      <div>
        <h4 className="mb-3 text-[11px] font-medium uppercase tracking-label text-zinc-500">
          Investigaciones guardadas ({items.length})
        </h4>
        {items.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Aún no hay investigaciones profundas guardadas.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((r) => (
              <li key={r.id} className="glass glass-hover rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          VERDICT_PILL[r.verdict].cls
                        }`}
                      >
                        {VERDICT_PILL[r.verdict].icon}
                        {VERDICT_PILL[r.verdict].label}
                      </span>
                      <span className="font-display text-sm font-medium tracking-display text-white">
                        {r.niche}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-zinc-400">
                      {r.summary}
                    </p>
                    <div className="mt-1.5 nums font-mono text-[10px] text-zinc-600">
                      {r.outliers.length} outliers · {r.breakoutChannels.length}{' '}
                      breakout · {r.keywordResearch.length} keywords ·{' '}
                      {new Date(r.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(r.id)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-500 hover:border-red-500/30 hover:text-red-400"
                    title="Eliminar"
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
                    >
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const INPUT_CLS =
  'w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-fuchsia-500/40 focus:bg-white/[0.06] focus:outline-none';

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium transition ${
        active
          ? 'border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-200'
          : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:border-white/20 hover:text-white'
      }`}
      style={
        active
          ? { boxShadow: '0 0 12px -2px rgba(217,70,239,0.4)' }
          : undefined
      }
    >
      {children}
    </button>
  );
}

function ResearchJobView({
  jobId,
  onParsed,
  onFinished,
}: {
  jobId: string;
  onParsed: (p: ParsedResearch) => void;
  onFinished: () => void;
}) {
  const [job, setJob] = useState<ClaudeJob | null>(null);
  const [tail, setTail] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [doneCalled, setDoneCalled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function poll() {
      try {
        const r = await fetch(`/api/lab/research/jobs/${jobId}`, {
          cache: 'no-store',
        });
        const data = await r.json();
        if (!r.ok || !data.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
        if (cancelled) return;
        setJob(data.job);
        setTail(data.tail ?? '');
        if (data.job.status === 'done' && !doneCalled) {
          setDoneCalled(true);
          if (data.parsed) onParsed(data.parsed as ParsedResearch);
        }
        if (data.job.status === 'running') {
          timer = setTimeout(poll, 3000);
        } else {
          // terminal (done/failed/cancelled/timeout) → liberar el botón "Investigar".
          onFinished();
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e));
          onFinished(); // no dejar el botón bloqueado si el poll falla
        }
      }
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, onParsed, onFinished, doneCalled]);

  if (err) {
    return (
      <div className="glass rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-300">
        <span className="font-medium">Error:</span> {err}
      </div>
    );
  }
  if (!job)
    return (
      <div className="glass rounded-2xl p-4 text-xs text-zinc-500">
        Cargando job…
      </div>
    );

  return (
    <div className="glass rounded-[24px] p-5">
      <div className="flex items-center gap-3">
        {job.status === 'running' ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/14 px-2.5 py-0.5 text-[11px] font-medium text-amber-300"
            style={{ boxShadow: '0 0 12px -2px rgba(245,158,11,0.4)' }}
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
            running
          </span>
        ) : job.status === 'done' ? (
          <span className="pill-active">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
            done
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/14 px-2.5 py-0.5 text-[11px] font-medium text-red-300">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
            {job.status}
          </span>
        )}
        <span className="font-display text-sm font-medium tracking-display text-white">
          {job.label}
        </span>
      </div>
      <details
        className="mt-3 rounded-2xl border border-white/10 bg-black/30"
        open={job.status === 'running'}
      >
        <summary className="cursor-pointer px-4 py-2.5 text-[11px] font-medium uppercase tracking-label text-zinc-500 hover:text-zinc-300">
          Log
        </summary>
        <pre className="max-h-72 overflow-auto px-4 pb-4 font-mono text-[11px] leading-relaxed text-zinc-300">
          {tail}
        </pre>
      </details>
    </div>
  );
}
