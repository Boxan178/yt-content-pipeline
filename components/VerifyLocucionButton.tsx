'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface VerifyResult {
  status?: string;
  verdict?: string;
  message?: string;
  note?: string;
  audio?: { count?: number; totalSeconds?: number; totalBytes?: number };
  expected?: {
    statedSeconds?: number | null;
    scriptWordCount?: number;
    estimatedSeconds?: number | null;
    hasScript?: boolean;
  };
  transcript?: { wordCount?: number; coveragePercent?: number; similarityPercent?: number; preview?: string };
  error?: string;
  traceback?: string;
}

interface VerifyState {
  status: 'running' | 'done' | 'error' | 'none';
  mode?: 'quick' | 'full';
  stage?: string;
  result?: VerifyResult;
  error?: string;
}

const POLL_MS = 2500;

function fmtSec(s?: number | null) {
  if (s == null) return '—';
  const sec = Math.round(s);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

const VERDICT_STYLE: Record<string, string> = {
  COMPLETA: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  INCOMPLETA: 'border-red-500/40 bg-red-500/10 text-red-200',
  DISCREPANCIA: 'border-red-500/40 bg-red-500/10 text-red-200',
  REVISAR: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200',
  PROBABLE: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200',
  SIN_AUDIO: 'border-white/10 bg-white/5 text-zinc-300',
  SIN_GUION: 'border-white/10 bg-white/5 text-zinc-300',
};

export function VerifyLocucionButton({ folder }: { folder: string }) {
  const [state, setState] = useState<VerifyState | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const r = await fetch(`/api/verify-locucion?folder=${encodeURIComponent(folder)}`, { cache: 'no-store' });
      const data = await r.json();
      if (data.ok) setState(data.state as VerifyState);
      return data.ok ? (data.state as VerifyState) : null;
    } catch {
      return null;
    }
  }, [folder]);

  // Estado inicial (último resultado si lo hay) + retomar polling si seguía corriendo.
  useEffect(() => {
    let cancelled = false;
    fetchState().then((s) => {
      if (!cancelled && s?.status === 'running') schedulePoll();
    });
    return () => {
      cancelled = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder]);

  const schedulePoll = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = setTimeout(async () => {
      const s = await fetchState();
      if (s?.status === 'running') schedulePoll();
    }, POLL_MS);
  }, [fetchState]);

  const start = async () => {
    setStarting(true);
    setStartError(null);
    try {
      const r = await fetch('/api/verify-locucion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder, mode: 'full' }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setStartError(data.error || `HTTP ${r.status}`);
      } else {
        setState({ status: 'running', mode: 'full', stage: 'Arrancando' });
        schedulePoll();
      }
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e));
    }
    setStarting(false);
  };

  const running = state?.status === 'running' || starting;
  const result = state?.result;
  const verdict = result?.verdict;

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-label text-zinc-400">Verificar locución</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Transcribe el audio y lo compara con el guion del packaging.
          </p>
        </div>
        <button
          onClick={start}
          disabled={running}
          className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
        >
          {running ? 'Verificando…' : verdict ? 'Volver a verificar' : 'Verificar'}
        </button>
      </div>

      {startError && <p className="mt-2 text-[11px] text-red-300">{startError}</p>}

      {running && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-400">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
          {state?.stage || 'Trabajando…'}
          <span className="text-zinc-600">· puede tardar 1-3 min con Whisper</span>
        </div>
      )}

      {state?.status === 'error' && (
        <p className="mt-2 text-[11px] text-red-300">Error: {state.error}</p>
      )}

      {!running && verdict && (
        <div className="mt-2 space-y-2">
          <div className={`rounded-xl border px-3 py-2 ${VERDICT_STYLE[verdict] || 'border-white/10 bg-white/5 text-zinc-300'}`}>
            <p className="text-xs font-semibold">{verdict.replace('_', ' ')}</p>
            {result?.message && <p className="mt-0.5 text-[11px] leading-snug opacity-90">{result.message}</p>}
            {result?.note && <p className="mt-1 text-[10px] italic opacity-70">{result.note}</p>}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-[10px] text-zinc-400">
            <div className="rounded-lg bg-black/20 px-2 py-1.5">
              <p className="nums font-display text-sm text-white">{fmtSec(result?.audio?.totalSeconds)}</p>
              <p>audio real</p>
            </div>
            <div className="rounded-lg bg-black/20 px-2 py-1.5">
              <p className="nums font-display text-sm text-white">
                {fmtSec(result?.expected?.estimatedSeconds ?? result?.expected?.statedSeconds)}
              </p>
              <p>esperado</p>
            </div>
            <div className="rounded-lg bg-black/20 px-2 py-1.5">
              <p className="nums font-display text-sm text-white">
                {result?.transcript?.coveragePercent != null ? `${result.transcript.coveragePercent}%` : '—'}
              </p>
              <p>cobertura</p>
            </div>
          </div>

          {result?.transcript?.preview && (
            <details className="text-[11px] text-zinc-400">
              <summary className="cursor-pointer text-[10px] uppercase tracking-label text-zinc-500 transition hover:text-zinc-300">
                Transcripción ({result.transcript.wordCount} palabras · {result.transcript.similarityPercent}% similitud)
              </summary>
              <p className="mt-1 max-h-40 overflow-auto rounded-lg bg-black/20 p-2 leading-snug text-zinc-400">
                {result.transcript.preview}…
              </p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
