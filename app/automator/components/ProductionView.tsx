"use client";

import type {
  AspectRatio,
  ProjectMode,
  ProviderConfig,
  SceneState,
} from "@/lib/automator/types";
import { SceneCard } from "./SceneCard";

interface Props {
  scenes: SceneState[];
  config: ProviderConfig;
  setConfig: (patch: Partial<ProviderConfig>) => void;
  isRunning: boolean;
  estimatedCredits: number | null;
  estimatedEur: string | null;
  onStart: () => void;
  onStop: () => void;
  onRetry?: (sceneNumber: string) => void;
  providersOpen: boolean;
  setProvidersOpen: (v: boolean) => void;
  imageModels: { slug: string; label: string }[];
  videoModels: { slug: string; label: string }[];
}

function ClapperIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M3 9h18v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9zm0 0L5 4l5 1-2 4H3zm6 0l2-5 5 1-2 4H9zm6 0l2-5 5 1-2 4h-5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4l14 8-14 8V4z" />
    </svg>
  );
}

function StopIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  );
}

function Chevron({ open, className }: { open: boolean; className: string }) {
  return (
    <svg
      className={`${className} transition-transform ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`segmented-item ${value === o.value ? "segmented-item-active" : ""}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ProductionView({
  scenes,
  config,
  setConfig,
  isRunning,
  estimatedCredits,
  estimatedEur,
  onStart,
  onStop,
  onRetry,
  providersOpen,
  setProvidersOpen,
  imageModels,
  videoModels,
}: Props) {
  const completed = scenes.filter((s) => s.status === "completed").length;
  const sceneCount = scenes.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400">
            <ClapperIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Producción de escenas</h2>
            <p className="text-xs text-zinc-500">
              {isRunning
                ? `${completed}/${sceneCount} escenas completadas...`
                : `${sceneCount} escena${sceneCount === 1 ? "" : "s"} listas para generar`}
            </p>
          </div>
        </div>
        {isRunning ? (
          <button type="button" onClick={onStop} className="btn-primary !bg-red-700 !shadow-red-900/50">
            <StopIcon className="w-3.5 h-3.5" />
            Detener producción
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={sceneCount === 0}
            className="btn-primary"
          >
            <PlayIcon className="w-3.5 h-3.5" />
            Iniciar producción
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="card-panel p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-xs text-zinc-400">Formato</span>
          <Segmented<AspectRatio>
            value={config.aspect_ratio}
            options={[
              { value: "9:16", label: "9:16" },
              { value: "16:9", label: "16:9" },
            ]}
            onChange={(v) => setConfig({ aspect_ratio: v })}
          />

          <span className="text-xs text-zinc-400 ml-3">Modo de producción</span>
          <Segmented<ProjectMode>
            value={config.mode}
            options={[
              { value: "complete", label: "✎ Completo" },
              { value: "image_only", label: "🖼 Solo Imágenes" },
            ]}
            onChange={(v) => setConfig({ mode: v })}
          />

          <span className="text-xs text-zinc-400 ml-3">Resolución de imagen</span>
          <Segmented
            value={config.resolution}
            options={[
              { value: "1K", label: "1K" },
              { value: "2K", label: "2K" },
              { value: "4K", label: "4K" },
            ]}
            onChange={(v) => setConfig({ resolution: v })}
          />
        </div>

        {/* Cambiar proveedores (plegable) */}
        <button
          type="button"
          onClick={() => setProvidersOpen(!providersOpen)}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-300 hover:text-zinc-100 transition-colors"
        >
          <Chevron open={providersOpen} className="w-3.5 h-3.5" />
          Cambiar proveedores
        </button>

        {providersOpen && (
          <div className="space-y-2.5 pt-2 border-t border-zinc-800">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-xs text-zinc-400 min-w-[120px]">Proveedor de imagen</span>
              <Segmented
                value="kie"
                options={[
                  { value: "gemini", label: "Gemini" },
                  { value: "kie", label: "Kie" },
                  { value: "genaipro", label: "GenAIPro" },
                ]}
                onChange={() => {}}
              />
              <span className="text-xs text-zinc-400 ml-2">Modelo de imagen</span>
              <Segmented
                value={config.image_model}
                options={imageModels.map((m) => ({ value: m.slug, label: m.label }))}
                onChange={(v) => setConfig({ image_model: v })}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-xs text-zinc-400 min-w-[120px]">Proveedor de vídeo</span>
              <Segmented
                value="kie"
                options={[
                  { value: "kie", label: "Kie" },
                  { value: "genaipro", label: "GenAIPro" },
                  { value: "replicate", label: "Replicate" },
                ]}
                onChange={() => {}}
              />
              <span className="text-xs text-zinc-400 ml-2">Modelo de vídeo</span>
              <Segmented
                value={config.video_model}
                options={videoModels.map((m) => ({ value: m.slug, label: m.label }))}
                onChange={(v) => setConfig({ video_model: v })}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="px-2 py-1 rounded bg-zinc-800/70 text-xs text-zinc-300 border border-zinc-700">
                {config.video_model.split("/").pop()} on Kie
              </span>
              <span className="text-xs text-zinc-400">Duración</span>
              <Segmented
                value={config.duration_s}
                options={[
                  { value: 4, label: "4s" },
                  { value: 8, label: "8s" },
                ]}
                onChange={(v) => setConfig({ duration_s: v })}
              />
              <button
                type="button"
                onClick={() => setConfig({ audio_enabled: !config.audio_enabled })}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded border text-xs transition-colors ${
                  config.audio_enabled
                    ? "border-emerald-500/30 text-emerald-300 bg-emerald-500/10"
                    : "border-zinc-700 text-zinc-300 bg-zinc-800/40 hover:bg-zinc-800"
                }`}
              >
                <span>{config.audio_enabled ? "🔊" : "🔇"}</span>
                {config.audio_enabled ? "Audio activado" : "Audio desactivado"}
              </button>
            </div>
          </div>
        )}

        {/* Coste estimado */}
        <div className="pt-3 border-t border-zinc-800 flex items-baseline justify-between">
          <span className="text-xs text-zinc-400">Coste estimado</span>
          <span className="text-sm">
            {estimatedCredits !== null ? (
              <>
                <span className="font-semibold text-zinc-100">
                  {estimatedCredits.toLocaleString("es-ES")} credits para {sceneCount} escena{sceneCount === 1 ? "" : "s"}
                </span>{" "}
                {estimatedEur != null && (
                  <span className="text-zinc-500">(€{estimatedEur})</span>
                )}
              </>
            ) : (
              <span className="text-zinc-500">—</span>
            )}
          </span>
        </div>
      </div>

      {/* Lista de escenas */}
      <div className="space-y-3">
        {scenes.map((s, i) => (
          // key compuesta con el índice: dos escenas pueden compartir scene_number
          // (texto/JSON con números repetidos) → keys duplicadas y reconciliación rota.
          <SceneCard key={`${s.scene_number}-${i}`} scene={s} onRetry={onRetry} runActive={isRunning} />
        ))}
      </div>
    </div>
  );
}
