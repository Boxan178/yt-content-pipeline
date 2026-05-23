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
    <main className="mx-auto max-w-6xl px-6 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">🎨 Visual Lab</h1>
        <p className="mt-1 text-sm text-muted">
          Generador de imágenes directo vía kie-bridge. Sin pasar por NORA/IRIS, para iterar visuales sueltos (intros, recursos, mockups) rápidamente.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Form */}
        <section className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={10}
              placeholder='Describe la imagen que quieres. Cuanto más concreto y largo, mejor. Ej: "A 1920s editorial cinematic photograph, 16:9, marble bust of Marcus Aurelius wearing wired headphones..."'
              className="w-full rounded border border-border bg-bg px-3 py-2 text-sm leading-relaxed text-white placeholder-zinc-600 focus:border-accent/60 focus:outline-none"
            />
            <p className="mt-0.5 text-right text-[10px] text-muted">{prompt.length} chars</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted">
                Modelo
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as Model)}
                className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-white"
              >
                <option value="nano-banana-pro">nano-banana-pro (más calidad)</option>
                <option value="nano-banana-2">nano-banana-2 (más rápido)</option>
                <option value="seedance">seedance (video)</option>
                <option value="veo-3">veo-3 (video)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted">
                Aspect ratio
              </label>
              <select
                value={aspect}
                onChange={(e) => setAspect(e.target.value as Aspect)}
                className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-white"
              >
                <option value="16:9">16:9 (vídeo / thumb)</option>
                <option value="9:16">9:16 (short)</option>
                <option value="1:1">1:1 (cuadrado)</option>
                <option value="4:5">4:5 (vertical)</option>
                <option value="2:3">2:3 (póster)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted">
                Resolución
              </label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value as Resolution)}
                className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-white"
              >
                <option value="1K">1K (más rápido)</option>
                <option value="2K">2K (más calidad)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted">
                Formato
              </label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as Format)}
                className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-white"
              >
                <option value="png">PNG (calidad lossless)</option>
                <option value="jpg">JPG (más pequeño)</option>
                <option value="webp">WebP (moderno)</option>
              </select>
            </div>
          </div>

          <button
            onClick={generate}
            disabled={busy || !prompt.trim()}
            className="w-full rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Generando ({model} · {resolution})… puede tardar 30-90s
              </span>
            ) : (
              '🎨 Generar imagen'
            )}
          </button>

          {error && (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <p className="font-semibold">Error</p>
              <pre className="mt-1 whitespace-pre-wrap break-words font-mono">{error}</pre>
            </div>
          )}
        </section>

        {/* Resultado actual */}
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
            Resultado
          </h3>
          {current ? (
            <div className="space-y-2">
              <div className="overflow-hidden rounded-lg border border-border bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={current.fileUrl} alt="" className="w-full" />
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{current.model} · {current.aspect} · {current.resolution}</span>
                <a
                  href={current.fileUrl}
                  download={current.filename}
                  className="rounded border border-border bg-bg px-2 py-1 hover:text-white"
                >
                  💾 Descargar
                </a>
              </div>
            </div>
          ) : (
            <div className="grid h-64 place-items-center rounded-lg border border-dashed border-border text-sm text-muted">
              {busy ? 'Generando…' : 'Sin resultado todavía.'}
            </div>
          )}
        </section>
      </div>

      {/* Historial */}
      <section className="mt-8">
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
          Historial reciente ({history.length})
        </h3>
        {history.length === 0 ? (
          <p className="text-xs text-muted">Sin generaciones todavía.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {history.map((h) => (
              <article
                key={h.filename}
                className="overflow-hidden rounded-lg border border-border bg-panel transition hover:border-accent/60"
              >
                <a href={h.fileUrl} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={h.fileUrl} alt="" className="aspect-video w-full bg-black object-contain" />
                </a>
                <div className="p-2">
                  <p className="line-clamp-1 text-[10px] text-zinc-300" title={h.filename}>
                    {h.filename}
                  </p>
                  <p className="text-[10px] text-muted">{relTime(h.createdAt)}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
