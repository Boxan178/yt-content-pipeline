/**
 * Configuración central de paths absolutos del sistema.
 *
 * Centraliza Y:/ (bóveda J.A.R.V.I.S.), H:/ (assets YouTube en SSD) y derivados.
 * Si cambia el drive letter o la organización de carpetas, se toca aquí.
 *
 * Browser-safe: sin `server-only` ni `node:fs`. Lo importan tanto API routes /
 * Server Components como Client Components (p.ej. ClaudeRunButton).
 */

// IMPORTANTE — anti-NFT (Node File Tracer):
// Si exportamos `H_YOUTUBE_ROOT = 'H:/YOUTUBE'` (sin sufijo) como const literal,
// webpack/NFT la detecta y recorre `H:/YOUTUBE/` entero buscando dependencias.
// En `H:/YOUTUBE/_RECURSOS/CURSOS/.../*.mp4` hay archivos con nombres raros
// (doble punto, espacios) que disparan EISDIR durante `next build`.
//
// Decisión: `H_YOUTUBE_ROOT` NO se exporta. Los canales en `lib/channels.ts`
// usan paths literales completos hasta el folder concreto (ej.
// `'H:/YOUTUBE/CANALES ESTOICISMO/MODERNI STOICI'`), nunca el ROOT desnudo.
// Así NFT solo traza esas subcarpetas, no las hermanas como `_RECURSOS/`.
//
// `JARVIS_ROOT` sí se exporta porque las skills viven todas bajo
// `Y:/04_DEV/J.A.R.V.I.S/.claude/skills/` y NFT solo genera warnings ENOENT
// inocuos (no errores fatales) al intentar copiarlas. Construido con `.join`
// para reducir la heurística de NFT.

/** Raíz de la bóveda Obsidian J.A.R.V.I.S. (skills, memoria, lab, youtube-os). */
export const JARVIS_ROOT = ['Y:', '04_DEV', 'J.A.R.V.I.S'].join('/');

/** Prefijo `H:/YOUTUBE` SOLO para validación de paths. NO exportado a propósito
 *  (ver comentario arriba). Usar literales completos en `lib/channels.ts`. */
const H_YOUTUBE_PREFIX = ['H:', 'YOUTUBE'].join('/');

/** Subpath: youtube-os (canales + proyectos + guiones). */
export const YOUTUBE_OS_ROOT = `${JARVIS_ROOT}/youtube-os`;

/** Subpath: lab/ (proyectos hijos como kie-bridge, mission-control, etc.). */
export const LAB_ROOT = `${JARVIS_ROOT}/lab`;

/** Carpeta de contenido de las sleep stories estoicas. */
export const SLEEP_STORIES_CONTENT = `${YOUTUBE_OS_ROOT}/proyectos/sleep-stories-stoic/content`;

/** tts-jobs JSON con el plan de chunks para las sleep stories en español. */
export const TTS_JOBS_ES = `${SLEEP_STORIES_CONTENT}/tts-jobs-es.json`;

/** tts-jobs JSON con el plan de chunks para las sleep stories en inglés. */
export const TTS_JOBS_EN = `${SLEEP_STORIES_CONTENT}/tts-jobs-en.json`;

/** Punto de entrada Python de kie-bridge (Visual Lab y NORA+IRIS lo invocan). */
export const KIE_BRIDGE_PY = `${LAB_ROOT}/kie-bridge/kie.py`;

/** Engine de subida a YouTube (skill youtube-uploader). CLI directo upload.py:
 *  multi-canal (refresh_token por canal en channels.json), sube título +
 *  descripción + tags + miniatura en una llamada. Defaults puros (sin
 *  process.env porque este archivo es browser-safe); los overrides por env se
 *  aplican en lib/upload-schedule.ts (server-only). */
export const YOUTUBE_UPLOADER_DIR = `${LAB_ROOT}/youtube-uploader`;
export const YOUTUBE_UPLOADER_PY = `${YOUTUBE_UPLOADER_DIR}/upload.py`;
export const YOUTUBE_UPLOADER_PYTHON = `${YOUTUBE_UPLOADER_DIR}/.venv/Scripts/python.exe`;

/** Prefijos válidos para CWD / videoFolder en endpoints API. */
export const ALLOWED_PATH_PREFIXES = [JARVIS_ROOT, H_YOUTUBE_PREFIX];

/**
 * `true` si `p` cae bajo alguno de los prefijos permitidos. Normaliza
 * backslashes Windows → forward slashes antes de comparar.
 */
export function isAllowedPath(p: string): boolean {
  const norm = p.replace(/\\/g, '/').replace(/\/+$/, '');
  return ALLOWED_PATH_PREFIXES.some(
    (prefix) => norm === prefix || norm.startsWith(prefix + '/'),
  );
}

/**
 * Normaliza la entrada y devuelve la ruta válida o `null` si está fuera de
 * los prefijos permitidos. Usar en handlers API antes de tocar disco.
 */
export function normalizeAllowedPath(p: string | undefined | null): string | null {
  if (!p) return null;
  const norm = p.replace(/\\/g, '/').replace(/\/+$/, '');
  return isAllowedPath(norm) ? norm : null;
}

/** Path estándar de los guiones de un canal dentro de youtube-os. */
export function channelScriptsRoot(slug: string): string {
  return `${YOUTUBE_OS_ROOT}/youtube/${slug}/guiones`;
}
