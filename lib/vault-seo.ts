// Resolución del SEO "real" desde la VAULT cuando no está en `_PACKAGING/`.
//
// PROBLEMA que resuelve: el pipeline de SARA escribe el SEO definitivo en la
// vault (`youtube-os/youtube/<canal>/videos/<slug>/descripcion-seo.md`, con el
// título final en frontmatter `video:`/`title:` + descripción + tags), pero la
// auto-subida (lib/auto-publish.ts) solo miraba en `H:/…/_PACKAGING/` y en la
// raíz del vídeo. Si el paso que copia el SEO a `_PACKAGING/` no llegó a correr,
// el vídeo se subía con título = nombre de la miniatura y SIN descripción ni tags
// (caso real: el vídeo de los 90 días, 2026-06-08).
//
// La carpeta de la vault la resuelve `lib/vault-resolve.ts` (slug → pipeline_item_id
// → match por título). El frontmatter del título es inconsistente entre vídeos
// (`video:` en unos, `title:` en otros), así que leemos ambos.

import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractSeoDescription } from './extract-metadata';
import { resolveVaultFolder, frontmatterAny } from './vault-resolve';

export interface VaultSeo {
  title: string;
  description: string;
  tags: string[];
  vaultFolder: string;
}

/**
 * Devuelve el SEO de la vault para un vídeo de H:, o null si no se encuentra.
 */
export function getVaultSeo(channelSlug: string, videoFolder: string): VaultSeo | null {
  const vaultFolder = resolveVaultFolder(channelSlug, videoFolder);
  if (!vaultFolder) return null;

  let seoMd: string;
  try {
    seoMd = readFileSync(path.join(vaultFolder, 'descripcion-seo.md'), 'utf-8');
  } catch {
    return null;
  }
  const title = frontmatterAny(seoMd, ['video', 'title']) ?? '';
  const { description, tags } = extractSeoDescription(seoMd);
  if (!title && !description) return null;
  return { title, description, tags, vaultFolder: vaultFolder.replace(/\\/g, '/') };
}
