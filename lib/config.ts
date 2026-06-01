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

// === Letras de unidad externas, INVISIBLES para el build ====================
// Aprendido a la mala (verificado empíricamente con _trace-readlink.js): NFT
// (Node File Tracer) NO respeta el valor de `process.env` — ante `process.env.X`
// lo trata como DESCONOCIDO y, en el `?:`, PLIEGA a la rama LITERAL (el fallback).
// Si el fallback es la letra real ('H'/'Y'), NFT resuelve `rootPath` al literal
// `H:/YOUTUBE/CANALES ESTOICISMO/MODERNI STOICI`, lo trata como directorio-asset
// y lo RECORRE entero → `readlink` EISDIR sobre carpetas de nombre raro del canal
// (p.ej. una carpeta `idea.md`) → `next build` PETA. (Terser tampoco ayuda: folea
// `.join`/`fromCharCode`/concatenación al literal.)
//
// FIX FIABLE: el fallback es VACÍO. En el BUILD, NFT resuelve el prefijo a '' →
// `'' + '/YOUTUBE/...'` = `/YOUTUBE/...`, un path en la raíz del drive actual
// (C:\YOUTUBE\...) que NO existe → NFT no recorre H:/ ni Y: → build limpio. Lo
// mismo con JARVIS_ROOT (`/04_DEV/J.A.R.V.I.S/.claude/skills` → C:\... inexistente),
// así que tampoco sigue el symlink de skills al NAS ni entra en worktrees.
//
// En RUNTIME el drive real SIEMPRE llega por env (nunca se alcanza el fallback):
//   · dev  → script `dev:next` (cross-env YTCP_DRIVE_H=H YTCP_DRIVE_Y=Y)
//   · prod → Electron `startNextServer` setea YTCP_DRIVE_H/Y al spawnear el server
// Para mover el SSD/NAS a otra letra, exporta YTCP_DRIVE_H / YTCP_DRIVE_Y.
function externalDrive(envKey: string, letter: string): string {
  // CLIENTE (browser): el bundle de cliente NO recibe `process.env` (solo
  // NEXT_PUBLIC_*, y esos los hornearía NFT en build). Como en ese bundle
  // `typeof window` NO es 'undefined', esta rama se CONSERVA y devuelve la letra
  // literal ('H:') → coincide con lo que renderiza el server → SIN hydration
  // mismatch y sin paths rotos (/YOUTUBE) en el cliente.
  if (typeof window !== 'undefined') return letter + ':';
  // SERVIDOR: en BUILD, NFT ve `process.env[envKey]` como desconocido → fallback ''
  // → path inexistente → NO traza H:/ ni Y:. En RUNTIME, dev:next y Electron setean
  // YTCP_DRIVE_H/Y → 'H:'. (En el bundle de server `typeof window` → 'undefined', así
  // que la rama de cliente es dead-code y NFT nunca ve la letra literal.)
  const v = process.env[envKey];
  return v && v.length > 0 ? v + ':' : '';
}
const DRIVE_Y = externalDrive('YTCP_DRIVE_Y', 'Y');
const DRIVE_H = externalDrive('YTCP_DRIVE_H', 'H');

/** Raíz de la bóveda Obsidian J.A.R.V.I.S. (skills, memoria, lab, youtube-os). */
export const JARVIS_ROOT = `${DRIVE_Y}/04_DEV/J.A.R.V.I.S`;

/** Prefijo `H:/YOUTUBE` para construir paths de canales (build-invisible). */
const H_YOUTUBE_PREFIX = `${DRIVE_H}/YOUTUBE`;

/** `H:/YOUTUBE` build-invisible para usar en lib/channels.ts (en vez de literales
 *  completos, que el minificador folea y NFT acaba trazando → build peta). */
export const H_YOUTUBE = H_YOUTUBE_PREFIX;

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

/**
 * `true` si `seg` es un nombre de carpeta/archivo SEGURO: un único segmento, sin
 * separadores de path, sin `..`, sin byte nulo y sin letra de unidad. Úsalo para
 * validar params de ruta controlados por el usuario (p.ej. el título de un vídeo)
 * ANTES de hacer `path.join(rootDeConfianza, seg)` — bloquea path traversal del
 * tipo `..%2F..%2F..%2FWindows`. Browser-safe (solo strings/regex).
 */
export function isSafePathSegment(seg: string | undefined | null): boolean {
  if (!seg || typeof seg !== 'string') return false;
  if (seg.includes('/') || seg.includes('\\') || seg.includes('\0')) return false;
  if (seg === '.' || seg === '..') return false;
  if (/^[a-zA-Z]:/.test(seg)) return false; // letra de unidad Windows (C:, H:)
  return true;
}

/** Path estándar de los guiones de un canal dentro de youtube-os. */
export function channelScriptsRoot(slug: string): string {
  return `${YOUTUBE_OS_ROOT}/youtube/${slug}/guiones`;
}
