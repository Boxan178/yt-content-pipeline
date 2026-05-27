"use client";

import type { SceneState, StageKind } from "@/lib/automator/types";
import { StageCard } from "./StageCard";

interface Props {
  scene: SceneState;
  onSkip?: (sceneNumber: string) => void;
  onRetry?: (sceneNumber: string) => void;
  onStop?: (sceneNumber: string) => void;
}

const STAGES: StageKind[] = ["first_frame", "last_frame", "video", "drive_upload"];

function StatusBadge({ status }: { status: SceneState["status"] }) {
  const map: Record<SceneState["status"], { label: string; cls: string }> = {
    pending: {
      label: "PENDING",
      cls: "bg-zinc-800/80 text-zinc-300 border-zinc-700",
    },
    running: {
      label: "RUNNING",
      cls: "bg-blue-500/20 text-blue-200 border-blue-500/50",
    },
    completed: {
      label: "COMPLETED",
      cls: "bg-emerald-500/20 text-emerald-200 border-emerald-500/50",
    },
    failed: {
      label: "FAILED",
      cls: "bg-red-500/25 text-red-200 border-red-500/60",
    },
  };
  const { label, cls } = map[status];
  return (
    <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

function IconButton({
  title,
  onClick,
  disabled,
  children,
  variant = "ghost",
}: {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: "ghost" | "danger";
}) {
  const base =
    "w-8 h-8 rounded-md flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const variants = {
    ghost: "bg-zinc-800/60 hover:bg-zinc-700 text-zinc-300",
    danger: "bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30",
  };
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

export function SceneCard({ scene, onSkip, onRetry, onStop }: Props) {
  const isRunning = scene.status === "running";
  const isFailed = scene.status === "failed";

  return (
    <div
      className={`card-panel p-4 ${
        isFailed ? "border-red-500/30 bg-red-950/10" : ""
      } ${isRunning ? "border-blue-500/30" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-md flex items-center justify-center text-sm font-semibold ${
              isFailed
                ? "bg-red-500/20 text-red-200"
                : isRunning
                  ? "bg-blue-500/20 text-blue-200"
                  : "bg-zinc-800 text-zinc-200"
            }`}
          >
            {scene.scene_number}
          </div>
          <div>
            <div
              className={`text-sm font-semibold ${
                isFailed ? "text-red-100" : "text-zinc-100"
              }`}
            >
              Scene {scene.scene_number}
            </div>
            {scene.scene_id && (
              <div className="text-[11px] text-zinc-500 font-mono">{scene.scene_id}</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(isRunning || isFailed) && onSkip && (
            <IconButton title="Saltar" onClick={() => onSkip(scene.scene_number)}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 5l8 7-8 7V5zm9 0l8 7-8 7V5z" />
              </svg>
            </IconButton>
          )}
          {(isFailed || scene.status === "completed") && onRetry && (
            <IconButton
              title={isFailed ? "Reintentar esta escena" : "Regenerar esta escena"}
              onClick={() => onRetry(scene.scene_number)}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                <path
                  d="M21 12a9 9 0 11-3.5-7.1L21 8M21 4v4h-4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </IconButton>
          )}
          {isRunning && onStop && (
            <IconButton
              title="Detener"
              variant="danger"
              onClick={() => onStop(scene.scene_number)}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            </IconButton>
          )}
          <StatusBadge status={scene.status} />
        </div>
      </div>

      {/* 4 stage cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {STAGES.map((kind) => (
          <StageCard key={kind} kind={kind} stage={scene.stages[kind]} />
        ))}
      </div>

      {/* Error global */}
      {scene.error && (
        <div className="mt-3 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-200 flex items-start gap-2">
          <span className="text-red-400 flex-shrink-0">⊘</span>
          <span>{scene.error}</span>
        </div>
      )}
    </div>
  );
}
