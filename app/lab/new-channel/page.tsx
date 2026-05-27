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

/**
 * New channel wizard step 1 — Liquid Glass refresh 2026-05-27.
 *
 * Form de entrada al wizard. Inputs glass con focus magenta, label uppercase
 * tracking-label. CTA magenta principal al final.
 */
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
          title="Referencia"
          subtitle="Pega el canal a clonar, el idioma y un tema inicial. Style-engine necesita 2-3 transcripts completos."
          prevHref="/lab"
          nextHref={null}
        >
          <div className="mx-auto max-w-3xl space-y-5">
            <FormField label="URL del canal de referencia">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/@somecanal"
                className={INPUT_CLS}
              />
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Idioma principal">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as DraftLanguage)}
                  className={INPUT_CLS}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Tema inicial (opcional)"
                helper="Vacío = ideas-please"
              >
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Ej. La caída del Imperio Romano"
                  className={INPUT_CLS}
                />
              </FormField>
            </div>

            {transcripts.map((t, idx) => (
              <FormField
                key={idx}
                label={`Transcript #${idx + 1} ${
                  idx >= 2 ? '(opcional)' : '(obligatorio)'
                }`}
                helper={
                  <span>
                    <span className="nums font-mono">{t.trim().length}</span>{' '}
                    caracteres
                    {t.trim().length > 0 && t.trim().length < 200 && (
                      <span className="ml-2 text-amber-300">
                        Demasiado corto — pega el transcript completo.
                      </span>
                    )}
                  </span>
                }
              >
                <textarea
                  value={t}
                  onChange={(e) => {
                    const copy = [...transcripts];
                    copy[idx] = e.target.value;
                    setTranscripts(copy);
                  }}
                  rows={6}
                  placeholder="Pega el transcript COMPLETO del vídeo aquí (sin resumir)."
                  className={`${INPUT_CLS} font-mono text-[12px] leading-relaxed`}
                />
              </FormField>
            ))}

            {transcripts.length < 3 && (
              <button
                type="button"
                onClick={() => setTranscripts([...transcripts, ''])}
                className="text-xs font-medium text-fuchsia-300 hover:text-fuchsia-200"
              >
                + Añadir un tercer transcript (recomendado)
              </button>
            )}

            {err && (
              <div className="glass rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-300">
                <span className="font-medium">Error:</span> {err}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className={
                  canSubmit
                    ? 'inline-flex items-center gap-2 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/20 px-6 py-2.5 font-medium text-fuchsia-200 backdrop-blur-md transition hover:bg-fuchsia-500/30'
                    : 'inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-6 py-2.5 font-medium text-zinc-600'
                }
                style={
                  canSubmit
                    ? {
                        boxShadow:
                          'inset 0 1px 0 0 rgba(255,255,255,0.18), 0 0 24px -6px rgba(217,70,239,0.45)',
                      }
                    : undefined
                }
              >
                {submitting ? 'Creando…' : 'Crear draft y continuar'}
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
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </WizardStepLayout>
      </div>
    </div>
  );
}

const INPUT_CLS =
  'w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-fuchsia-500/40 focus:bg-white/[0.06] focus:outline-none';

function FormField({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-label text-zinc-500">
        {label}
      </label>
      {children}
      {helper && <p className="mt-1.5 text-xs text-zinc-500">{helper}</p>}
    </div>
  );
}
