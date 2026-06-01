"use client";

// Esta vista vive bajo /automator dentro de yt-content-pipeline. El header,
// sidebar y nav los pone el layout root — aquí solo metemos el contenido.

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FormatsHelper } from "./components/FormatsHelper";
import { JobsPanel } from "./components/JobsPanel";
import { ProductionView } from "./components/ProductionView";
import { ProviderModal } from "./components/ProviderModal";
import { ReviewScenes } from "./components/ReviewScenes";
import { parseScript } from "@/lib/automator/parser";
import {
  computeProjectCost,
  imageCostRange,
  videoCostRange,
} from "@/lib/automator/pricing";
import { runProjectSse, type SseEvent } from "@/lib/automator/sse-client";
import {
  emptySceneState,
  type ParseResult,
  type ProjectMode,
  type ProviderConfig,
  type SceneState,
} from "@/lib/automator/types";

// Catálogo de modelos disponibles vía kie-bridge.
const IMAGE_MODELS = [
  { slug: "nano-banana-2", label: "Nano Banana 2" },
  { slug: "nano-banana-pro", label: "Nano Banana Pro" },
];
const VIDEO_MODELS = [
  { slug: "bytedance/seedance-1.5-pro", label: "Seedance 1.5 Pro" },
  { slug: "bytedance/seedance-2", label: "Seedance 2" },
  { slug: "veo3_fast", label: "Veo 3 Fast" },
  { slug: "veo3", label: "Veo 3" },
];

// Catálogo de proveedores para los modales (replica TubeNext). Solo Kie está
// activo de momento; el resto se muestran disabled. Cuando integremos otros,
// se activan aquí.
const IMAGE_PROVIDERS = [
  {
    id: "gemini",
    name: "Gemini Nano Banana",
    description: "Google's Gemini image generation",
    billing_label: "Billed via your Gemini account",
    billing_color: "emerald" as const,
    enabled: false,
    models: [],
  },
  {
    id: "kie",
    name: "Kie AI",
    description: "Kie image generation with multiple Nano Banana models",
    billing_label: "Billed via your Kie account",
    billing_color: "emerald" as const,
    enabled: true,
    models: [
      {
        slug: "nano-banana-2",
        label: "Nano Banana 2",
        description: "Latest Kie image pipeline. Hasta 14 reference images.",
        capabilities: ["prompt", "reference image", "1K-4K", "aspect ratio"],
        cost_label: imageCostRange("nano-banana-2"),
      },
      {
        slug: "nano-banana-pro",
        label: "Nano Banana Pro",
        description: "Gemini 3 Pro de máxima calidad. Hasta 8 reference images.",
        capabilities: ["prompt", "reference image", "1K-4K", "negative prompt"],
        cost_label: imageCostRange("nano-banana-pro"),
      },
    ],
  },
  {
    id: "genaipro",
    name: "GenAIPro",
    description: "Image generation on GenAIPro infrastructure",
    billing_label: "1 credit per image",
    billing_color: "amber" as const,
    enabled: false,
    models: [],
  },
];

const VIDEO_PROVIDERS = [
  {
    id: "kie",
    name: "Kie AI",
    description: "Kie video generation con Seedance y Veo",
    billing_label: "Billed via your Kie account",
    billing_color: "emerald" as const,
    enabled: true,
    models: [
      {
        slug: "bytedance/seedance-1.5-pro",
        label: "Seedance 1.5 Pro",
        description: "5-12s, 1080p, soporta first_frame_url.",
        capabilities: ["prompt", "first frame", "1080p", "9:16 aspect ratio"],
        cost_label: videoCostRange("bytedance/seedance-1.5-pro"),
      },
      {
        slug: "bytedance/seedance-2",
        label: "Seedance 2",
        description: "4-15s, 2K, ref images + first/last frame + audio nativo opcional.",
        capabilities: ["prompt", "ref images", "first/last frame", "2K", "audio"],
        cost_label: videoCostRange("bytedance/seedance-2"),
      },
      {
        slug: "veo3_fast",
        label: "Veo 3 Fast",
        description: "Veo 3 modo rápido con audio nativo.",
        capabilities: ["prompt", "first frame", "audio", "16:9 / 9:16"],
        cost_label: videoCostRange("veo3_fast"),
      },
      {
        slug: "veo3",
        label: "Veo 3",
        description: "Veo 3 calidad máxima con audio nativo.",
        capabilities: ["prompt", "first frame", "audio", "alta calidad"],
        cost_label: videoCostRange("veo3"),
      },
    ],
  },
  {
    id: "genaipro",
    name: "GenAIPro",
    description: "Video generation on GenAIPro infrastructure",
    billing_label: "Coming soon",
    billing_color: "zinc" as const,
    enabled: false,
    models: [],
  },
  {
    id: "replicate",
    name: "Replicate",
    description: "Replicate API (Seedance, Kling, etc.)",
    billing_label: "Coming soon",
    billing_color: "zinc" as const,
    enabled: false,
    models: [],
  },
];

function PenIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M14 4l6 6-10 10H4v-6L14 4z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayCircle({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 4l8 5 3 1.8L21 5v15a1 1 0 01-1 1H4a1 1 0 01-1-1V4z" opacity="0" />
      <rect x="2" y="3" width="20" height="18" rx="4" />
      <path d="M10 8l6 4-6 4V8z" fill="#0a0a0b" />
    </svg>
  );
}

// Reconstruye SceneState[] desde scenes + results persistidos en project.json.
// Usado al hidratar un proyecto via ?project=<name>.
function hydrateScenesFromState(
  scenes: Array<{ scene_number: string; scene_name?: string }>,
  results: Record<
    string,
    {
      image_path?: string | null;
      image_url?: string | null;
      video_path?: string | null;
      video_url?: string | null;
      error?: string | null;
    }
  >,
  mode: ProjectMode,
): SceneState[] {
  const skipVideo = mode === "image_only";
  return scenes.map((s) => {
    const r = results[s.scene_number] || {};
    const hasImage = !!r.image_path;
    const hasVideo = !!r.video_path;
    const hasError = !!r.error;

    const firstFrameStatus: SceneState["stages"]["first_frame"]["status"] = hasImage
      ? "completed"
      : hasError && !hasImage
        ? "failed"
        : "pending";
    let videoStatus: SceneState["stages"]["video"]["status"];
    let driveStatus: SceneState["stages"]["drive_upload"]["status"];
    if (skipVideo) {
      videoStatus = "skipped";
      driveStatus = "skipped";
    } else if (hasVideo) {
      videoStatus = "completed";
      driveStatus = "completed";
    } else if (hasError && hasImage) {
      videoStatus = "failed";
      driveStatus = "skipped";
    } else if (hasError && !hasImage) {
      videoStatus = "skipped";
      driveStatus = "skipped";
    } else {
      videoStatus = "pending";
      driveStatus = "pending";
    }

    const sceneStatus: SceneState["status"] = hasError
      ? "failed"
      : skipVideo && hasImage
        ? "completed"
        : hasVideo
          ? "completed"
          : hasImage
            ? "running"
            : "pending";

    const st: SceneState = {
      scene_number: s.scene_number,
      status: sceneStatus,
      error: r.error || undefined,
      stages: {
        first_frame: {
          status: firstFrameStatus,
          output_path: r.image_path || undefined,
          output_url: r.image_url || undefined,
          error: !hasImage && hasError ? r.error || undefined : undefined,
        },
        last_frame: { status: "skipped" },
        video: {
          status: videoStatus,
          output_path: r.video_path || undefined,
          output_url: r.video_url || undefined,
          error: hasError && hasImage ? r.error || undefined : undefined,
        },
        drive_upload: { status: driveStatus },
      },
    };
    st.scene_id = `${s.scene_number.padStart(3, "0")}-${s.scene_name?.slice(0, 8).toLowerCase().replace(/\s+/g, "_") || "scene"}`;
    return st;
  });
}

