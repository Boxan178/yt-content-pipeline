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

// ── STEP 5 — Bootstrap ───────────────────────────────────────────────────

interface ParsedBootstrap {
  nameProposals?: Array<{ index: number; name: string; handle: string; rationale: string }>;
  descriptions?: Array<{ version: 'A' | 'B' | 'C'; body: string }>;
  logoPrompt?: string;
  bannerPrompt?: string;
  finalSummary?: string;
}

function Step5Bootstrap({
  draft,
  persist,
  onBack,
}: {
  draft: ChannelDraft;
  persist: StepProps['persist'];
  onBack: () => void;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [parsed, setParsed] = useState<ParsedBootstrap | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Form fields (auto-pobladas cuando llega el parsed)
  const [chosenName, setChosenName] = useState(draft.bootstrap?.chosenName ?? '');
  const [chosenHandle, setChosenHandle] = useState(draft.bootstrap?.chosenHandle ?? '');
  const [chosenDescription, setChosenDescription] = useState(draft.bootstrap?.chosenDescription ?? '');
  const [descVersion, setDescVersion] = useState<'A' | 'B' | 'C'>(draft.bootstrap?.descriptionVersion ?? 'B');
  const [logoPrompt, setLogoPrompt] = useState(draft.bootstrap?.logoPrompt ?? '');
  const [bannerPrompt, setBannerPrompt] = useState(draft.bootstrap?.bannerPrompt ?? '');
  const [assetMethod, setAssetMethod] = useState<'canva-mcp' | 'nano-banana-manual' | 'both'>(
    draft.bootstrap?.assetGenerationMethod ?? 'nano-banana-manual',
  );

  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<{ diskPath?: string; stdout?: string } | null>(
    draft.bootstrap?.diskPath ? { diskPath: draft.bootstrap.diskPath } : null,
  );

  async function launch() {
    setErr(null);
    setLaunching(true);
    try {
      const r = await fetch(`/api/lab/channels/${draft.id}/bootstrap`, { method: 'POST' });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setJobId(j.job.jobId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLaunching(false);
    }
  }

  const handleDone = useCallback((resp: { parsed?: unknown }) => {
    const p = resp.parsed as ParsedBootstrap | null;
    if (!p) {
      setErr('No pude parsear los bloques del bootstrap. Revisa el log y rellena el formulario manualmente.');
      return;
    }
    setParsed(p);
    if (p.nameProposals && p.nameProposals.length > 0 && !chosenName) {
      const first = p.nameProposals[0];
      setChosenName(first.name);
      setChosenHandle(first.handle);
    }
    if (p.descriptions) {
      const preferred = p.descriptions.find((d) => d.version === descVersion) ?? p.descriptions[0];
      if (preferred && !chosenDescription) {
        setChosenDescription(preferred.body);
        setDescVersion(preferred.version);
      }
    }
    if (p.logoPrompt && !logoPrompt) setLogoPrompt(p.logoPrompt);
    if (p.bannerPrompt && !bannerPrompt) setBannerPrompt(p.bannerPrompt);
  }, [chosenName, chosenDescription, descVersion, logoPrompt, bannerPrompt]);

  async function execute() {
    setErr(null);
    setExecuting(true);
    try {
      const r = await fetch(`/api/lab/channels/${draft.id}/bootstrap/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chosenName: chosenName.trim(),
          chosenHandle: chosenHandle.trim(),
          chosenDescription: chosenDescription.trim(),
          descriptionVersion: descVersion,
          logoPrompt: logoPrompt.trim(),
          bannerPrompt: bannerPrompt.trim(),
          assetGenerationMethod: assetMethod,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setExecuteResult({ diskPath: j.result.diskPath, stdout: j.result.stdout });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setExecuting(false);
    }
  }

  const canExecute =
    chosenName.trim().length >= 2 &&
    chosenHandle.trim().length >= 2 &&
    chosenDescription.trim().length >= 10 &&
    logoPrompt.trim().length >= 10 &&
    bannerPrompt.trim().length >= 10 &&
    !executing;

  // Vista éxito (canal ya bootstrappeado)
  if (executeResult?.diskPath) {
    return (
      <WizardStepLayout
        step={5}
        title="5. Bootstrap completado"
        subtitle="Canal materializado en disco. Próximo paso opcional: crear el primer vídeo."
        prevHref={`/lab/drafts/${draft.id}?step=4`}
        nextHref={null}
      >
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="rounded-md border border-emerald-600/40 bg-emerald-900/20 p-5">
            <h3 className="text-base font-bold text-emerald-200">
              ✅ {chosenName}
            </h3>
            <div className="mt-2 text-sm text-emerald-100/80">
              Path: <code className="font-mono">{executeResult.diskPath}/branding/</code>
            </div>
            {executeResult.stdout && (
              <details className="mt-3 rounded border border-emerald-700/40 bg-emerald-950/40">
                <summary className="cursor-pointer px-3 py-2 text-xs text-emerald-300">
                  Output del script
                </summary>
                <pre className="whitespace-pre-wrap px-3 py-2 text-[11px] text-emerald-50/90">
                  {executeResult.stdout}
                </pre>
              </details>
            )}
          </div>
          <a
            href={`/lab/first-video/${draft.id}`}
            className="inline-block rounded-md border border-accent/60 bg-accent/20 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/30"
          >
            🎬 Crear el primer vídeo →
          </a>
        </div>
      </WizardStepLayout>
    );
  }

  return (
    <WizardStepLayout
      step={5}
      title="5. Bootstrap"
      subtitle="STATE 16 completo: nombre, descripción, logo+banner prompts, estructura en disco."
      prevHref={`/lab/drafts/${draft.id}?step=4`}
      nextHref={null}
    >
      <div className="mx-auto max-w-4xl space-y-5">
        {!parsed && !jobId && (
          <div className="rounded-md border border-amber-700/40 bg-amber-900/10 p-4">
            <h3 className="text-sm font-semibold text-amber-200">
              Lanzar state-engine bootstrap
            </h3>
            <p className="mt-1 text-xs text-amber-100/80">
              Ejecuta B1-B7: propuestas de nombre + descripciones + prompts de
              logo/banner. NO toca disco — eso es el siguiente paso.
            </p>
            <button
              type="button"
              onClick={launch}
              disabled={launching}
              className="mt-3 rounded-md border border-accent/60 bg-accent/20 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/30"
            >
              {launching ? 'Lanzando…' : '🚀 Lanzar state-engine'}
            </button>
          </div>
        )}

        {jobId && !parsed && (
          <StyleEngineJobView
            draftId={draft.id}
            jobId={jobId}
            parseMode="bootstrap"
            onDone={handleDone}
          />
        )}

        {parsed && (
          <>
            {parsed.nameProposals && (
              <Section title="1. Elige el nombre del canal">
                <div className="space-y-2">
                  {parsed.nameProposals.map((p) => {
                    const checked = chosenName === p.name;
                    return (
                      <label
                        key={p.index}
                        className={`block cursor-pointer rounded-md border p-3 transition ${
                          checked
                            ? 'border-accent/60 bg-accent/10'
                            : 'border-border bg-bg/40 hover:border-zinc-500'
                        }`}
                      >
                        <input
                          type="radio"
                          name="name-proposal"
                          checked={checked}
                          onChange={() => {
                            setChosenName(p.name);
                            setChosenHandle(p.handle);
                          }}
                          className="mr-2"
                        />
                        <span className="text-sm font-semibold text-white">{p.name}</span>
                        <span className="ml-2 text-xs text-zinc-500">@{p.handle}</span>
                        <div className="mt-1 ml-5 text-xs text-zinc-400">{p.rationale}</div>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={chosenName}
                    onChange={(e) => setChosenName(e.target.value)}
                    placeholder="Nombre del canal"
                    className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-white focus:border-accent"
                  />
                  <input
                    type="text"
                    value={chosenHandle}
                    onChange={(e) => setChosenHandle(e.target.value)}
                    placeholder="@handle"
                    className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-white focus:border-accent"
                  />
                </div>
              </Section>
            )}

            {parsed.descriptions && (
              <Section title="2. Elige la descripción">
                <div className="space-y-2">
                  {parsed.descriptions.map((d) => {
                    const checked = descVersion === d.version;
                    return (
                      <label
                        key={d.version}
                        className={`block cursor-pointer rounded-md border p-3 transition ${
                          checked
                            ? 'border-accent/60 bg-accent/10'
                            : 'border-border bg-bg/40 hover:border-zinc-500'
                        }`}
                      >
                        <input
                          type="radio"
                          name="desc-version"
                          checked={checked}
                          onChange={() => {
                            setDescVersion(d.version);
                            setChosenDescription(d.body);
                          }}
                          className="mr-2"
                        />
                        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                          Versión {d.version}
                        </span>
                        <div className="mt-1 whitespace-pre-wrap text-xs text-zinc-400">
                          {d.body}
                        </div>
                      </label>
                    );
                  })}
                </div>
                <textarea
                  value={chosenDescription}
                  onChange={(e) => setChosenDescription(e.target.value)}
                  rows={5}
                  placeholder="Descripción final (editable)"
                  className="mt-3 w-full rounded-md border border-border bg-bg px-3 py-2 text-xs text-white focus:border-accent"
                />
              </Section>
            )}

            <Section title="3. Logo prompt (Nano Banana Pro, EN)">
              <textarea
                value={logoPrompt}
                onChange={(e) => setLogoPrompt(e.target.value)}
                rows={5}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-[11px] font-mono text-white focus:border-accent"
              />
            </Section>

            <Section title="4. Banner prompt (2560×1440, safe area central 1546×423)">
              <textarea
                value={bannerPrompt}
                onChange={(e) => setBannerPrompt(e.target.value)}
                rows={5}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-[11px] font-mono text-white focus:border-accent"
              />
            </Section>

            <Section title="5. Vía de generación de assets">
              <div className="space-y-1">
                {(
                  [
                    { v: 'canva-mcp', label: 'Canva MCP (engine llama generate-design)' },
                    { v: 'nano-banana-manual', label: 'Nano Banana Pro manual (pegar prompts en Flow)' },
                    { v: 'both', label: 'Ambos: Canva primero, Nano si no convence' },
                  ] as const
                ).map((opt) => (
                  <label key={opt.v} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                    <input
                      type="radio"
                      name="asset-method"
                      checked={assetMethod === opt.v}
                      onChange={() => setAssetMethod(opt.v)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </Section>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={execute}
                disabled={!canExecute}
                className={`rounded-md border px-5 py-2 text-sm font-semibold transition ${
                  canExecute
                    ? 'border-emerald-600/60 bg-emerald-700/30 text-emerald-100 hover:bg-emerald-700/40'
                    : 'cursor-not-allowed border-border bg-panel text-zinc-600'
                }`}
              >
                {executing ? 'Bootstrappeando…' : '🚀 Bootstrap canal en disco'}
              </button>
              <button
                type="button"
                onClick={() => onBack()}
                className="rounded-md border border-border bg-panel px-3 py-1.5 text-xs text-zinc-400"
              >
                ← Volver
              </button>
            </div>

            {parsed.finalSummary && (
              <details className="rounded-md border border-border bg-bg/60">
                <summary className="cursor-pointer px-3 py-2 text-xs text-zinc-400">
                  Resumen del state-engine (B7)
                </summary>
                <pre className="whitespace-pre-wrap px-3 py-2 text-[11px] text-zinc-300">
                  {parsed.finalSummary}
                </pre>
              </details>
            )}
          </>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-panel/40 p-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-300">
        {title}
      </h4>
      {children}
    </div>
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
