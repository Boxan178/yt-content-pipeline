"use client";

import type { SceneState } from "@/lib/automator/types";

interface Props {
  scenes: SceneState[];
  isRunning: boolean;
  onStop?: () => void;
}

function HeartIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 21s-7-4.35-7-10a4.5 4.5 0 018-2.8A4.5 4.5 0 0119 11c0 5.65-7 10-7 10z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SpinnerSmall({ className }: { className: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M12 3a9 9 0 019 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function StackIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3L3 8l9 5 9-5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5"
        stroke="currentColor"
        strokeWidth="1.5"
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

function CheckCircle({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertCircle({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 8v5M12 16.5v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function StatCard({
  label,
  value,
  iconBg,
  iconColor,
  valueColor,
  icon,
}: {
  label: string;
  value: number;
  iconBg: string;
  iconColor: string;
  valueColor: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-400 mb-1.5">
        <span className={`${iconBg} ${iconColor} w-4 h-4 rounded-full flex items-center justify-center`}>
          {icon}
        </span>
        {label}
      </div>
      <div className={`text-3xl font-semibold ${valueColor}`}>{value}</div>
    </div>
  );
}

export function JobsPanel({ scenes, isRunning, onStop }: Props) {
  const total = scenes.length;
  const completed = scenes.filter((s) => s.status === "completed").length;
  const running = scenes.filter((s) => s.status === "running").length;
  const failed = scenes.filter((s) => s.status === "failed").length;
  const progressPct = total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <div className="card-panel p-5 space-y-4 sticky top-20">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-md bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400">
          <HeartIcon className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold">Estado de producción</h3>
          <p className="text-xs text-zinc-500">
            {total === 0 ? "No hay trabajos activos" : `${completed}/${total} scenes`}
          </p>
        </div>
      </div>

      {isRunning ? (
        <>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border bg-blue-500/15 text-blue-300 border-blue-500/40">
            <SpinnerSmall className="w-3 h-3" />
            En ejecución
          </span>
          {onStop && (
            <button
              type="button"
              onClick={onStop}
              className="w-full px-3 py-2.5 rounded-md bg-red-950/40 hover:bg-red-900/40 border border-red-500/30 text-red-300 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <span className="w-2.5 h-2.5 bg-red-400 rounded-sm" />
              Detener producción
            </button>
          )}
        </>
      ) : (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border bg-zinc-800/60 text-zinc-400 border-zinc-700">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
          Inactivo
        </span>
      )}

      <div>
        <div className="flex items-baseline justify-between text-[11px] text-zinc-400 mb-1.5 uppercase tracking-wider">
          <span>Progreso</span>
          <span className="text-zinc-100 text-sm font-semibold normal-case tracking-normal">
            {progressPct}%
          </span>
        </div>
        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-red-500 to-red-400 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard
          label="Total"
          value={total}
          iconBg="bg-zinc-700/60"
          iconColor="text-zinc-300"
          valueColor="text-zinc-100"
          icon={<StackIcon className="w-2.5 h-2.5" />}
        />
        <StatCard
          label="Completado"
          value={completed}
          iconBg="bg-emerald-500/20"
          iconColor="text-emerald-400"
          valueColor="text-emerald-400"
          icon={<CheckCircle className="w-2.5 h-2.5" />}
        />
        <StatCard
          label="En ejecución"
          value={running}
          iconBg="bg-blue-500/20"
          iconColor="text-blue-400"
          valueColor="text-blue-400"
          icon={<PlayIcon className="w-2.5 h-2.5" />}
        />
        <StatCard
          label="Fallido"
          value={failed}
          iconBg="bg-red-500/20"
          iconColor="text-red-400"
          valueColor="text-red-400"
          icon={<AlertCircle className="w-2.5 h-2.5" />}
        />
      </div>

      <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
        <span className="w-3.5 h-3.5 rounded-full bg-zinc-700 text-zinc-400 flex items-center justify-center text-[10px]">
          i
        </span>
        Resultados guardados en Google Drive
      </p>
    </div>
  );
}
