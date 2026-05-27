// Crea la estructura de carpetas de un vídeo nuevo en disco antes de spawn
// SARA. Reimplementa en TS el contrato de la skill `setup-video-moderni-stoici`
// (esa skill solo soporta Moderni Stoici; aquí la generalizamos a cualquier
// canal estoico parametrizando el `rootPath` desde `lib/channels.ts`).
//
// Idempotente — si la carpeta ya existe, solo se crea lo que falta.
//
// Pensado para que lo consuma `lib/notion-poller.ts` cuando Notion pide
// arrancar un vídeo. Vaultman aún no tiene convención de estructura definida
// → devolvemos `{ ok: false, reason: 'unsupported-channel' }` y el poller hace
// skip + log.

import 'server-only';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getChannel, type Channel } from './channels';

export interface BootstrapResult {
  ok: boolean;
  /** Path absoluto de la carpeta del vídeo (creada o existente). */
  folderPath?: string;
  /** Path resuelto incluso si no se creó (útil para logging cuando ya existía). */
  resolvedPath?: string;
  /** Si el vídeo ya existía en disco antes de invocar este helper. */
  alreadyExisted?: boolean;
  /** Resumen de qué se creó. */
  created?: {
    dirs: number;
    files: number;
  };
  reason?: 'unsupported-channel' | 'missing-channel-root' | 'unsafe-name' | string;
  error?: string;
}

const WINDOWS_FORBIDDEN = /[<>:"/\\|?*\x00-\x1f]/;

function isSafeName(name: string): boolean {
  return name.length > 0 && !WINDOWS_FORBIDDEN.test(name);
}

function ensureDir(dir: string, counter: { dirs: number }) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    counter.dirs += 1;
  }
}

function ensureFile(file: string, counter: { files: number }) {
  if (!existsSync(file)) {
    writeFileSync(file, '', 'utf-8');
    counter.files += 1;
  }
}

/**
 * Crea la estructura canónica `01_BRUTOS/{_FOTO,_LOCUCION,_VÍDEO,SHORT 1..5}`,
 * `RENDER/{long.txt, Short N.txt}` y `_PACKAGING/MINIATURAS/` para los canales
 * estoicos. Devuelve el path absoluto de la carpeta del vídeo. No reescribe ni
 * borra nada que ya exista — pensado para correr sobre carpetas en progreso.
 *
 * `videoFolderName` es el nombre humano del vídeo tal cual se va a ver en
 * disco (NO un slug). El slug se usa para otras cosas (manifest, scripts),
 * la carpeta usa el título literal.
 */
export function bootstrapVideoFolder(opts: {
  channelSlug: string;
  videoFolderName: string;
}): BootstrapResult {
  const channel = getChannel(opts.channelSlug);
  if (!channel) {
    return { ok: false, reason: 'unsupported-channel', error: `channel ${opts.channelSlug} not found` };
  }
  // Vaultman aún no tiene convención de estructura (Pablo TBD): no creamos
  // nada y el poller hará skip controlado.
  if (channel.slug === 'vaultman') {
    return { ok: false, reason: 'unsupported-channel', error: 'vaultman bootstrap not implemented yet' };
  }
  if (channel.slug !== 'moderni-stoici' && channel.slug !== 'moderno-estoico') {
    return { ok: false, reason: 'unsupported-channel', error: `bootstrap not implemented for ${channel.slug}` };
  }
  if (!isSafeName(opts.videoFolderName)) {
    return {
      ok: false,
      reason: 'unsafe-name',
      error: `videoFolderName contiene caracteres prohibidos en Windows: ${opts.videoFolderName}`,
    };
  }

  return bootstrapStoicLike(channel, opts.videoFolderName);
}

function bootstrapStoicLike(channel: Channel, videoFolderName: string): BootstrapResult {
  // El rootPath de los canales estoicos apunta a la raíz del canal (no a
  // _EN PRODUCCIÓN). El nuevo vídeo nace en `_EN PRODUCCIÓN` por convención.
  const channelRoot = channel.rootPath;
  if (!existsSync(channelRoot)) {
    return { ok: false, reason: 'missing-channel-root', error: `no existe ${channelRoot}` };
  }
  const productionDir = path.join(channelRoot, channel.stateFolders.production);
  if (!existsSync(productionDir)) {
    // Crear la columna `_EN PRODUCCIÓN` si por alguna razón no estuviera —
    // es estructura inmutable del canal pero defensivo.
    mkdirSync(productionDir, { recursive: true });
  }

  const videoRoot = path.join(productionDir, videoFolderName);
  const alreadyExisted = existsSync(videoRoot);

  const counter = { dirs: 0, files: 0 };

  ensureDir(videoRoot, counter);

  // 01_BRUTOS + _FOTO / _LOCUCION / _VÍDEO
  const brutos = path.join(videoRoot, '01_BRUTOS');
  ensureDir(brutos, counter);
  ensureDir(path.join(brutos, '_FOTO'), counter);
  ensureDir(path.join(brutos, '_LOCUCION'), counter);
  ensureDir(path.join(brutos, '_VÍDEO'), counter);

  // 5 placeholders genéricos de shorts (sin hash; el equipo los renombra
  // cuando los shorts tomen forma)
  for (let n = 1; n <= 5; n++) {
    ensureDir(path.join(brutos, `🎬 SHORT ${n} — TBD`), counter);
  }

  // RENDER + placeholders .txt para copiar nombre al exportar
  const render = path.join(videoRoot, 'RENDER');
  ensureDir(render, counter);
  ensureFile(path.join(render, `${videoFolderName}.txt`), counter);
  for (let n = 1; n <= 5; n++) {
    ensureFile(path.join(render, `Short ${n} — TBD.txt`), counter);
  }

  // _PACKAGING / MINIATURAS
  const packaging = path.join(videoRoot, '_PACKAGING');
  ensureDir(packaging, counter);
  ensureDir(path.join(packaging, 'MINIATURAS'), counter);

  return {
    ok: true,
    folderPath: videoRoot,
    resolvedPath: videoRoot,
    alreadyExisted,
    created: counter,
  };
}
