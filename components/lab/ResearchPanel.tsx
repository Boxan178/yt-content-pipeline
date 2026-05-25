'use client';

import { useEffect, useState } from 'react';
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
  breakoutChannels: Array<{ name: string; url: string; growthRate: number; reason: string }>;
  keywordResearch: Array<{ keyword: string; volume: number; competition: number; trend: 'up' | 'flat' | 'down' }>;
  rawReport: string;
}

const VERDICT_BADGE: Record<ValidationVerdict, { bg: string; text: string; emoji: string }> = {
  green: { bg: 'bg-emerald-700/30 border-emerald-600/40', text: 'text-emerald-200', emoji: '🟢' },
  yellow: { bg: 'bg-amber-700/30 border-amber-600/40', text: 'text-amber-200', emoji: '🟡' },
  red: { bg: 'bg-red-700/30 border-red-600/40', text: 'text-red-200', emoji: '🔴' },
};

export function ResearchPanel({ initialItems }: Props) {
  const [items, setItems] = useState<Research[]>(initialItems);
  const [niche, setNiche] = useState('');
  const [language, setLanguage] = useState('en');
  const [mode, setMode] = useState<Mode>('quick');
  const [jobId, setJobId] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedResearch | null>(null);
  const [launching, setLaunching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function launch() {
    setErr(null);
    setParsed(null);
    setJobId(null);
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

  const canLaunch = niche.trim().length >= 3 && !launching && !jobId;

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-border bg-panel/40 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <ModeBtn active={mode === 'quick'} onClick={() => setMode('quick')}>
            ⚡ Rápido
          </ModeBtn>
          <ModeBtn active={mode === 'deep'} onClick={() => setMode('deep')}>
            🔬 Profundo (guarda)
          </ModeBtn>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <input
            type="text"
            placeholder="Nicho a investigar — ej. 'historia romana faceless'"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-white focus:border-accent md:col-span-2"
          />
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-white focus:border-accent"
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
            className={`rounded-md border px-4 py-1.5 text-xs font-semibold ${
              canLaunch
                ? 'border-accent/60 bg-accent/20 text-accent hover:bg-accent/30'
                : 'cursor-not-allowed border-border bg-panel text-zinc-600'
            }`}
          >
            {launching ? 'Lanzando…' : '🚀 Investigar'}
          </button>
        </div>
        {err && (
          <div className="mt-2 rounded border border-red-700/60 bg-red-900/20 p-2 text-xs text-red-300">
            Error: {err}
          </div>
        )}
      </div>

      {jobId && (
        <ResearchJobView
          jobId={jobId}
          onParsed={setParsed}
        />
      )}

      {parsed && (
        <div className="rounded-md border border-border bg-panel/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className={`inline-flex items-center gap-2 rounded-md border px-3 py-1 ${VERDICT_BADGE[parsed.verdict].bg} ${VERDICT_BADGE[parsed.verdict].text}`}>
              <span>{VERDICT_BADGE[parsed.verdict].emoji}</span>
              <span className="text-sm font-semibold">{parsed.verdict.toUpperCase()}</span>
            </div>
            {mode === 'deep' && (
              <button
                type="button"
                onClick={saveDeep}
                className="rounded-md border border-emerald-600/60 bg-emerald-700/30 px-3 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-700/40"
              >
                💾 Guardar en research.json
              </button>
            )}
          </div>
          <p className="text-sm text-zinc-300">{parsed.summary}</p>
          {parsed.outliers.length > 0 && (
            <details className="mt-3 rounded border border-border bg-bg/40" open>
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-zinc-300">
                Outliers ({parsed.outliers.length})
              </summary>
              <ul className="px-3 py-2 text-xs text-zinc-300">
                {parsed.outliers.slice(0, 10).map((o, i) => (
                  <li key={i} className="border-t border-border py-1 first:border-t-0">
                    <a href={o.url} target="_blank" rel="noreferrer" className="font-semibold text-sky-400 hover:underline">
                      {o.title}
                    </a>
                    <span className="ml-2 text-zinc-500">
                      @{o.channel} · {o.views.toLocaleString()} views · {o.vph.toFixed(1)} VPH
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <details className="mt-2 rounded border border-border bg-bg/40">
            <summary className="cursor-pointer px-3 py-2 text-xs text-zinc-400">
              Informe completo
            </summary>
            <pre className="whitespace-pre-wrap px-3 py-2 text-[11px] text-zinc-300">
              {parsed.rawReport}
            </pre>
          </details>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">
          Investigaciones guardadas ({items.length})
        </h4>
        {items.length === 0 ? (
          <p className="text-sm text-zinc-500">Aún no hay investigaciones profundas guardadas.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((r) => {
              const badge = VERDICT_BADGE[r.verdict];
              return (
                <li key={r.id} className="rounded-md border border-border bg-panel p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.bg} ${badge.text}`}>
                          {badge.emoji} {r.verdict}
                        </span>
                        <span className="text-sm font-semibold text-white">{r.niche}</span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-400">{r.summary}</p>
                      <div className="mt-1 text-[10px] text-zinc-500">
                        {r.outliers.length} outliers · {r.breakoutChannels.length} canales breakout · {r.keywordResearch.length} keywords ·{' '}
                        {new Date(r.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(r.id)}
                      className="text-xs text-zinc-500 hover:text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
        active
          ? 'border-accent/60 bg-accent/20 text-accent'
          : 'border-border bg-panel text-zinc-400 hover:border-zinc-500 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function ResearchJobView({ jobId, onParsed }: { jobId: string; onParsed: (p: ParsedResearch) => void }) {
  const [job, setJob] = useState<ClaudeJob | null>(null);
  const [tail, setTail] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [doneCalled, setDoneCalled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function poll() {
      try {
        const r = await fetch(`/api/lab/research/jobs/${jobId}`, { cache: 'no-store' });
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
  }, [jobId, onParsed, doneCalled]);

  if (err) {
    return <div className="rounded border border-red-700/60 bg-red-900/20 p-3 text-sm text-red-300">Error: {err}</div>;
  }
  if (!job) return <div className="text-xs text-zinc-500">Cargando job…</div>;

  return (
    <div className="rounded-md border border-border bg-panel/40 p-4">
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            job.status === 'running' ? 'animate-pulse bg-amber-400' : job.status === 'done' ? 'bg-emerald-500' : 'bg-red-500'
          }`}
        />
        <span className="font-semibold text-white">{job.label}</span>
        <span className="text-xs text-zinc-500">· {job.status}</span>
      </div>
      <details className="mt-2 rounded border border-border bg-bg/60" open={job.status === 'running'}>
        <summary className="cursor-pointer px-3 py-2 text-xs text-zinc-400">Log</summary>
        <pre className="max-h-72 overflow-auto px-3 py-2 text-[11px] text-zinc-300">{tail}</pre>
      </details>
    </div>
  );
}
