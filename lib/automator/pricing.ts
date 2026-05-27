// Cálculo de coste de un proyecto.
//
// Precios base calibrados con:
//   - Tu observación: Seedance 1.5 Pro 3 escenas + Nano Banana 2 = 212 cr,
//                     Seedance 2 = 311 cr, Veo 3 Fast = 278 cr.
//   - Doc oficial KIE: Veo 3 Fast 8s+audio = 80 cr ($0.40), 1 cr = $0.005.
//
// Verificación final tras el primer test E2E real (cobro KIE).

import type { ProjectMode, ProviderConfig } from "./types";

// ─ Tarifas por modelo ───────────────────────────────────────────────────────

// Imagen: precio por resolución. Estimados (no publicado oficialmente desglose).
const IMAGE_PRICING: Record<string, Partial<Record<"1K" | "2K" | "4K", number>>> = {
  "nano-banana-2": { "1K": 4, "2K": 6, "4K": 12 },
  "nano-banana-pro": { "1K": 18, "2K": 22, "4K": 29 },
};

// Vídeo: base = 8s con audio "off" (donde aplique).
//   per_4s: precio cuando duration=4s (default = base/2 redondeado)
//   audio_extra: cr adicionales si audio_enabled (Seedance 2 lo soporta on/off)
//   audio_always: el modelo siempre genera audio (Veo 3) — toggle de audio se ignora
const VIDEO_PRICING: Record<
  string,
  {
    base: number;
    per_4s?: number;
    audio_extra?: number;
    audio_always?: boolean;
  }
> = {
  "bytedance/seedance-1.5-pro": { base: 60 },
  "bytedance/seedance-2": { base: 90, audio_extra: 20 },
  "veo3_fast": { base: 80, audio_always: true },
  "veo3": { base: 400, audio_always: true },
};

// ─ Constantes ───────────────────────────────────────────────────────────────

export const CREDIT_TO_EUR = 0.005; // 1 cr = $0.005 ≈ €0.0046; redondeamos a €0.005
export const BUFFER = 1.1; // +10% por reintentos / fallos

// ─ API pública ──────────────────────────────────────────────────────────────

export interface CostBreakdown {
  credits: number; // total con buffer
  credits_subtotal: number; // sin buffer
  eur: string; // total en EUR formato 2 decimales
  credits_per_scene: number;
  credits_per_image: number;
  credits_per_video: number;
  buffer_pct: number;
  mode: ProjectMode;
}

export function creditsPerImage(model: string, resolution: "1K" | "2K" | "4K"): number {
  const tier = IMAGE_PRICING[model];
  if (!tier) return 0;
  return tier[resolution] ?? tier["1K"] ?? 0;
}

export function creditsPerVideo(
  model: string,
  duration_s: 4 | 8,
  audio_enabled: boolean,
): number {
  const v = VIDEO_PRICING[model];
  if (!v) return 0;
  let cr =
    duration_s === 4
      ? v.per_4s ?? Math.round(v.base / 2)
      : v.base;
  if (!v.audio_always && v.audio_extra && audio_enabled) {
    cr += v.audio_extra;
  }
  return cr;
}

export function computeProjectCost(
  config: ProviderConfig,
  sceneCount: number,
): CostBreakdown | null {
  if (sceneCount <= 0) return null;

  const img =
    config.mode === "complete" || config.mode === "image_only"
      ? creditsPerImage(config.image_model, config.resolution)
      : 0;

  const vid =
    config.mode === "complete"
      ? creditsPerVideo(config.video_model, config.duration_s, config.audio_enabled)
      : 0;

  const perScene = img + vid;
  const subtotal = perScene * sceneCount;
  const total = Math.ceil(subtotal * BUFFER);

  return {
    credits: total,
    credits_subtotal: subtotal,
    eur: (total * CREDIT_TO_EUR).toFixed(2),
    credits_per_scene: perScene,
    credits_per_image: img,
    credits_per_video: vid,
    buffer_pct: Math.round((BUFFER - 1) * 100),
    mode: config.mode,
  };
}

// Helpers para los modales / cards de modelo: rango de coste para mostrar
// "9-20 credits (€0.04-€0.10)" tipo TubeNext.
export function imageCostRange(model: string): string {
  const tier = IMAGE_PRICING[model];
  if (!tier) return "—";
  const vals = Object.values(tier).filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return "—";
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const eurMin = (min * CREDIT_TO_EUR).toFixed(2);
  const eurMax = (max * CREDIT_TO_EUR).toFixed(2);
  return min === max
    ? `${min} credits (€${eurMin})`
    : `${min}-${max} credits (€${eurMin}-€${eurMax})`;
}

export function videoCostRange(model: string): string {
  const v = VIDEO_PRICING[model];
  if (!v) return "—";
  const min4 = v.per_4s ?? Math.round(v.base / 2);
  const max = v.base + (v.audio_extra ?? 0);
  if (min4 === max) {
    return `${max} credits (€${(max * CREDIT_TO_EUR).toFixed(2)})`;
  }
  return `${min4}-${max} credits (€${(min4 * CREDIT_TO_EUR).toFixed(2)}-€${(max * CREDIT_TO_EUR).toFixed(2)})`;
}
