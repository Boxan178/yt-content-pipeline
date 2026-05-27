// Tipos compartidos del módulo Automator.
// Si fusionas con yt-content-pipeline, este fichero se queda como está.

export type AspectRatio = "16:9" | "9:16";

// Replica los 2 modos reales de TubeNext (no había video-only suelto en las capturas).
export type ProjectMode = "complete" | "image_only";

export interface Scene {
  scene_number: string;
  scene_name?: string;
  image_prompt?: string;
  video_prompt?: string;
  negative_prompt?: string;
  raw_block?: string;
  warnings?: string[];
}

export type ScriptFormat = "json" | "labeled" | "freeform" | "mixed" | "empty";

export interface ParseResult {
  scenes: Scene[];
  format: ScriptFormat;
  warnings: string[];
}

export interface ProviderConfig {
  provider: "kie";
  image_model: string;
  video_model: string;
  aspect_ratio: AspectRatio;
  resolution: "1K" | "2K" | "4K";
  mode: ProjectMode;
  duration_s: 4 | 8;
  audio_enabled: boolean;
  concurrency: number;
}

export interface ProjectConfig {
  name: string;
  reference_image_url?: string;
  config: ProviderConfig;
  scenes: Scene[];
}

// Stages que se muestran por escena en la vista de Producción.
// Mapeo con el motor Python:
//   first_frame  ← job_done kind=image
//   last_frame   ← no implementado (Seedance 2 lo soportará; hoy default skipped)
//   video        ← job_done kind=video
//   drive_upload ← virtual: se marca done justo después de video (cliente Drive sincroniza)
export type StageKind = "first_frame" | "last_frame" | "video" | "drive_upload";

export type StageStatus =
  | "pending"
  | "running"
  | "completed"
  | "skipped"
  | "failed";

export interface StageState {
  status: StageStatus;
  output_path?: string;
  output_url?: string;
  error?: string;
  started_at?: number;
  finished_at?: number;
}

export type SceneStatus = "pending" | "running" | "completed" | "failed";

export interface SceneState {
  scene_number: string;
  scene_id?: string; // hash corto para mostrar (ej: 852fd222...)
  status: SceneStatus;
  stages: Record<StageKind, StageState>;
  error?: string; // error global (ej: "All image providers failed...")
}

export function emptySceneState(
  scene_number: string,
  mode: ProjectMode,
): SceneState {
  // En image_only: video y drive_upload son skipped por diseño.
  // En complete: last_frame es skipped (hasta que activemos Seedance 2 + last_frame_url).
  const skipVideo = mode === "image_only";
  return {
    scene_number,
    status: "pending",
    stages: {
      first_frame: { status: "pending" },
      last_frame: { status: "skipped" },
      video: { status: skipVideo ? "skipped" : "pending" },
      drive_upload: { status: skipVideo ? "skipped" : "pending" },
    },
  };
}

// Legacy alias (lo usaba JobsPanel; lo mantenemos por compat mientras refactorizo).
export type JobStatus = "pending" | "running" | "done" | "failed";
export interface JobState {
  job_id: string;
  scene_number: string;
  kind: "image" | "video";
  status: JobStatus;
  output_path?: string;
  error?: string;
  started_at?: number;
  finished_at?: number;
}
