// Parser de guiones de escenas — replica el comportamiento de TubeNext.
//
// Acepta 4 formatos (probados con los inputs reales de IRIS+CIRO):
//   1. Etiquetado:        ESCENA N: nombre  +  Prompt:/Animación:
//   2. Variantes header:  SECUENCIA / SCENE / SHOT  +  Image prompt: / Animation: / Visual Cue: ...
//   3. Freeform:          ▶ ESCENA N — Nombre  +  cuerpo libre (todo va a image_prompt)
//   4. JSON:              array de objetos con claves variantes (sceneNumber/image_prompt/...)
//
// Devuelve escenas normalizadas: { scene_number, scene_name?, image_prompt?, video_prompt?, ... }.

import type { ParseResult, Scene, ScriptFormat } from "./types";

// ── JSON path ───────────────────────────────────────────────────────────────

const JSON_KEY_MAP: Record<string, keyof Scene> = {
  // scene_number
  scene_number: "scene_number",
  scenenumber: "scene_number",
  scene_num: "scene_number",
  scenenum: "scene_number",
  number: "scene_number",
  num: "scene_number",
  // scene_name
  scene_name: "scene_name",
  scenename: "scene_name",
  name: "scene_name",
  title: "scene_name",
  // image_prompt
  image_prompt: "image_prompt",
  imageprompt: "image_prompt",
  prompt: "image_prompt",
  image: "image_prompt",
  visual: "image_prompt",
  visual_cue: "image_prompt",
  visualcue: "image_prompt",
  // video_prompt
  video_prompt: "video_prompt",
  videoprompt: "video_prompt",
  animation_prompt: "video_prompt",
  animationprompt: "video_prompt",
  animation: "video_prompt",
  motion: "video_prompt",
  motion_cue: "video_prompt",
  motioncue: "video_prompt",
  video_motion: "video_prompt",
  videomotion: "video_prompt",
  video: "video_prompt",
  // negative
  negative_prompt: "negative_prompt",
  negativeprompt: "negative_prompt",
  negative: "negative_prompt",
};

function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[\s\-]+/g, "_");
}

function parseJson(input: string): ParseResult | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const scenes: Scene[] = [];
  const warnings: string[] = [];

  arr.forEach((item, idx) => {
    if (typeof item !== "object" || item === null) {
      warnings.push(`Item ${idx} is not an object, skipping.`);
      return;
    }
    const scene: Scene = { scene_number: String(idx + 1) };
    for (const [rawKey, value] of Object.entries(item as Record<string, unknown>)) {
      const normalized = normalizeKey(rawKey);
      const target = JSON_KEY_MAP[normalized];
      if (!target) continue;
      if (value === null || value === undefined) continue;
      const stringValue = String(value).trim();
      if (!stringValue) continue;
      scene[target] = stringValue as never;
    }
    scenes.push(scene);
  });

  return {
    scenes,
    format: "json",
    warnings,
  };
}

// ── texto path ──────────────────────────────────────────────────────────────

// Cabeceras: opcional viñeta (▶ • ► - *), tipo (ESCENA/SECUENCIA/SCENE/SHOT/TOMA),
// número opcional con letra (1, 01, 1a, 12), separador opcional (: - —), nombre opcional.
const HEADER_RE =
  /^\s*[▶•►\-*]?\s*(ESCENA|SECUENCIA|SCENE|SHOT|TOMA)\s+(\d+[a-z]?)\s*[:\-—]?\s*(.*?)\s*$/im;

// Etiquetas dentro del bloque. Mapeo etiqueta → campo de Scene.
// Ojo: "video" matchea "video_prompt", "video prompt", "video motion". Diseñado liberal.
const LABEL_PATTERNS: Array<{ field: keyof Scene; re: RegExp }> = [
  // negative primero para que no se trague "prompt"
  {
    field: "negative_prompt",
    re: /^\s*(negative\s*prompt|negative|negativo)\s*[:\-]\s*(.+?)\s*$/i,
  },
  {
    field: "video_prompt",
    re: /^\s*(animaci[oó]n|animation|motion\s*cue|motion|movimiento|video\s*prompt|video\s*motion|video)\s*[:\-]\s*(.+?)\s*$/i,
  },
  {
    field: "image_prompt",
    re: /^\s*(image\s*prompt|imagen|image|visual\s*cue|visual|frame|descripci[oó]n|promp?t)\s*[:\-]\s*(.+?)\s*$/i,
  },
];

