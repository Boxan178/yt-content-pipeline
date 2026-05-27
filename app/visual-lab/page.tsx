'use client';

import { useCallback, useEffect, useState } from 'react';

type Model = 'nano-banana-2' | 'nano-banana-pro' | 'seedance' | 'veo-3';
type Aspect = '1:1' | '16:9' | '9:16' | '4:5' | '2:3';
type Resolution = '1K' | '2K';
type Format = 'png' | 'jpg' | 'webp';

interface HistoryItem {
  filename: string;
  fileUrl: string;
  size: number;
  createdAt: string;
}

interface CurrentGen {
  fileUrl: string;
  filename: string;
  model: string;
  aspect: string;
  resolution: string;
  createdAt: string;
}

function relTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return 'hace segundos';
  if (diff < 3600) return `hace ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.round(diff / 3600)} h`;
  return new Date(iso).toLocaleString('es-ES');
}

/**
 * Visual Lab — Liquid Glass refresh 2026-05-27.
 *
 * Generador de imágenes directo vía kie-bridge. Fuera del módulo /lab (es una
 * herramienta auxiliar accesible desde el sidebar principal), por eso usa
 * gold como accent en lugar de magenta. Surfaces glass + glass-hover en el
 * historial, form glass con inputs gold-focus.
 */
export default function VisualLabPage() {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<Model>('nano-banana-pro');
  const [aspect, setAspect] = useState<Aspect>('16:9');
  const [resolution, setResolution] = useState<Resolution>('1K');
  const [format, setFormat] = useState<Format>('png');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<CurrentGen | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch('/api/visual/history', { cache: 'no-store' });
      const data = await r.json();
      if (data.ok) setHistory(data.items);
    } catch {}
  }, []);

  useEffect(() => {
    loadHistory();
    const id = setInterval(loadHistory, 10000);
    return () => clearInterval(id);
  }, [loadHistory]);

  const generate = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    setCurrent(null);
    try {
      const r = await fetch('/api/visual/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), model, aspect, resolution, format }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setError(data.error || `HTTP ${r.status}`);
      } else {
        setCurrent({
          fileUrl: data.fileUrl,
          filename: data.filename,
          model: data.model,
          aspect: data.aspect,
          resolution: data.resolution,
          createdAt: data.createdAt,
        });
        loadHistory();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  return (
    <main className="mx-auto max-w-[1400px] px-8 pb-12 pt-2">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-display text-white">
          Visual Lab
        </h1>
        <p className="mt-1.5 text-sm text-zinc-400">
          Generador de imágenes directo vía kie-bridge. Sin pasar por NORA/IRIS,
          para iterar visuales sueltos (intros, recursos, mockups) rápidamente.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Form */}
        <section className="glass rounded-[28px] p-6">
          <h2 className="mb-4 text-[11px] font-medium uppercase tracking-label text-zinc-500">
            Prompt
          </h2>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={10}
            placeholder='Describe la imagen que quieres. Cuanto más concreto y largo, mejor. Ej: "A 1920s editorial cinematic photograph, 16:9, marble bust of Marcus Aurelius wearing wired headphones..."'
            className={`${INPUT_CLS} text-sm leading-relaxed`}
          />
          <p className="mt-1 text-right nums font-mono text-[10px] text-zinc-500">
            {prompt.length} chars
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <SelectField
              label="Modelo"
              value={model}
              onChange={(v) => setModel(v as Model)}
              options={[
                { value: 'nano-banana-pro', label: 'nano-banana-pro (más calidad)' },
                { value: 'nano-banana-2', label: 'nano-banana-2 (más rápido)' },
                { value: 'seedance', label: 'seedance (video)' },
                { value: 'veo-3', label: 'veo-3 (video)' },
              ]}
            />
            <SelectField
              label="Aspect ratio"
              value={aspect}
              onChange={(v) => setAspect(v as Aspect)}
              options={[
                { value: '16:9', label: '16:9 (vídeo / thumb)' },
                { value: '9:16', label: '9:16 (short)' },
                { value: '1:1', label: '1:1 (cuadrado)' },
                { value: '4:5', label: '4:5 (vertical)' },
                { value: '2:3', label: '2:3 (póster)' },
              ]}
            />
            <SelectField
              label="Resolución"
              value={resolution}
              onChange={(v) => setResolution(v as Resolution)}
              options={[
                { value: '1K', label: '1K (más rápido)' },
                { value: '2K', label: '2K (más calidad)' },
              ]}
            />
            <SelectField
              label="Formato"
              value={format}
              onChange={(v) => setFormat(v as Format)}
              options={[
                { value: 'png', label: 'PNG (lossless)' },
                { value: 'jpg', label: 'JPG (más pequeño)' },
                { value: 'webp', label: 'WebP (moderno)' },
              ]}
            />
          </div>

          <button
            onClick={generate}
            disabled={busy || !prompt.trim()}
            className="btn-gold mt-4 w-full justify-center disabled:opacity-50"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Generando ({model} · {resolution})… puede tardar 30-90s
              </span>
            ) : (
              <>
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
                  <path d="M12 22a10 10 0 1 1 10-10c0 2.5-2 4.5-4.5 4.5H15a2 2 0 0 0-2 2 2 2 0 0 1-2 2 1 1 0 0 0-1 1 1.5 1.5 0 0 1-1.5 1.5z" />
                </svg>
                Generar imagen
              </>
            )}
          </button>

          {error && (
            <div className="mt-3 rounded-2xl border border-red-500/40 bg-red-500/5 p-3 text-xs text-red-300">
              <p className="mb-1 font-medium uppercase tracking-label">Error</p>
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px]">
                {error}
              </pre>
            </div>
          )}
        </section>

        {/* Resultado actual */}
        <section className="glass rounded-[28px] p-6">
          <h2 className="mb-4 text-[11px] font-medium uppercase tracking-label text-zinc-500">
            Resultado
          </h2>
          {current ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={current.fileUrl} alt="" className="w-full" />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-zinc-500">
                  {current.model} · {current.aspect} · {current.resolution}
                </span>
                <a
                  href={current.fileUrl}
                  download={current.filename}
                  className="btn-glass text-xs"
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
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  Descargar
                </a>
              </div>
            </div>
          ) : (
            <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-white/15 text-sm text-zinc-500">
              {busy ? 'Generando…' : 'Sin resultado todavía.'}
            </div>
          )}
        </section>
      </div>

      {/* Historial */}
      <section className="mt-8">
        <h2 className="mb-4 text-[11px] font-medium uppercase tracking-label text-zinc-500">
          Historial reciente ({history.length})
        </h2>
        {history.length === 0 ? (
          <p className="text-xs text-zinc-500">Sin generaciones todavía.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {history.map((h) => (
              <article
                key={h.filename}
                className="glass glass-hover overflow-hidden rounded-2xl"
              >
                <a href={h.fileUrl} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={h.fileUrl}
                    alt=""
                    className="aspect-video w-full bg-black object-contain"
                  />
                </a>
                <div className="p-3">
                  <p
                    className="line-clamp-1 font-mono text-[10px] text-zinc-300"
                    title={h.filename}
                  >
                    {h.filename}
                  </p>
                  <p className="mt-0.5 nums text-[10px] text-zinc-500">
                    {relTime(h.createdAt)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const INPUT_CLS =
  'w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-accent/40 focus:bg-white/[0.06] focus:outline-none';

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-label text-zinc-500">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLS}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
