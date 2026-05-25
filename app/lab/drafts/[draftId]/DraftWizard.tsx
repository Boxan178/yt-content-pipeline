'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WizardStepLayout } from '@/components/lab/WizardStepLayout';
import { StyleEngineJobView } from '@/components/lab/StyleEngineJobView';
import { ValidationReportView } from '@/components/lab/ValidationReport';
import type { ChannelDraft, ValidationReport, WizardStep } from '@/lib/lab/types';

interface Props {
  initialDraft: ChannelDraft;
  initialStep: WizardStep;
}

export function DraftWizard({ initialDraft, initialStep }: Props) {
  const [draft, setDraft] = useState<ChannelDraft>(initialDraft);
  const [step, setStep] = useState<WizardStep>(initialStep);
  const router = useRouter();

  const stepHref = useCallback(
    (n: WizardStep) => `/lab/drafts/${draft.id}?step=${n}`,
    [draft.id],
  );

  // Persiste un patch en el draft y refresca el estado local.
  const persist = useCallback(
    async (patch: Partial<ChannelDraft>) => {
      const r = await fetch(`/api/lab/channels/${draft.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setDraft(j.draft);
      return j.draft as ChannelDraft;
    },
    [draft.id],
  );

  function goto(n: WizardStep) {
    setStep(n);
    router.push(stepHref(n));
  }

  if (step === 2) {
    return (
      <Step2Analysis
        draft={draft}
        persist={persist}
        onNext={() => goto(3)}
        onBack={() => goto(1)}
      />
    );
  }
  if (step === 3) {
    return (
      <Step3Visuals
        draft={draft}
        persist={persist}
        onNext={() => goto(4)}
        onBack={() => goto(2)}
      />
    );
  }
  if (step === 4) {
    return (
      <Step4Validation
        draft={draft}
        persist={persist}
        onNext={() => goto(5)}
        onBack={() => goto(2)}
      />
    );
  }
  if (step === 5) {
    return (
      <Step5Bootstrap
        draft={draft}
        persist={persist}
        onBack={() => goto(4)}
      />
    );
  }
  // step === 1 (no debería llegar — el form vive en /lab/new-channel)
  return (
    <div className="p-6">
      <p className="text-sm text-zinc-400">
        Paso 1 ya completado. Salta al paso 2 para iniciar el análisis.
      </p>
      <button
        onClick={() => goto(2)}
        className="mt-3 rounded-md border border-accent/60 bg-accent/20 px-4 py-2 text-sm text-accent"
      >
        Ir al paso 2 →
      </button>
    </div>
  );
}

// ── STEP 2 ────────────────────────────────────────────────────────────────

interface StepProps {
  draft: ChannelDraft;
  persist: (patch: Partial<ChannelDraft>) => Promise<ChannelDraft>;
  onNext: () => void;
  onBack: () => void;
}

function Step2Analysis({ draft, persist, onNext, onBack }: StepProps) {
  const [jobId, setJobId] = useState<string | null>(
    // Si el draft ya tiene un análisis persistido, no relanzamos.
    draft.styleDna ? null : null,
  );
  const [launching, setLaunching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasAnalysis = !!draft.styleDna && !!draft.channelAnalysis;

  async function launch() {
    setErr(null);
    setLaunching(true);
    try {
      const r = await fetch(`/api/lab/channels/${draft.id}/analyze`, {
        method: 'POST',
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

  const handleDone = useCallback(
    async (resp: { parsed?: unknown }) => {
      const parsed = resp.parsed as {
        channelAnalysis?: string;
        styleDna?: string;
        scriptSample?: string;
      } | undefined;
      if (!parsed) return;
      try {
        await persist({
          channelAnalysis: parsed.channelAnalysis,
          styleDna: parsed.styleDna,
          scriptSample: parsed.scriptSample,
          currentStep: 2,
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [persist],
  );

  return (
    <WizardStepLayout
      step={2}
      title="2. Análisis del canal y Style DNA"
      subtitle="Lanza style-engine sobre los transcripts. Pinta análisis, Style DNA y script style-locked."
      prevHref={null}
      nextHref={hasAnalysis ? '#' : null}
      nextDisabled={!hasAnalysis}
      nextLabel="Siguiente: visual →"
      onNext={onNext}
    >
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="rounded-md border border-border bg-bg/60 p-4 text-xs text-zinc-400">
          <div>
            <span className="font-semibold text-zinc-300">Canal:</span>{' '}
            {draft.referenceChannelUrl}
          </div>
          <div>
            <span className="font-semibold text-zinc-300">Idioma:</span> {draft.language}
          </div>
          <div>
            <span className="font-semibold text-zinc-300">Tema:</span> {draft.initialTopic || '(ideas-please)'}
          </div>
          <div>
            <span className="font-semibold text-zinc-300">Transcripts:</span>{' '}
            {draft.transcripts.length} cargados
          </div>
        </div>

        {hasAnalysis ? (
          <div className="space-y-4">
            <ParsedBlock title="ANÁLISIS DEL CANAL" body={draft.channelAnalysis ?? ''} />
            <ParsedBlock title="STYLE DNA" body={draft.styleDna ?? ''} />
            {draft.scriptSample && (
              <ParsedBlock title="SCRIPT STYLE-LOCKED" body={draft.scriptSample} />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={launch}
                disabled={launching}
                className="rounded-md border border-border bg-panel px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500"
              >
                {launching ? 'Relanzando…' : 'Re-lanzar análisis'}
              </button>
              <button
                type="button"
                onClick={() => onBack()}
                className="rounded-md border border-border bg-panel px-3 py-1.5 text-xs text-zinc-400"
              >
                Editar transcripts (paso 1)
              </button>
            </div>
          </div>
        ) : jobId ? (
          <StyleEngineJobView
            draftId={draft.id}
            jobId={jobId}
            parseMode="analyze"
            onDone={handleDone}
          />
        ) : (
          <div className="rounded-md border border-amber-700/40 bg-amber-900/10 p-4">
            <h3 className="text-sm font-semibold text-amber-200">
              Listo para lanzar style-engine
            </h3>
            <p className="mt-1 text-xs text-amber-100/80">
              Ejecutará STATES 1-6 en una sola sesión claude -p no interactiva
              (~5-15 min según longitud de los transcripts).
            </p>
            <button
              type="button"
              onClick={launch}
              disabled={launching}
              className="mt-3 rounded-md border border-accent/60 bg-accent/20 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/30"
            >
              {launching ? 'Lanzando…' : '🚀 Lanzar análisis'}
            </button>
          </div>
        )}

        {err && (
          <div className="rounded border border-red-700/60 bg-red-900/20 p-3 text-sm text-red-300">
            Error: {err}
          </div>
        )}
      </div>
    </WizardStepLayout>
  );
}

// ── STEP 3 ────────────────────────────────────────────────────────────────

function Step3Visuals({ draft, persist, onNext, onBack }: StepProps) {
  const [frames, setFrames] = useState<string[]>(draft.sampleFrameUrls);
  const [thumbs, setThumbs] = useState<string[]>(draft.thumbnailSampleUrls);
  const [jobId, setJobId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasVisuals = !!draft.visualStyleProfile && !!draft.thumbnailStyleProfile;

  async function saveAndLaunch() {
    setErr(null);
    setLaunching(true);
    try {
      const cleanFrames = frames.map((f) => f.trim()).filter(Boolean);
      const cleanThumbs = thumbs.map((f) => f.trim()).filter(Boolean);
      if (cleanFrames.length < 3) throw new Error('Sube al menos 3 frames del vídeo.');
      if (cleanThumbs.length < 2) throw new Error('Sube al menos 2 thumbnails de referencia.');
      await persist({
        sampleFrameUrls: cleanFrames,
        thumbnailSampleUrls: cleanThumbs,
        currentStep: 3,
      });
      const r = await fetch(`/api/lab/channels/${draft.id}/visuals`, { method: 'POST' });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setJobId(j.job.jobId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLaunching(false);
    }
  }

  const handleDone = useCallback(
    async (resp: { parsed?: unknown }) => {
      const parsed = resp.parsed as {
        visualStyleProfile?: string;
        thumbnailStyleProfile?: string;
        thumbnailConcepts?: Array<{ header: string; body: string }>;
      } | undefined;
      if (!parsed) return;
      try {
        await persist({
          visualStyleProfile: parsed.visualStyleProfile,
          thumbnailStyleProfile: parsed.thumbnailStyleProfile,
          // El parsedThumbnailConcepts es bruto — lo guardamos como JSON simple
          // en el campo thumbnailConcepts (estructura libre, refinamos en futuras
          // versiones).
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [persist],
  );

  return (
    <WizardStepLayout
      step={3}
      title="3. Visual y thumbnails"
      subtitle="Sube paths absolutos de 3-5 frames del vídeo y 2-3 thumbnails de referencia. Style-engine genera Visual Style Profile + Thumbnail Style Profile + 5 conceptos."
      prevHref={`/lab/drafts/${draft.id}?step=2`}
      nextHref={hasVisuals ? '#' : null}
      nextDisabled={!hasVisuals}
      nextLabel="Siguiente: validación →"
      onNext={onNext}
    >
      <div className="mx-auto max-w-4xl space-y-5">
        <PathArrayField
          label="Frames del vídeo (paths absolutos en disco)"
          values={frames}
          onChange={setFrames}
          placeholder="C:/Users/.../frame-01.png  |  H:/YOUTUBE/.../still.jpg"
          min={3}
          max={5}
        />
        <PathArrayField
          label="Thumbnails de referencia (paths absolutos)"
          values={thumbs}
          onChange={setThumbs}
          placeholder="C:/Users/.../thumb-01.png"
          min={2}
          max={3}
        />

        {hasVisuals ? (
          <div className="space-y-4">
            <ParsedBlock title="VISUAL STYLE PROFILE" body={draft.visualStyleProfile ?? ''} />
            <ParsedBlock title="THUMBNAIL STYLE PROFILE" body={draft.thumbnailStyleProfile ?? ''} />
            <button
              type="button"
              onClick={saveAndLaunch}
              disabled={launching}
              className="rounded-md border border-border bg-panel px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500"
            >
              {launching ? 'Relanzando…' : 'Re-lanzar análisis visual'}
            </button>
          </div>
        ) : jobId ? (
          <StyleEngineJobView
            draftId={draft.id}
            jobId={jobId}
            parseMode="visuals"
            onDone={handleDone}
          />
        ) : (
          <div className="rounded-md border border-amber-700/40 bg-amber-900/10 p-4">
            <h3 className="text-sm font-semibold text-amber-200">
              Listo para lanzar style-engine (visual)
            </h3>
            <p className="mt-1 text-xs text-amber-100/80">
              Ejecuta STATES 7-9 + 11-13. Genera prompts de imagen por beat del
              script previo + 5 conceptos de thumbnail.
            </p>
            <button
              type="button"
              onClick={saveAndLaunch}
              disabled={launching}
              className="mt-3 rounded-md border border-accent/60 bg-accent/20 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/30"
            >
              {launching ? 'Lanzando…' : '🚀 Lanzar análisis visual'}
            </button>
          </div>
        )}

        {err && (
          <div className="rounded border border-red-700/60 bg-red-900/20 p-3 text-sm text-red-300">
            Error: {err}
          </div>
        )}
      </div>
    </WizardStepLayout>
  );
}

// ── STEP 4 — Validación de nicho ──────────────────────────────────────────

function Step4Validation({ draft, persist, onNext, onBack }: StepProps) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const report = draft.validation;

  async function launch() {
    setErr(null);
    setLaunching(true);
    try {
      const r = await fetch(`/api/lab/channels/${draft.id}/validate`, { method: 'POST' });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setJobId(j.job.jobId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLaunching(false);
    }
  }

  const handleDone = useCallback(
    async (resp: { parsed?: unknown }) => {
      const parsed = resp.parsed as ValidationReport | null;
      if (!parsed) {
        setErr('MARIO terminó pero no pude parsear el bloque VALIDATION_JSON. Revisa el log.');
        return;
      }
      try {
        await persist({ validation: parsed, currentStep: 4 });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [persist],
  );

  return (
    <WizardStepLayout
      step={4}
      title="4. Validación de nicho"
      subtitle="MARIO + Algrow MCP. Veredicto 🟢/🟡/🔴 + scores demand/saturation + wedges + risks."
      prevHref={`/lab/drafts/${draft.id}?step=3`}
      nextHref={report ? '#' : null}
      nextDisabled={!report || report.verdict === 'red'}
      nextLabel="Siguiente: bootstrap →"
      onNext={() => onNext()}
    >
      <div className="mx-auto max-w-4xl space-y-5">
        {report ? (
          <>
            <ValidationReportView report={report} />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={launch}
                disabled={launching}
                className="rounded-md border border-border bg-panel px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500"
              >
                {launching ? 'Re-lanzando…' : 'Re-validar'}
              </button>
              <button
                type="button"
                onClick={() => onBack()}
                className="rounded-md border border-border bg-panel px-3 py-1.5 text-xs text-zinc-400"
              >
                ← Volver al paso 2 (re-investigar nicho)
              </button>
              {report.verdict === 'red' && (
                <button
                  type="button"
                  onClick={() => onNext()}
                  className="rounded-md border border-red-700/40 bg-red-900/20 px-3 py-1.5 text-xs text-red-200 hover:bg-red-900/30"
                  title="Pablo eligió permitir crear pese al rojo"
                >
                  Crear canal pese al rojo →
                </button>
              )}
            </div>
          </>
        ) : jobId ? (
          <StyleEngineJobView
            draftId={draft.id}
            jobId={jobId}
            parseMode="validate"
            onDone={handleDone}
          />
        ) : (
          <div className="rounded-md border border-amber-700/40 bg-amber-900/10 p-4">
            <h3 className="text-sm font-semibold text-amber-200">
              Lanzar MARIO + Algrow
            </h3>
            <p className="mt-1 text-xs text-amber-100/80">
              MARIO usará las herramientas Algrow (resolve_url, channel_trends,
              search_viral_videos, search_longform_channels) y devolverá un
              veredicto JSON con scores y wedges defendibles. ~5-15 min.
            </p>
            <button
              type="button"
              onClick={launch}
              disabled={launching}
              className="mt-3 rounded-md border border-accent/60 bg-accent/20 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/30"
            >
              {launching ? 'Lanzando…' : '🚀 Lanzar validación'}
            </button>
          </div>
        )}

        {err && (
          <div className="rounded border border-red-700/60 bg-red-900/20 p-3 text-sm text-red-300">
            Error: {err}
          </div>
        )}
      </div>
    </WizardStepLayout>
  );
}

// ── STEP 5 (stub for Fase B; full UI lands in Fase D) ─────────────────────

function Step5Bootstrap({ draft, onBack }: { draft: ChannelDraft; persist: StepProps['persist']; onBack: () => void }) {
  return (
    <WizardStepLayout
      step={5}
      title="5. Bootstrap"
      subtitle="STATE 16 completo: nombre + descripción + logo + banner + estructura en disco."
      prevHref={`/lab/drafts/${draft.id}?step=4`}
      nextHref={null}
    >
      <div className="mx-auto max-w-3xl rounded-md border border-amber-700/40 bg-amber-900/10 p-4 text-sm text-amber-200">
        Pantalla pendiente (Fase D del LAB-PLAN).
      </div>
    </WizardStepLayout>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────

function ParsedBlock({ title, body }: { title: string; body: string }) {
  return (
    <details className="rounded-md border border-emerald-700/40 bg-emerald-900/10" open>
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
        ✓ {title}
      </summary>
      <pre className="whitespace-pre-wrap px-3 py-2 text-[12px] leading-snug text-emerald-50/90">
        {body}
      </pre>
    </details>
  );
}

interface PathArrayFieldProps {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  min: number;
  max: number;
}

function PathArrayField({ label, values, onChange, placeholder, min, max }: PathArrayFieldProps) {
  // Aseguramos al menos `min` campos visibles.
  const padded = values.length < min ? [...values, ...Array(min - values.length).fill('')] : values;
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </label>
      <div className="mt-1 space-y-1">
        {padded.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={v}
              onChange={(e) => {
                const copy = [...padded];
                copy[i] = e.target.value;
                onChange(copy);
              }}
              placeholder={placeholder}
              className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-xs text-white outline-none focus:border-accent font-mono"
            />
            {padded.length > min && (
              <button
                type="button"
                onClick={() => onChange(padded.filter((_, j) => j !== i))}
                className="text-xs text-zinc-500 hover:text-red-400"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      {padded.length < max && (
        <button
          type="button"
          onClick={() => onChange([...padded, ''])}
          className="mt-1 text-xs text-accent hover:underline"
        >
          + Añadir otro
        </button>
      )}
    </div>
  );
}