export default function AutomatorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectQuery = searchParams.get("project");

  const [projectName, setProjectName] = useState("");
  const [refUrl, setRefUrl] = useState("");
  const [refFile, setRefFile] = useState<File | null>(null);
  const [scriptText, setScriptText] = useState("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [showFormats, setShowFormats] = useState(false);

  // Provider config (un solo objeto, set parcial cómodo)
  const [config, setConfigState] = useState<ProviderConfig>({
    provider: "kie",
    image_model: IMAGE_MODELS[0].slug,
    video_model: VIDEO_MODELS[0].slug,
    aspect_ratio: "9:16",
    resolution: "1K",
    mode: "complete",
    duration_s: 8,
    audio_enabled: false,
    concurrency: 5,
  });
  const setConfig = useCallback(
    (patch: Partial<ProviderConfig>) =>
      setConfigState((c) => ({ ...c, ...patch })),
    [],
  );

  const [providersOpen, setProvidersOpen] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  // Flow: detectar escenas → revisar (ReviewScenes) → crear proyecto (ProductionView).
  const [projectCreated, setProjectCreated] = useState(false);
  const [productionScenes, setProductionScenes] = useState<SceneState[] | null>(null);

  // Hidratación desde URL ?project=<name>: si existe, cargamos el project.json
  // del backend y restauramos form + escenas + producción.
  useEffect(() => {
    if (!projectQuery) return;
    fetch(`/api/projects/${encodeURIComponent(projectQuery)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((state) => {
        if (!state || state.error) return;
        // Restaurar form
        setProjectName(state.name ?? "");
        setRefUrl(state.reference_image && /^https?:\/\//.test(state.reference_image) ? state.reference_image : "");
        setScriptText(state.script_text ?? "");
        // Restaurar config (preservando defaults si no vienen)
        const cfg = state.config ?? {};
        setConfigState((prev) => ({
          ...prev,
          ...(cfg.mode ? { mode: cfg.mode } : {}),
          ...(cfg.aspect_ratio ? { aspect_ratio: cfg.aspect_ratio } : {}),
          ...(cfg.resolution ? { resolution: cfg.resolution } : {}),
          ...(cfg.image_model ? { image_model: cfg.image_model } : {}),
          ...(cfg.video_model ? { video_model: cfg.video_model } : {}),
          ...(cfg.duration ? { duration_s: cfg.duration } : {}),
          ...(typeof cfg.audio_enabled === "boolean" ? { audio_enabled: cfg.audio_enabled } : {}),
          ...(cfg.concurrency ? { concurrency: cfg.concurrency } : {}),
        }));
        // Restaurar parseResult (para que ReviewScenes pueda mostrarse si vuelve atrás)
        setParseResult({
          scenes: state.scenes ?? [],
          format: "json",
          warnings: [],
        });
        // Restaurar production scenes (hidratadas desde results)
        const hydrated = hydrateScenesFromState(
          state.scenes ?? [],
          state.results ?? {},
          (cfg.mode as ProjectMode) ?? "complete",
        );
        setProductionScenes(hydrated);
        setProjectCreated(true);
        if (state.drive_url) setDriveUrl(state.drive_url);
        if (state.summary) {
          const c = state.summary.completed_scenes ?? 0;
          const f = state.summary.failed_scenes ?? 0;
          setRunSummary(`Completadas ${c} · Fallidas ${f} · ${state.output_root ?? ""}`);
        }
      })
      .catch((e) => {
        setRunError(`No se pudo abrir el proyecto: ${e.message ?? e}`);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectQuery]);

  // Balance KIE en tiempo real (polleo cada 60s, refresh manual al final del run)
  const [kieCredits, setKieCredits] = useState<number | null>(null);
  const refreshBalance = useCallback(() => {
    fetch("/api/balance", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.credits === "number") setKieCredits(d.credits);
      })
      .catch(() => {
        // silent — el chip se queda en el último valor conocido
      });
  }, []);
  useEffect(() => {
    refreshBalance();
    const t = setInterval(refreshBalance, 60_000);
    return () => clearInterval(t);
  }, [refreshBalance]);

  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runSummary, setRunSummary] = useState<string | null>(null);
  const [driveUrl, setDriveUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Métricas
  const lineCount = useMemo(
    () => (scriptText ? scriptText.split(/\r?\n/).length : 0),
    [scriptText],
  );
  const sceneCount = parseResult?.scenes.length ?? 0;

  // Calculadora real: reacciona a modo, modelo, resolución, duración y audio.
  const estimate = useMemo(() => {
    const breakdown = computeProjectCost(config, sceneCount);
    return {
      credits: breakdown?.credits ?? null,
      eur: breakdown?.eur ?? null,
    };
  }, [config, sceneCount]);

  // Paso 1: analiza el guion y abre la vista de revisión (NO crea proyecto todavía).
  function handleDetect() {
    const r = parseScript(scriptText);
    setParseResult(r);
    setProjectCreated(false);
    setProductionScenes(null);
    setRunError(null);
    setRunSummary(null);
  }

  // Paso 2: "Crear proyecto" — inicializa el estado de producción y muestra ProductionView.
  // Si tiene nombre, navegamos a /?project=<name> para que la URL refleje el proyecto
  // y se pueda compartir / reabrir desde el dashboard.
  function handleCreateProject() {
    if (!parseResult) return;
    const scenes: SceneState[] = parseResult.scenes.map((s) => {
      const st = emptySceneState(s.scene_number, config.mode);
      st.scene_id = `${s.scene_number.padStart(3, "0")}-${s.scene_name?.slice(0, 8).toLowerCase().replace(/\s+/g, "_") || "scene"}`;
      return st;
    });
    setProductionScenes(scenes);
    setProjectCreated(true);
    if (projectName.trim()) {
      router.replace(`/automator?project=${encodeURIComponent(projectName.trim())}`);
    }
  }

  // "Editar escenas" — oculta la vista de revisión para volver a tocar el textarea.
  function handleEditScenes() {
    setParseResult(null);
    setProjectCreated(false);
    setProductionScenes(null);
    // Limpia el ?project= de la URL para que no rehidrate al reload
    if (projectQuery) router.replace("/automator");
  }

  function handleEvent(ev: SseEvent) {
    const kind = ev.event;
    if (kind === "start") {
      // Inicializamos por si acaso (handleDetect ya lo dejó listo).
      return;
    }
    if (kind === "job_start") {
      const sceneNumber = String(ev.scene ?? "");
      const stageKind = ev.kind === "video" ? "video" : "first_frame";
      setProductionScenes((prev) =>
        prev
          ? prev.map((s) =>
              s.scene_number === sceneNumber
                ? {
                    ...s,
                    status: "running",
                    stages: {
                      ...s.stages,
                      [stageKind]: { ...s.stages[stageKind], status: "running", started_at: Date.now() },
                    },
                  }
                : s,
            )
          : prev,
      );
      return;
    }
    if (kind === "job_done") {
      const sceneNumber = String(ev.scene ?? "");
      const stageKind = ev.kind === "video" ? "video" : "first_frame";
      const path = ev.path ? String(ev.path) : undefined;
      setProductionScenes((prev) =>
        prev
          ? prev.map((s) => {
              if (s.scene_number !== sceneNumber) return s;
              const stages = {
                ...s.stages,
                [stageKind]: {
                  ...s.stages[stageKind],
                  status: "completed" as const,
                  output_path: path,
                  finished_at: Date.now(),
                },
              };
              // Cuando el vídeo termina, el cliente Drive sincroniza solo.
              // Marcamos drive_upload como completed inmediatamente.
              if (stageKind === "video") {
                stages.drive_upload = { ...stages.drive_upload, status: "completed", finished_at: Date.now() };
              }
              // Una escena se da por completa cuando el último stage no-skip está done.
              const isComplete =
                stages.first_frame.status !== "pending" &&
                stages.first_frame.status !== "running" &&
                stages.video.status !== "pending" &&
                stages.video.status !== "running" &&
                stages.first_frame.status !== "failed" &&
                stages.video.status !== "failed";
              return {
                ...s,
                status: isComplete ? "completed" : "running",
                stages,
              };
            })
          : prev,
      );
      return;
    }
    if (kind === "job_fail") {
      const sceneNumber = String(ev.scene ?? "");
      const stageKind = ev.kind === "video" ? "video" : "first_frame";
      const err = String(ev.error ?? "unknown");
      setProductionScenes((prev) =>
        prev
          ? prev.map((s) => {
              if (s.scene_number !== sceneNumber) return s;
              const stages = { ...s.stages };
              stages[stageKind] = {
                ...stages[stageKind],
                status: "failed",
                error: err,
                finished_at: Date.now(),
              };
              // Si falla la imagen, video y drive_upload se marcan skipped (no se lanzan).
              if (stageKind === "first_frame") {
                stages.video = { ...stages.video, status: "skipped" };
                stages.drive_upload = { ...stages.drive_upload, status: "skipped" };
              }
              return {
                ...s,
                status: "failed",
                error: err,
                stages,
              };
            })
          : prev,
      );
      return;
    }
    if (kind === "drive_synced" || kind === "drive_sync_start") {
      if (kind === "drive_synced" && ev.url) setDriveUrl(String(ev.url));
      return;
    }
    if (kind === "end") {
      const completed = ev.completed_scenes ?? 0;
      const failed = ev.failed_scenes ?? 0;
      const root = ev.output_root ?? "";
      if (ev.drive_url) setDriveUrl(String(ev.drive_url));
      setRunSummary(`Completadas ${completed} · Fallidas ${failed} · ${root}`);
      // Refresca balance KIE (los créditos cambiaron tras la generación)
      refreshBalance();
      return;
    }
    if (kind === "api_end") {
      // El runner local terminó. Si salió con código != 0 sin un `end`/`fatal`
      // explícito, la UI se quedaba "idle" sin señal de fallo → reflejamos el error.
      const code = ev.exit_code;
      if (typeof code === "number" && code !== 0) {
        setRunError((prev) => prev ?? `El motor terminó con código ${code} sin completar.`);
      }
      return;
    }
    if (kind === "fatal" || kind === "api_error") {
      setRunError(String(ev.error ?? "fatal"));
      return;
    }
  }

  async function handleStart() {
    if (isRunning || !productionScenes) return;
    setRunError(null);
    setRunSummary(null);
    setDriveUrl(null);
    setIsRunning(true);

    const project = {
      name: projectName.trim() || "untitled",
      mode: config.mode === "image_only" ? "image_only" : "pipeline",
      aspect_ratio: config.aspect_ratio,
      resolution: config.resolution,
      reference_image: refUrl || undefined,
      image_model: config.image_model,
      video_model: config.video_model,
      concurrency: config.concurrency,
      duration: config.duration_s,
      audio_enabled: config.audio_enabled,
      script_text: scriptText, // persistido en project.json para reabrir
      scenes: parseResult?.scenes ?? [],
    };

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      await runProjectSse({ project, refFile, onEvent: handleEvent, signal: ac.signal });
    } catch (e: unknown) {
      if (ac.signal.aborted) setRunError("Cancelado por el usuario.");
      else setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  // Regenera UNA escena (no toca las demás). POST /api/regenerate con SSE,
  // reusa el mismo handleEvent así actualiza el SceneState in-place.
  async function handleRetry(sceneNumber: string) {
    if (isRunning) return;
    setRunError(null);
    setIsRunning(true);

    // Pinta la escena como running ya para feedback inmediato
    setProductionScenes((prev) =>
      prev
        ? prev.map((s) =>
            s.scene_number === sceneNumber
              ? {
                  ...s,
                  status: "running",
                  error: undefined,
                  stages: {
                    ...s.stages,
                    first_frame: { status: "running" },
                    video:
                      s.stages.video.status === "skipped"
                        ? s.stages.video
                        : { status: "pending" },
                    drive_upload:
                      s.stages.drive_upload.status === "skipped"
                        ? s.stages.drive_upload
                        : { status: "pending" },
                  },
                }
              : s,
          )
        : prev,
    );

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project: projectName.trim() || projectQuery || "",
          scene_number: sceneNumber,
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${txt}`);
      }
      // Parse SSE
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          for (const line of block.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trimStart();
            if (!payload) continue;
            try {
              handleEvent(JSON.parse(payload));
            } catch {
              // ignore
            }
          }
        }
      }
      refreshBalance();
    } catch (e: unknown) {
      if (ac.signal.aborted) setRunError("Cancelado por el usuario.");
      else setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  }

  const canPreview = scriptText.trim().length > 0;

  return (
    <main className="min-h-full px-6 py-6">
      {/* Toolbar compacta (sustituye al header propio: la nav y la sidebar las
          monta el layout del yt-content-pipeline). Solo muestra balance KIE +
          link a historial + estado Drive. */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-red-600 flex items-center justify-center">
            <PlayCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">
              Automatiza tus <span className="text-red-500">vídeos de IA</span>
            </h1>
            <p className="text-xs text-zinc-500">
              Genera escenas con KIE.ai · sincroniza a Drive
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/automator/proyectos")}
            className="px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            Proyectos
          </button>
          <button
            type="button"
            onClick={() => router.push("/automator/historial")}
            className="px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            Historial
          </button>
          <span
            className="px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs flex items-center gap-1.5 cursor-pointer hover:border-zinc-700 transition-colors"
            onClick={refreshBalance}
            title="Click para refrescar"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span className="text-zinc-400">KIE</span>
            <span className="text-zinc-100 font-mono">
              {kieCredits !== null ? Math.round(kieCredits).toLocaleString("es-ES") : "—"}
            </span>
          </span>
          <span className="px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs flex items-center gap-1.5 text-zinc-400">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7.71 3.5L1.15 15l3.43 6h6.86l3.43-6L7.71 3.5zm15.14 11.5L16.29 3.5h-6.86l6.57 11.5h6.85zm-8 .5l3.43 6H1.15l3.43-6h10.27z" />
            </svg>
            Drive
          </span>
        </div>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Form principal + Producción (col-span 2) */}
        <div className="lg:col-span-2 space-y-5">
          <div className="card-panel p-6 space-y-5">
            {/* Provider chips */}
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Kie AI listo
              </span>
              <button
                type="button"
                className="btn-secondary !px-3 !py-1.5 !text-xs"
                onClick={() => setImageModalOpen(true)}
              >
                ⚙ Configurar imagen
              </button>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 5h12a2 2 0 012 2v3l4-3v10l-4-3v3a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2z" />
                </svg>
                Kie AI
              </span>
              <button
                type="button"
                className="btn-secondary !px-3 !py-1.5 !text-xs"
                onClick={() => setVideoModalOpen(true)}
              >
                ⚙ Configurar vídeo
              </button>
            </div>

            {/* Título del proyecto */}
            <div>
              <label className="label-uppercase">Título del proyecto</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Introduce un nombre para tu proyecto..."
                className="input-base"
              />
            </div>

            {/* URL de imagen de referencia */}
            <div>
              <label className="label-uppercase">URL de imagen de referencia</label>
              <div className="flex items-center gap-2 input-base !py-2.5 focus-within:!border-red-500/50">
                <svg className="w-4 h-4 text-zinc-500 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M10 14l4-4m-3 8l-4 4-4-4 4-4m9-3l4-4 4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                <input
                  type="url"
                  value={refUrl}
                  onChange={(e) => {
                    setRefUrl(e.target.value);
                    if (e.target.value) setRefFile(null);
                  }}
                  placeholder="https://..."
                  className="flex-1 bg-transparent text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                />
              </div>
              <div className="mt-2 flex items-center gap-3">
                <label className="cursor-pointer btn-secondary !px-3 !py-1.5 !text-xs">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M16 16l-4-4-4 4m4-4v9M21 12.65A5 5 0 0017 4a6 6 0 00-11.5 1.5A4 4 0 006 13"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>{refFile ? `Subido: ${refFile.name}` : "Subir referencia"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setRefFile(f);
                      if (f) setRefUrl("");
                    }}
                  />
                </label>
                <span className="text-xs text-zinc-500">O pega una URL arriba</span>
              </div>
            </div>

            {/* Guión de escenas */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label-uppercase !mb-0">Guión de escenas</label>
                <span className="text-xs text-zinc-500">
                  {lineCount} {lineCount === 1 ? "línea" : "líneas"}
                </span>
              </div>
              <textarea
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                rows={10}
                spellCheck={false}
                placeholder={`BLOQUE 0: GANCHO (0-4s)\nSecuencia 1 (0-2s)\nPrompt: "3D skeleton in hoodie, cinematic lighting"\nAnimación: Zoom in + particles\n\nSecuencia 2 (2-4s)\nPrompt: "City skyline at dusk, orange/blue contrast"\nAnimación: Lights flicker off`}
                className="input-base font-mono text-xs leading-relaxed"
              />
              <button
                type="button"
                onClick={() => setShowFormats(true)}
                className="mt-2 text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-2 transition-colors"
              >
                Ver formatos esperados
              </button>
            </div>

            {/* Feedback de run */}
            {(runError || runSummary) && (
              <div
                className={`text-xs rounded-md px-3 py-2 border flex items-start justify-between gap-3 ${
                  runError
                    ? "bg-red-500/10 border-red-500/30 text-red-300"
                    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                }`}
              >
                <span className="flex-1">{runError ?? runSummary}</span>
                {!runError && driveUrl && (
                  <a
                    href={driveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-[11px] font-medium transition-colors whitespace-nowrap"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7.71 3.5L1.15 15l3.43 6h6.86l3.43-6L7.71 3.5zm15.14 11.5L16.29 3.5h-6.86l6.57 11.5h6.85zm-8 .5l3.43 6H1.15l3.43-6h10.27z" />
                    </svg>
                    Abrir en Drive
                  </a>
                )}
              </div>
            )}

            {/* CTA: Analizar y previsualizar escenas */}
            <button
              type="button"
              onClick={handleDetect}
              disabled={!canPreview || isRunning}
              className="btn-primary w-full"
            >
              <PenIcon className="w-4 h-4" />
              Analizar y previsualizar escenas
            </button>
          </div>

          {/* Paso intermedio: vista de revisión de escenas (antes de crear proyecto) */}
          {parseResult && parseResult.scenes.length > 0 && !projectCreated && (
            <ReviewScenes
              result={parseResult}
              onEdit={handleEditScenes}
              onCreate={handleCreateProject}
            />
          )}

          {/* Vista de producción: aparece tras "Crear proyecto" */}
          {projectCreated && productionScenes && productionScenes.length > 0 && (
            <ProductionView
              scenes={productionScenes}
              config={config}
              setConfig={setConfig}
              isRunning={isRunning}
              estimatedCredits={estimate.credits}
              estimatedEur={estimate.eur}
              onStart={handleStart}
              onStop={handleStop}
              onRetry={handleRetry}
              providersOpen={providersOpen}
              setProvidersOpen={setProvidersOpen}
              imageModels={IMAGE_MODELS}
              videoModels={VIDEO_MODELS}
            />
          )}
        </div>

        {/* Panel derecho */}
        <div className="lg:col-span-1">
          <JobsPanel
            scenes={productionScenes ?? []}
            isRunning={isRunning}
            onStop={isRunning ? handleStop : undefined}
          />
        </div>
      </section>

      <FormatsHelper open={showFormats} onClose={() => setShowFormats(false)} />
      <ProviderModal
        open={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
        kind="image"
        providers={IMAGE_PROVIDERS}
        selectedProvider="kie"
        selectedModel={config.image_model}
        onSelectModel={(slug) => setConfig({ image_model: slug })}
      />
      <ProviderModal
        open={videoModalOpen}
        onClose={() => setVideoModalOpen(false)}
        kind="video"
        providers={VIDEO_PROVIDERS}
        selectedProvider="kie"
        selectedModel={config.video_model}
        onSelectModel={(slug) => setConfig({ video_model: slug })}
      />
    </main>
  );
}
