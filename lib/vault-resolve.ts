// Resolución de la carpeta HOGAR de un vídeo en la VAULT a partir de su carpeta
// de trabajo en H:. Server-only.
//
// PROBLEMA que resuelve: el contenido "bueno" del pipeline (packaging.md con la
// tabla de títulos de MARCOS, titulos.md, descripcion-seo.md, miniaturas) lo
// escribe SARA en la vault (`youtube-os/youtube/<canal>/videos/<slug>/`), pero la
// app (gate de Telegram, auto-publish, SEO) lee de `H:/…/<vídeo>/_PACKAGING/`.
// Cuando no están sincronizados, el gate no dispara o sale sin opciones y la
// auto-subida pierde el SEO. Este módulo es el ÚNICO sitio que sabe casar la
// carpeta de H: con la de la vault, con prioridad determinista:
//   1) `slug:` en el packaging.md de H:           (determinista)
//   2) `pipeline_item_id` compartido               (determinista)
//   3) match por título/slug normalizado           (fallback difuso)

import 'server-only';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { channelScriptsRoot } from './config';

function safeRead(p: string): string | null {
  try {
    return readFileSync(p, 'utf-8');
  } catch {
    return null;
  }
}

/** Lee un campo del frontmatter YAML (o de la cabecera si no hay `---`). */
export function frontmatterField(md: string, field: string): string | null {
  const fm = md.match(/^﻿?---\n([\s\S]+?)\n---/);
  const body = fm ? fm[1] : md.slice(0, 1500);
  const m = body.match(new RegExp(`^${field}\\s*:\\s*(.+)$`, 'im'));
  if (!m) return null;
  return m[1].trim().replace(/^['"“”‘’]+/, '').replace(/['"“”‘’]+$/, '').trim();
}

/** Primer valor no vacío de varios campos de frontmatter. */
export function frontmatterAny(md: string, fields: string[]): string | null {
  for (const f of fields) {
    const v = frontmatterField(md, f);
    if (v && !/^pendiente$/i.test(v)) return v;
  }
  return null;
}

/** basename normalizado de una carpeta. */
function folderBase(p: string): string {
  return p.replace(/\\/g, '/').split('/').filter(Boolean).pop()?.normalize('NFC') ?? '';
}

/** Slug-ish de un texto (kebab, sin acentos ni símbolos) para comparar nombres. */
function slugish(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Lee el `slug` y el `pipeline_item_id` del packaging.md de H: (si existe). */
function readHints(videoFolder: string): { slug: string | null; pipelineId: string | null } {
  const pkg = safeRead(path.join(videoFolder, '_PACKAGING', 'packaging.md'));
  if (!pkg) return { slug: null, pipelineId: null };
  const slug = frontmatterField(pkg, 'slug');
  const id = frontmatterField(pkg, 'pipeline_item_id');
  return {
    slug: slug && !/^pendiente$/i.test(slug) ? slug : null,
    pipelineId: id && !/^pendiente$/i.test(id) ? id : null,
  };
}

/**
 * Devuelve la ruta absoluta de la carpeta HOGAR del vídeo en la vault, o null.
 * No lanza. Determinista cuando hay `slug`/`pipeline_item_id`; difuso por nombre
 * en último recurso.
 */
export function resolveVaultFolder(channelSlug: string, videoFolder: string): string | null {
  const videosRoot = channelScriptsRoot(channelSlug); // …/youtube/<slug>/videos
  const { slug, pipelineId } = readHints(videoFolder);

  // 1) Determinista por slug → carpeta homónima en la vault.
  if (slug) {
    const direct = path.join(videosRoot, slug);
    try {
      if (statSync(direct).isDirectory()) return direct;
    } catch {}
  }

  let dirs: string[];
  try {
    dirs = readdirSync(videosRoot);
  } catch {
    return null;
  }

  const wantBase = folderBase(videoFolder).toLowerCase();
  const wantSlugish = slugish(folderBase(videoFolder));
  let fuzzy: string | null = null;

  for (const d of dirs) {
    const vf = path.join(videosRoot, d);
    try {
      if (!statSync(vf).isDirectory()) continue;
    } catch {
      continue;
    }

    // 2) Determinista por pipeline_item_id (packaging.md / titulos.md de la vault).
    if (pipelineId) {
      for (const fname of ['packaging.md', 'titulos.md']) {
        const md = safeRead(path.join(vf, fname));
        if (md && frontmatterField(md, 'pipeline_item_id') === pipelineId) return vf;
      }
    }

    // 3) Fallback difuso: el slug de la vault está contenido en el nombre de la
    //    carpeta de H: (o viceversa), o el título del descripcion-seo casa.
    if (!fuzzy) {
      const dSlug = slugish(d);
      if (dSlug.length >= 6 && (wantSlugish.includes(dSlug) || dSlug.includes(wantSlugish))) {
        fuzzy = vf;
      } else {
        const seo = safeRead(path.join(vf, 'descripcion-seo.md'));
        const title = seo ? frontmatterAny(seo, ['video', 'title']) : null;
        if (title && wantBase.length >= 8) {
          const t = slugish(title);
          if (t.length >= 8 && (wantSlugish.includes(t) || t.includes(wantSlugish))) fuzzy = vf;
        }
      }
    }
  }

  return fuzzy;
}
