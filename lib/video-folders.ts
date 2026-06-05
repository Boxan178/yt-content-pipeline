// Resolución robusta de la carpeta de un vídeo por su nombre a través de los
// estados del canal. Server-only (usa node:fs).
//
// PROBLEMA que resuelve: el pipeline a veces deja una carpeta "fantasma" en el
// estado de origen tras mover el vídeo a otro estado (típicamente un esqueleto
// con solo `.claude-jobs`, residuo de un job que siguió escribiendo en la ruta
// vieja tras el rename). Como la búsqueda ingenua recorría los estados en orden
// fijo (`_EN PRODUCCIÓN` antes que `_LISTOS PARA SUBIR`/`_SUBIDOS`/`_ARCHIVO`) y
// devolvía la PRIMERA coincidencia, esa fantasma secuestraba todas las
// peticiones del vídeo real → modal vacío, miniatura 404, "abrir carpeta" a la
// carpeta equivocada, move-state moviendo el esqueleto en vez del vídeo.
//
// Esta función PREFIERE la carpeta con material real (mismo criterio que el
// kanban: existe RENDER/ o _PACKAGING/), de modo que las fantasmas se ignoran
// aunque sigan en disco.

import 'server-only';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { Channel, VideoState } from './channels';

export interface ResolvedVideoFolder {
  /** Ruta absoluta de la carpeta del vídeo (separadores del SO). */
  absolute: string;
  /** Nombre EXACTO de la subcarpeta de estado (p.ej. "_LISTOS PARA SUBIR"). */
  stateFolder: string;
  /** Estado lógico correspondiente. */
  state: VideoState;
}

async function tryStat(p: string) {
  try {
    return await stat(p);
  } catch {
    return null;
  }
}

/**
 * ¿La carpeta tiene material real de un vídeo? Mismo criterio que el kanban
 * (`inspectVideoFolder`): existe RENDER/ o _PACKAGING/. Una carpeta que solo
 * contiene residuos del pipeline (p.ej. `.claude-jobs`) NO cuenta.
 */
async function hasRealContent(folder: string): Promise<boolean> {
  const render = await tryStat(path.join(folder, 'RENDER'));
  if (render?.isDirectory()) return true;
  const pkg = await tryStat(path.join(folder, '_PACKAGING'));
  if (pkg?.isDirectory()) return true;
  return false;
}

interface Match extends ResolvedVideoFolder {
  mtimeMs: number;
  hasPkg: boolean;
  hasRender: boolean;
}

/**
 * Devuelve TODAS las carpetas homónimas existentes en los estados del canal,
 * anotando si tienen material real. Útil para diagnósticos / limpieza.
 */
export async function findAllVideoFolders(
  channel: Channel,
  videoTitle: string,
): Promise<Array<ResolvedVideoFolder & { content: boolean }>> {
  const entries = Object.entries(channel.stateFolders) as [VideoState, string][];
  const out: Array<ResolvedVideoFolder & { content: boolean }> = [];
  for (const [state, sf] of entries) {
    if (!sf) continue;
    const absolute = path.join(channel.rootPath, sf, videoTitle);
    const s = await tryStat(absolute);
    if (!s || !s.isDirectory()) continue;
    out.push({ absolute, stateFolder: sf, state, content: await hasRealContent(absolute) });
  }
  return out;
}

/**
 * Resuelve la carpeta de un vídeo por nombre. Cuando hay homónimas en varios
 * estados (tras mover el vídeo, o tras un render que aterriza en otra carpeta)
 * elige con esta prioridad:
 *   1. Carpetas con _PACKAGING/ — la carpeta "principal" del vídeo (packaging.md,
 *      miniaturas, guion). Es la que el modal necesita para ser útil.
 *   2. Si ninguna tiene _PACKAGING, las que tengan RENDER/ (un render suelto).
 *   3. Si ninguna tiene material, lo que haya (todas fantasma).
 *   4. Desempate dentro del tier elegido: la modificada más recientemente.
 * Así las fantasma vacías (p.ej. solo .claude-jobs) nunca ganan a la carpeta real.
 * Devuelve null si no existe en ningún estado.
 */
export async function resolveVideoFolder(
  channel: Channel,
  videoTitle: string,
): Promise<ResolvedVideoFolder | null> {
  const entries = Object.entries(channel.stateFolders) as [VideoState, string][];
  const matches: Match[] = [];
  for (const [state, sf] of entries) {
    if (!sf) continue;
    const absolute = path.join(channel.rootPath, sf, videoTitle);
    const s = await tryStat(absolute);
    if (!s || !s.isDirectory()) continue;
    const hasRender = !!(await tryStat(path.join(absolute, 'RENDER')))?.isDirectory();
    const hasPkg = !!(await tryStat(path.join(absolute, '_PACKAGING')))?.isDirectory();
    matches.push({ absolute, stateFolder: sf, state, mtimeMs: s.mtimeMs, hasPkg, hasRender });
  }
  if (matches.length === 0) return null;

  const tiers: Match[][] = [
    matches.filter((m) => m.hasPkg),
    matches.filter((m) => m.hasRender),
    matches,
  ];
  const pool = tiers.find((t) => t.length > 0)!;
  // Desempate determinista: la modificada más recientemente.
  pool.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const best = pool[0];
  return { absolute: best.absolute, stateFolder: best.stateFolder, state: best.state };
}