function splitByHeaders(input: string): Array<{
  number: string;
  name: string;
  body: string;
  headerLine: string;
}> {
  const lines = input.split(/\r?\n/);
  type Block = { number: string; name: string; body: string[]; headerLine: string };
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const line of lines) {
    const m = HEADER_RE.exec(line);
    if (m) {
      if (current) blocks.push(current);
      current = {
        number: m[2],
        name: (m[3] || "").trim(),
        body: [],
        headerLine: line.trim(),
      };
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) blocks.push(current);

  return blocks.map((b) => ({
    number: b.number,
    name: b.name,
    body: b.body.join("\n").trim(),
    headerLine: b.headerLine,
  }));
}

function parseBlockBody(body: string): {
  fields: Partial<Scene>;
  matchedLabels: number;
  totalNonEmpty: number;
} {
  const fields: Partial<Scene> = {};
  let matchedLabels = 0;
  let totalNonEmpty = 0;

  // Estrategia: recorremos línea a línea. Cuando una línea matchea LABEL,
  // arrancamos un campo. Las líneas siguientes sin label se acumulan al campo
  // activo hasta la próxima label o línea en blanco.
  const lines = body.split(/\r?\n/);
  let activeField: keyof Scene | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      activeField = null;
      continue;
    }
    totalNonEmpty++;

    let matched = false;
    for (const { field, re } of LABEL_PATTERNS) {
      const m = re.exec(line);
      if (m) {
        const value = m[2].trim();
        if (value) {
          fields[field] = ((fields[field] ?? "") + (fields[field] ? "\n" : "") + value) as never;
        }
        activeField = field;
        matched = true;
        matchedLabels++;
        break;
      }
    }

    if (!matched && activeField) {
      // Continuación del campo activo (línea de wrap)
      const prev = fields[activeField] ?? "";
      fields[activeField] = (prev + (prev ? "\n" : "") + line.trim()) as never;
    } else if (!matched && !activeField) {
      // Línea suelta sin label y sin campo activo: la acumulamos como image_prompt
      // por defecto (modo freeform).
      const prev = fields.image_prompt ?? "";
      fields.image_prompt = (prev + (prev ? "\n" : "") + line.trim()) as never;
    }
  }

  return { fields, matchedLabels, totalNonEmpty };
}

function parseText(input: string): ParseResult {
  const blocks = splitByHeaders(input);
  if (blocks.length === 0) {
    return { scenes: [], format: "empty", warnings: ["No scene headers detected."] };
  }

  const warnings: string[] = [];
  let anyLabeled = false;
  let anyFreeform = false;

  const scenes: Scene[] = blocks.map((block) => {
    const { fields, matchedLabels, totalNonEmpty } = parseBlockBody(block.body);
    const scene: Scene = {
      scene_number: block.number,
      raw_block: `${block.headerLine}\n${block.body}`.trim(),
    };
    if (block.name) scene.scene_name = block.name;
    if (fields.image_prompt) scene.image_prompt = fields.image_prompt;
    if (fields.video_prompt) scene.video_prompt = fields.video_prompt;
    if (fields.negative_prompt) scene.negative_prompt = fields.negative_prompt;

    if (matchedLabels === 0 && totalNonEmpty > 0) {
      anyFreeform = true;
    } else if (matchedLabels > 0) {
      anyLabeled = true;
    }

    const sceneWarnings: string[] = [];
    if (!scene.image_prompt && !scene.video_prompt) {
      sceneWarnings.push("Scene has no image_prompt nor video_prompt.");
    }
    if (sceneWarnings.length) scene.warnings = sceneWarnings;

    return scene;
  });

  // Detectar duplicados de scene_number
  const seen = new Map<string, number>();
  scenes.forEach((s) => {
    seen.set(s.scene_number, (seen.get(s.scene_number) ?? 0) + 1);
  });
  seen.forEach((count, num) => {
    if (count > 1) warnings.push(`Scene number "${num}" appears ${count} times.`);
  });

  let format: ScriptFormat;
  if (anyLabeled && anyFreeform) format = "mixed";
  else if (anyLabeled) format = "labeled";
  else format = "freeform";

  return { scenes, format, warnings };
}

// ── API pública ─────────────────────────────────────────────────────────────

export function parseScript(input: string): ParseResult {
  if (!input || !input.trim()) {
    return { scenes: [], format: "empty", warnings: ["Empty input."] };
  }
  return parseJson(input) ?? parseText(input);
}
