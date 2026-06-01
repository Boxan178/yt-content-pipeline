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

/**
 * Draft wizard (5-step) — Liquid Glass refresh 2026-05-27.
 *
 * Cliente: orquesta los pasos 2-5 del wizard de creación de canal. Cada paso
 * vive dentro de WizardStepLayout (header sticky + footer sticky). Surfaces
 * glass, CTAs magenta para acciones primarias dentro de Lab, .btn-glass para
 * secundarias.
 */
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
    return <Step5Bootstrap draft={draft} persist={persist} onBack={() => goto(4)} />;
  }
  // step === 1 (no debería llegar — el form vive en /lab/new-channel)
  return (
    <div className="p-8">
      <div className="glass mx-auto max-w-2xl rounded-[28px] p-6">
        <p className="text-sm text-zinc-400">
          Paso 1 ya completado. Salta al paso 2 para iniciar el análisis.
        </p>
        <button
          onClick={() => goto(2)}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/20 px-5 py-2 font-medium text-fuchsia-200 backdrop-blur-md transition hover:bg-fuchsia-500/30"
          style={{
            boxShadow:
              'inset 0 1px 0 0 rgba(255,255,255,0.18), 0 0 24px -6px rgba(217,70,239,0.45)',
          }}
        >
          Ir al paso 2
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
  const [jobId, setJobId] = useState<string | null>(null);
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
      const parsed = resp.parsed as
        | {
            channelAnalysis?: string;
            styleDna?: string;
            scriptSample?: string;
          }
        | undefined;
      if (!parsed) return;
      try {
        await persist({
          channelAnalysis: parsed.channelAnalysis,
          styleDna: parsed.styleDna,
          scriptSample: parsed.scriptSample,
          currentStep: 2,
        });
        setJobId(null); // volver a la vista de resultados (no quedarse en el JobView del re-lanzamiento)
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [persist],
  );

  return (
    <WizardStepLayout
      step={2}
      title="Análisis del canal y Style DNA"
      subtitle="Lanza style-engine sobre los transcripts. Pinta análisis, Style DNA y script style-locked."
      prevHref={null}
      nextHref={hasAnalysis ? '#' : null}
      nextDisabled={!hasAnalysis}
      nextLabel="Siguiente: visual"
      onNext={onNext}
    >
      <div className="mx-auto max-w-4xl space-y-5">
        {/* Resumen del draft */}
        <div className="glass rounded-2xl p-4">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-label text-zinc-500">
            Contexto del draft
          </p>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <SummaryRow label="Canal" value={draft.referenceChannelUrl} mono />
            <SummaryRow label="Idioma" value={draft.language} />
            <SummaryRow label="Tema" value={draft.initialTopic || '(ideas-please)'} />
            <SummaryRow
              label="Transcripts"
              value={`${draft.transcripts.length} cargados`}
            />
          </dl>
        </div>

        {hasAnalysis && !jobId ? (
          <div className="space-y-4">
            <ParsedBlock title="Análisis del canal" body={draft.channelAnalysis ?? ''} />
            <ParsedBlock title="Style DNA" body={draft.styleDna ?? ''} />
            {draft.scriptSample && (
              <ParsedBlock title="Script style-locked" body={draft.scriptSample} />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={launch}
                disabled={launching}
                className="btn-glass text-xs"
              >
                {launching ? 'Relanzando…' : 'Re-lanzar análisis'}
              </button>
              <button
                type="button"
                onClick={() => onBack()}
                className="btn-glass text-xs"
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
          <LaunchCard
            title="Listo para lanzar style-engine"
            description="Ejecutará STATES 1-6 en una sola sesión claude -p no interactiva (~5-15 min según longitud de los transcripts)."
            onClick={launch}
            disabled={launching}
            label={launching ? 'Lanzando…' : 'Lanzar análisis'}
          />
        )}

        {err && <ErrorBlock message={err} />}
      </div>
    </WizardStepLayout>
  );
}

// ── STEP 3 ────────────────────────────────────────────────────────────────

function Step3Visuals({ draft, persist, onNext, onBack: _onBack }: StepProps) {
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
      const parsed = resp.parsed as
        | {
            visualStyleProfile?: string;
            thumbnailStyleProfile?: string;
            thumbnailConcepts?: Array<{ header: string; body: string }>;
          }
        | undefined;
      if (!parsed) return;
      try {
        await persist({
          visualStyleProfile: parsed.visualStyleProfile,
          thumbnailStyleProfile: parsed.thumbnailStyleProfile,
        });
        setJobId(null); // volver a la vista de resultados (no quedarse en el JobView del re-lanzamiento)
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [persist],
  );

  return (
    <WizardStepLayout
      step={3}
      title="Visual y thumbnails"
      subtitle="Sube paths absolutos de 3-5 frames del vídeo y 2-3 thumbnails de referencia. Style-engine genera Visual Style Profile + Thumbnail Style Profile + 5 conceptos."
      prevHref={`/lab/drafts/${draft.id}?step=2`}
      nextHref={hasVisuals ? '#' : null}
      nextDisabled={!hasVisuals}
      nextLabel="Siguiente: validación"
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

        {hasVisuals && !jobId ? (
          <div className="space-y-4">
            <ParsedBlock title="Visual style profile" body={draft.visualStyleProfile ?? ''} />
            <ParsedBlock title="Thumbnail style profile" body={draft.thumbnailStyleProfile ?? ''} />
            <button
              type="button"
              onClick={saveAndLaunch}
              disabled={launching}
              className="btn-glass text-xs"
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
          <LaunchCard
            title="Listo para lanzar style-engine (visual)"
            description="Ejecuta STATES 7-9 + 11-13. Genera prompts de imagen por beat del script previo + 5 conceptos de thumbnail."
            onClick={saveAndLaunch}
            disabled={launching}
            label={launching ? 'Lanzando…' : 'Lanzar análisis visual'}
          />
        )}

        {err && <ErrorBlock message={err} />}
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
        setJobId(null); // volver a la vista del informe (no quedarse en el JobView del re-lanzamiento)
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [persist],
  );

  return (
    <WizardStepLayout
      step={4}
      title="Validación de nicho"
      subtitle="MARIO + Algrow MCP. Veredicto + scores demand/saturation + wedges + risks."
      prevHref={`/lab/drafts/${draft.id}?step=3`}
      nextHref={report ? '#' : null}
      nextDisabled={!report || report.verdict === 'red'}
      nextLabel="Siguiente: bootstrap"
      onNext={() => onNext()}
    >
      <div className="mx-auto max-w-4xl space-y-5">
        {report && !jobId ? (
          <>
            <ValidationReportView report={report} />

            {/* Doble salida si veredicto rojo */}
            {report.verdict === 'red' && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <DecisionCard
                  title="Persistir con ajustes"
                  description="Vuelve al paso 2 para re-investigar el nicho con un ángulo diferente, transcripts más afilados o un sub-nicho. MARIO marcó rojo, pero tienes margen para iterar."
                  cta="Re-investigar"
                  onClick={onBack}
                  variant="caution"
                />
                <DecisionCard
                  title="Crear pese al rojo"
                  description="Vas a la fase de bootstrap aceptando el riesgo. Útil si el wedge te convence o si quieres testear un nicho saturado con un ángulo lateral."
                  cta="Continuar a bootstrap"
                  onClick={onNext}
                  variant="danger"
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={launch}
                disabled={launching}
                className="btn-glass text-xs"
              >
                {launching ? 'Re-lanzando…' : 'Re-validar'}
              </button>
              <button
                type="button"
                onClick={() => onBack()}
                className="btn-glass text-xs"
              >
                Volver al paso 2
              </button>
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
          <LaunchCard
            title="Lanzar MARIO + Algrow"
            description="MARIO usará las herramientas Algrow (resolve_url, channel_trends, search_viral_videos, search_longform_channels) y devolverá un veredicto JSON con scores y wedges defendibles. ~5-15 min."
            onClick={launch}
            disabled={launching}
            label={launching ? 'Lanzando…' : 'Lanzar validación'}
          />
        )}

        {err && <ErrorBlock message={err} />}
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
  persist: _persist,
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

  const [chosenName, setChosenName] = useState(draft.bootstrap?.chosenName ?? '');
  const [chosenHandle, setChosenHandle] = useState(draft.bootstrap?.chosenHandle ?? '');
  const [chosenDescription, setChosenDescription] = useState(
    draft.bootstrap?.chosenDescription ?? '',
  );
  const [descVersion, setDescVersion] = useState<'A' | 'B' | 'C'>(
    draft.bootstrap?.descriptionVersion ?? 'B',
  );
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

  const handleDone = useCallback(
    (resp: { parsed?: unknown }) => {
      const p = resp.parsed as ParsedBootstrap | null;
      if (!p) {
        setErr(
          'No pude parsear los bloques del bootstrap. Revisa el log y rellena el formulario manualmente.',
        );
        return;
      }
      setParsed(p);
      if (p.nameProposals && p.nameProposals.length > 0 && !chosenName) {
        const first = p.nameProposals[0];
        setChosenName(first.name);
        setChosenHandle(first.handle);
      }
      if (p.descriptions) {
        const preferred =
          p.descriptions.find((d) => d.version === descVersion) ?? p.descriptions[0];
        if (preferred && !chosenDescription) {
          setChosenDescription(preferred.body);
          setDescVersion(preferred.version);
        }
      }
      if (p.logoPrompt && !logoPrompt) setLogoPrompt(p.logoPrompt);
      if (p.bannerPrompt && !bannerPrompt) setBannerPrompt(p.bannerPrompt);
    },
    [chosenName, chosenDescription, descVersion, logoPrompt, bannerPrompt],
  );

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
        title="Bootstrap completado"
        subtitle="Canal materializado en disco. Próximo paso opcional: crear el primer vídeo."
        prevHref={`/lab/drafts/${draft.id}?step=4`}
        nextHref={null}
      >
        <div className="mx-auto max-w-3xl space-y-5">
          <div
            className="glass rounded-[28px] border border-green-500/40 bg-green-500/10 p-6"
            style={{ boxShadow: '0 0 32px -8px rgba(34,197,94,0.4)' }}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-green-500/40 bg-green-500/15 text-green-300">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12l5 5L20 7" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[11px] font-medium uppercase tracking-label text-green-300/80">
                  Canal en disco
                </p>
                <h3 className="font-display text-xl font-semibold tracking-display text-white">
                  {chosenName}
                </h3>
                <p className="mt-2 break-all font-mono text-[11px] text-zinc-400">
                  {executeResult.diskPath}/branding/
                </p>
              </div>
            </div>
            {executeResult.stdout && (
              <details className="mt-4 rounded-2xl border border-white/10 bg-black/30">
                <summary className="cursor-pointer px-3 py-2 text-[11px] font-medium uppercase tracking-label text-zinc-500 hover:text-zinc-300">
                  Output del script
                </summary>
                <pre className="whitespace-pre-wrap break-words px-3 pb-3 font-mono text-[11px] leading-relaxed text-zinc-300">
                  {executeResult.stdout}
                </pre>
              </details>
            )}
          </div>
          <a
            href={`/lab/first-video/${draft.id}`}
            className="inline-flex items-center gap-2 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/20 px-5 py-2 font-medium text-fuchsia-200 backdrop-blur-md transition hover:bg-fuchsia-500/30"
            style={{
              boxShadow:
                'inset 0 1px 0 0 rgba(255,255,255,0.18), 0 0 24px -6px rgba(217,70,239,0.45)',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="6 4 20 12 6 20 6 4" />
            </svg>
            Crear el primer vídeo
          </a>
        </div>
      </WizardStepLayout>
    );
  }

  return (
    <WizardStepLayout
      step={5}
      title="Bootstrap"
      subtitle="STATE 16 completo: nombre, descripción, logo + banner prompts, estructura en disco."
      prevHref={`/lab/drafts/${draft.id}?step=4`}
      nextHref={null}
    >
      <div className="mx-auto max-w-4xl space-y-5">
        {!parsed && !jobId && (
          <LaunchCard
            title="Lanzar state-engine bootstrap"
            description="Ejecuta B1-B7: propuestas de nombre + descripciones + prompts de logo/banner. NO toca disco — eso es el siguiente paso."
            onClick={launch}
            disabled={launching}
            label={launching ? 'Lanzando…' : 'Lanzar state-engine'}
          />
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
              <BootstrapSection title="1. Elige el nombre del canal">
                <div className="space-y-2">
                  {parsed.nameProposals.map((p) => {
                    const checked = chosenName === p.name;
                    return (
                      <label
                        key={p.index}
                        className={`block cursor-pointer rounded-2xl border p-4 transition ${
                          checked
                            ? 'border-fuchsia-500/40 bg-fuchsia-500/10'
                            : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="name-proposal"
                            checked={checked}
                            onChange={() => {
                              setChosenName(p.name);
                              setChosenHandle(p.handle);
                            }}
                            className="mt-1 accent-fuchsia-500"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="font-display text-sm font-medium text-white">
                                {p.name}
                              </span>
                              <span className="font-mono text-[11px] text-zinc-500">
                                @{p.handle}
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                              {p.rationale}
                            </p>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <FormInput
                    type="text"
                    value={chosenName}
                    onChange={(v) => setChosenName(v)}
                    placeholder="Nombre del canal"
                  />
                  <FormInput
                    type="text"
                    value={chosenHandle}
                    onChange={(v) => setChosenHandle(v)}
                    placeholder="@handle"
                  />
                </div>
              </BootstrapSection>
            )}

            {parsed.descriptions && (
              <BootstrapSection title="2. Elige la descripción">
                <div className="space-y-2">
                  {parsed.descriptions.map((d) => {
                    const checked = descVersion === d.version;
                    return (
                      <label
                        key={d.version}
                        className={`block cursor-pointer rounded-2xl border p-4 transition ${
                          checked
                            ? 'border-fuchsia-500/40 bg-fuchsia-500/10'
                            : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="desc-version"
                            checked={checked}
                            onChange={() => {
                              setDescVersion(d.version);
                              setChosenDescription(d.body);
                            }}
                            className="mt-1 accent-fuchsia-500"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium uppercase tracking-label text-fuchsia-300/80">
                              Versión {d.version}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">
                              {d.body}
                            </p>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <FormTextarea
                  value={chosenDescription}
                  onChange={setChosenDescription}
                  rows={5}
                  placeholder="Descripción final (editable)"
                />
              </BootstrapSection>
            )}

            <BootstrapSection title="3. Logo prompt (Nano Banana Pro, EN)">
              <FormTextarea
                value={logoPrompt}
                onChange={setLogoPrompt}
                rows={5}
                mono
              />
            </BootstrapSection>

            <BootstrapSection title="4. Banner prompt (2560×1440, safe area central 1546×423)">
              <FormTextarea
                value={bannerPrompt}
                onChange={setBannerPrompt}
                rows={5}
                mono
              />
            </BootstrapSection>

            <BootstrapSection title="5. Vía de generación de assets">
              <div className="space-y-2">
                {(
                  [
                    { v: 'canva-mcp', label: 'Canva MCP (engine llama generate-design)' },
                    {
                      v: 'nano-banana-manual',
                      label: 'Nano Banana Pro manual (pegar prompts en Flow)',
                    },
                    { v: 'both', label: 'Ambos: Canva primero, Nano si no convence' },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.v}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition ${
                      assetMethod === opt.v
                        ? 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-100'
                        : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:bg-white/[0.05]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="asset-method"
                      checked={assetMethod === opt.v}
                      onChange={() => setAssetMethod(opt.v)}
                      className="accent-fuchsia-500"
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </BootstrapSection>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={execute}
                disabled={!canExecute}
                className={
                  canExecute
                    ? 'inline-flex items-center gap-2 rounded-full border border-green-500/40 bg-green-500/20 px-5 py-2 font-medium text-green-200 backdrop-blur-md transition hover:bg-green-500/30'
                    : 'inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 font-medium text-zinc-600'
                }
                style={
                  canExecute
                    ? {
                        boxShadow:
                          'inset 0 1px 0 0 rgba(255,255,255,0.18), 0 0 24px -6px rgba(34,197,94,0.45)',
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
                  <path d="M5 12l5 5L20 7" />
                </svg>
                {executing ? 'Bootstrappeando…' : 'Bootstrap canal en disco'}
              </button>
              <button
                type="button"
                onClick={() => onBack()}
                className="btn-glass text-xs"
              >
                Volver
              </button>
            </div>

            {parsed.finalSummary && (
              <details className="glass rounded-2xl">
                <summary className="cursor-pointer px-4 py-2.5 text-[11px] font-medium uppercase tracking-label text-zinc-500 hover:text-zinc-300">
                  Resumen del state-engine (B7)
                </summary>
                <pre className="whitespace-pre-wrap break-words px-4 pb-4 text-[11px] leading-relaxed text-zinc-300">
                  {parsed.finalSummary}
                </pre>
              </details>
            )}
          </>
        )}

        {err && <ErrorBlock message={err} />}
      </div>
    </WizardStepLayout>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────

function SummaryRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0 text-[10px] font-medium uppercase tracking-label text-zinc-500">
        {label}
      </dt>
      <dd
        className={`min-w-0 truncate text-zinc-200 ${
          mono ? 'font-mono text-[12px]' : 'text-sm'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function ParsedBlock({ title, body }: { title: string; body: string }) {
  return (
    <details
      className="glass rounded-2xl border border-fuchsia-500/25"
      open
    >
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-[11px] font-medium uppercase tracking-label text-fuchsia-300/80 hover:text-fuchsia-200">
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
        {title}
      </summary>
      <pre className="whitespace-pre-wrap px-4 pb-4 text-[12px] leading-relaxed text-zinc-200">
        {body}
      </pre>
    </details>
  );
}

function BootstrapSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-[24px] p-5">
      <h4 className="mb-3 text-[11px] font-medium uppercase tracking-label text-fuchsia-300/80">
        {title}
      </h4>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function LaunchCard({
  title,
  description,
  onClick,
  disabled,
  label,
}: {
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="glass rounded-[24px] border border-fuchsia-500/25 p-5">
      <h3 className="font-display text-base font-medium tracking-display text-white">
        {title}
      </h3>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{description}</p>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/20 px-5 py-2 font-medium text-fuchsia-200 backdrop-blur-md transition hover:bg-fuchsia-500/30 disabled:opacity-50"
        style={{
          boxShadow:
            'inset 0 1px 0 0 rgba(255,255,255,0.18), 0 0 24px -6px rgba(217,70,239,0.45)',
        }}
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
        {label}
      </button>
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="glass rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-300">
      <span className="font-medium">Error:</span> {message}
    </div>
  );
}

function DecisionCard({
  title,
  description,
  cta,
  onClick,
  variant,
}: {
  title: string;
  description: string;
  cta: string;
  onClick: () => void;
  variant: 'caution' | 'danger';
}) {
  const isDanger = variant === 'danger';
  return (
    <div
      className={`glass glass-premium rounded-[24px] border p-5 ${
        isDanger ? 'border-red-500/30' : 'border-amber-500/30'
      }`}
    >
      <h4
        className={`font-display text-base font-medium tracking-display ${
          isDanger ? 'text-red-200' : 'text-amber-200'
        }`}
      >
        {title}
      </h4>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{description}</p>
      <button
        type="button"
        onClick={onClick}
        className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-medium ${
          isDanger
            ? 'border-red-500/40 bg-red-500/15 text-red-200 hover:bg-red-500/25'
            : 'border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
        }`}
      >
        {cta}
      </button>
    </div>
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

function PathArrayField({
  label,
  values,
  onChange,
  placeholder,
  min,
  max,
}: PathArrayFieldProps) {
  const padded =
    values.length < min ? [...values, ...Array(min - values.length).fill('')] : values;
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-label text-zinc-500">
        {label}
      </label>
      <div className="space-y-1.5">
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
              className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 font-mono text-[12px] text-white placeholder:text-zinc-600 focus:border-fuchsia-500/40 focus:bg-white/[0.06] focus:outline-none"
            />
            {padded.length > min && (
              <button
                type="button"
                onClick={() => onChange(padded.filter((_, j) => j !== i))}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-500 hover:border-red-500/30 hover:text-red-400"
                title="Eliminar"
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
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
      {padded.length < max && (
        <button
          type="button"
          onClick={() => onChange([...padded, ''])}
          className="mt-2 text-xs font-medium text-fuchsia-300 hover:text-fuchsia-200"
        >
          + Añadir otro
        </button>
      )}
    </div>
  );
}

function FormInput({
  type,
  value,
  onChange,
  placeholder,
}: {
  type: 'text';
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-fuchsia-500/40 focus:bg-white/[0.06] focus:outline-none"
    />
  );
}

function FormTextarea({
  value,
  onChange,
  rows,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  rows: number;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className={`w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-white placeholder:text-zinc-500 focus:border-fuchsia-500/40 focus:bg-white/[0.06] focus:outline-none ${
        mono ? 'font-mono text-[11px] leading-relaxed' : 'text-sm leading-relaxed'
      }`}
    />
  );
}
