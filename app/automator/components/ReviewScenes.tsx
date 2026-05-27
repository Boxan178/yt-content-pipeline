"use client";

// Vista intermedia entre "Analizar y previsualizar escenas" y la Producción.
// Replica el panel "N escenas detectadas" de TubeNext con sub-cards por prompt.

import type { ParseResult, Scene } from "@/lib/automator/types";

interface Props {
  result: ParseResult;
  onEdit: () => void;
  onCreate: () => void;
}

function CheckBadge({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.15" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckMini({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M5 12l5 5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WarningMini({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M12 4l10 16H2L12 4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 10v5M12 17.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ArrowRight({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PromptCard({
  label,
  value,
  hasWarning,
}: {
  label: string;
  value?: string;
  hasWarning?: boolean;
}) {
  if (!value) {
    return (
      <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-3">
        <div className="flex items-center gap-1.5 mb-2 text-[11px] text-amber-400">
          <WarningMini className="w-3.5 h-3.5" />
          <span>{label}</span>
          <span className="text-zinc-500 normal-case ml-1">(vacío)</span>
        </div>
      </div>
    );
  }
  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-3">
      <div
        className={`flex items-center gap-1.5 mb-2 text-[11px] ${
          hasWarning ? "text-amber-400" : "text-emerald-300"
        }`}
      >
        {hasWarning ? (
          <WarningMini className="w-3.5 h-3.5" />
        ) : (
          <CheckMini className="w-3.5 h-3.5" />
        )}
        <span>{label}</span>
      </div>
      <p className="text-sm text-zinc-100 leading-relaxed whitespace-pre-line">{value}</p>
    </div>
  );
}

function SceneReviewCard({ scene }: { scene: Scene }) {
  const hasWarning = (scene.warnings?.length ?? 0) > 0;
  return (
    <div
      className={`card-panel p-4 ${
        hasWarning ? "border-amber-500/30" : "border-emerald-500/20"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-sm font-semibold text-emerald-300">
          {scene.scene_number}
        </div>
        <div>
          <div className="text-sm font-semibold text-zinc-100">
            {scene.scene_name || `Escena ${scene.scene_number}`}
          </div>
          {hasWarning && (
            <div className="text-[10px] text-amber-400 mt-0.5">
              {scene.warnings?.join(" · ")}
            </div>
          )}
        </div>
      </div>

      {/* Sub-cards de prompts */}
      <div className="space-y-2">
        <PromptCard label="Prompt de imagen" value={scene.image_prompt} />
        <PromptCard label="Prompt de animación" value={scene.video_prompt} />
        {scene.negative_prompt && (
          <PromptCard label="Negative prompt" value={scene.negative_prompt} />
        )}
      </div>
    </div>
  );
}

export function ReviewScenes({ result, onEdit, onCreate }: Props) {
  const total = result.scenes.length;
  const withWarnings = result.scenes.filter(
    (s) => (s.warnings?.length ?? 0) > 0 || !s.image_prompt,
  ).length;
  const ready = total - withWarnings;

  return (
    <div className="card-panel p-5 space-y-4">
      {/* Header del panel */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
          <CheckBadge className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-emerald-300">
            {total} escena{total === 1 ? "" : "s"} detectada{total === 1 ? "" : "s"}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {ready} {ready === 1 ? "lista" : "listas"} para generar
            <span className="text-zinc-600 mx-1.5">•</span>
            <span className={withWarnings > 0 ? "text-amber-400" : ""}>
              {withWarnings} {withWarnings === 1 ? "requiere" : "requieren"} revisión
            </span>
          </p>
        </div>
      </div>

      {/* Lista de escenas (scroll si hay muchas) */}
      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {result.scenes.map((s, i) => (
          <SceneReviewCard key={`${s.scene_number}-${i}`} scene={s} />
        ))}
      </div>

      {/* Footer con acciones */}
      <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
        <button type="button" onClick={onEdit} className="btn-secondary">
          Editar escenas
        </button>
        <button type="button" onClick={onCreate} className="btn-primary">
          <ArrowRight className="w-4 h-4" />
          Crear proyecto
        </button>
      </div>
    </div>
  );
}
