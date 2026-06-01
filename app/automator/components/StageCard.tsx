"use client";

import { buildDownloadUrl } from "@/lib/automator/files";
import type { StageKind, StageState } from "@/lib/automator/types";

interface Props {
  kind: StageKind;
  stage: StageState;
}

const KIND_LABEL: Record<StageKind, string> = {
  first_frame: "First Frame",
  last_frame: "Last Frame",
  video: "Vídeo",
  drive_upload: "Drive Upload",
};

const STATUS_LABEL: Record<StageState["status"], string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  skipped: "Skipped",
  failed: "Failed",
};

function ClockIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M5 12l5 5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ForwardIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 5l8 7-8 7V5zm9 0l8 7-8 7V5z" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M12 3a9 9 0 019 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function StageCard({ kind, stage }: Props) {
  const variants: Record<
    StageState["status"],
    {
      bg: string;
      border: string;
      label: string;
      valueText: string;
      icon: React.ReactNode;
    }
  > = {
    pending: {
      bg: "bg-zinc-900/40",
      border: "border-zinc-800",
      label: "text-zinc-500",
      valueText: "text-zinc-300",
      icon: <ClockIcon className="w-4 h-4 text-zinc-500" />,
    },
    running: {
      bg: "bg-blue-950/30",
      border: "border-blue-500/30",
      label: "text-blue-300",
      valueText: "text-blue-100",
      icon: <SpinnerIcon className="w-4 h-4 text-blue-400" />,
    },
    completed: {
      bg: "bg-emerald-950/30",
      border: "border-emerald-500/30",
      label: "text-emerald-300",
      valueText: "text-emerald-100",
      icon: <CheckIcon className="w-4 h-4 text-emerald-400" />,
    },
    skipped: {
      bg: "bg-amber-950/20",
      border: "border-amber-500/25",
      label: "text-amber-300/80",
      valueText: "text-amber-100/80",
      icon: <ForwardIcon className="w-4 h-4 text-amber-400" />,
    },
    failed: {
      bg: "bg-red-950/30",
      border: "border-red-500/30",
      label: "text-red-300",
      valueText: "text-red-100",
      icon: <XIcon className="w-4 h-4 text-red-400" />,
    },
  };
  const v = variants[stage.status];
  const downloadUrl =
    stage.status === "completed" ? buildDownloadUrl(stage.output_path) : null;
  const isVisual = kind === "first_frame" || kind === "video" || kind === "last_frame";

  return (
    <div
      className={`group relative ${v.bg} border ${v.border} rounded-lg px-3 py-2.5 min-h-[78px] flex flex-col justify-between transition-colors`}
      title={stage.error || stage.output_path || ""}
    >
      <div className="flex items-start justify-between">
        <span className={`text-[10px] uppercase tracking-wider font-medium ${v.label}`}>
          {KIND_LABEL[kind]}
        </span>
        <span className="flex-shrink-0">{v.icon}</span>
      </div>
      <div className={`text-base font-medium ${v.valueText}`}>
        {STATUS_LABEL[stage.status]}
      </div>

      {/* Botón download cuando hay archivo disponible */}
      {downloadUrl && isVisual && (
        <a
          href={downloadUrl}
          download
          target="_blank"
          rel="noreferrer"
          className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-md bg-zinc-900/80 hover:bg-zinc-700 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
          title="Descargar"
          onClick={(e) => e.stopPropagation()}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      )}
    </div>
  );
}
