'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LabSidebar } from '@/components/lab/LabSidebar';
import { WizardStepLayout } from '@/components/lab/WizardStepLayout';
import type { DraftLanguage } from '@/lib/lab/types';

const LANGUAGES: Array<{ value: DraftLanguage; label: string }> = [
  { value: 'en', label: 'Inglés' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Portugués' },
  { value: 'it', label: 'Italiano' },
  { value: 'fr', label: 'Francés' },
  { value: 'other', label: 'Otro' },
];

export default function NewChannelStep1Page() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState<DraftLanguage>('en');
  const [topic, setTopic] = useState('');
  const [transcripts, setTranscripts] = useState<string[]>(['', '']);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const transcriptsFilled = transcripts.filter((t) => t.trim().length > 200);
  const canSubmit =
    !submitting && url.trim().length > 5 && transcriptsFilled.length >= 2;

  async function submit() {
    setErr(null);
    setSubmitting(true);
    try {
      const r = await fetch('/api/lab/channels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          referenceChannelUrl: url.trim(),
          language,
          initialTopic: topic.trim() || 'ideas-please',
          transcripts: transcripts.map((t) => t.trim()).filter((t) => t.length > 0),
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      router.push(`/lab/drafts/${j.draft.id}?step=2`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full">
      <LabSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <WizardStepLayout
          step={1}
          title="1. Referencia"
          subtitle="Pega el canal a clonar, el idioma y un tema inicial. Style-engine necesita 2-3 transcripts completos."
          prevHref="/lab"
          nextHref={canSubmit ? '#' : null}
          nextDisabled={!canSubmit}
          nextLabel={submitting ? 'Creando…' : 'Crear draft y continuar →'}
          onNext={() => {
            // El href "#" no navega — el submit se dispara desde el botón explícito de abajo.
          }}
        >
          <div className="mx-auto max-w-3xl space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                URL del canal de referencia
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/@somecanal"
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Idioma principal
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as DraftLanguage)}
                  className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Tema inicial (opcional)
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="ej. La caída del Imperio Romano  |  vacío = ideas-please"
                  className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent"
                />
              </div>
            </div>

            {transcripts.map((t, idx) => (
              <div key={idx}>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Transcript #{idx + 1} {idx >= 2 ? '(opcional)' : '(obligatorio)'}
                </label>
                <textarea
                  value={t}
                  onChange={(e) => {
                    const copy = [...transcripts];
                    copy[idx] = e.target.value;
                    setTranscripts(copy);
                  }}
                  rows={6}
                  placeholder="Pega el transcript COMPLETO del vídeo aquí (sin resumir)."
                  className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-xs text-white outline-none focus:border-accent font-mono"
                />
                <div className="mt-1 text-[10px] text-zinc-500">
                  {t.trim().length} caracteres
                  {t.trim().length > 0 && t.trim().length < 200 && (
                    <span className="ml-2 text-amber-400">
                      Demasiado corto — pega el transcript completo.
                    </span>
                  )}
                </div>
              </div>
            ))}

            {transcripts.length < 3 && (
              <button
                type="button"
                onClick={() => setTranscripts([...transcripts, ''])}
                className="text-xs text-accent hover:underline"
              >
                + Añadir un tercer transcript (recomendado)
              </button>
            )}

            {err && (
              <div className="rounded border border-red-700/60 bg-red-900/20 p-3 text-sm text-red-300">
                Error: {err}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className={`rounded-md border px-5 py-2 text-sm font-semibold transition ${
                  canSubmit
                    ? 'border-accent/60 bg-accent/20 text-accent hover:bg-accent/30'
                    : 'cursor-not-allowed border-border bg-panel text-zinc-600'
                }`}
              >
                {submitting ? 'Creando…' : 'Crear draft y continuar →'}
              </button>
            </div>
          </div>
        </WizardStepLayout>
      </div>
    </div>
  );
}
