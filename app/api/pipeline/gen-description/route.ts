import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { getChannel } from '@/lib/channels';
import { startJob } from '@/lib/claude-jobs';
import { buildSeoDescriptionDraft, type VideoContext } from '@/lib/prompts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/pipeline/gen-description — genera la descripción SEO BORRADOR v1
 * (+ chapters ESTIMADOS → _PACKAGING/descripcion-seo.md) para uno o varios vídeos
 * que se hicieron antes de que existiera la Fase 3a. Job directo con youtube-seo-optimizer.
 * Los timestamps REALES se hacen DESPUÉS del render (paso final).
 *
 * Body: { channel?: string='moderni-stoici', only?: string[], dryRun?: boolean }
 */
export async function POST(req: NextRequest) {
  let body: { channel?: string; only?: string[]; dryRun?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // defaults
  }
  const slug = body.channel || 'moderni-stoici';
  const dryRun = body.dryRun === true;
  const only = Array.isArray(body.only) ? body.only.map((s) => s.normalize('NFC')) : null;

  const channel = getChannel(slug);
  if (!channel || !channel.enabled || !channel.rootPath) {
    return NextResponse.json({ ok: false, error: `Canal inválido: ${slug}` }, { status: 400 });
  }
  const prodFolder = channel.stateFolders?.production;
  if (!prodFolder) {
    return NextResponse.json({ ok: false, error: `Canal ${slug} sin carpeta de producción` }, { status: 400 });
  }
  const base = path.join(channel.rootPath, prodFolder);

  let names: string[];
  try {
    names = readdirSync(base);
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }

  const results: Array<{ name: string; launched: boolean; jobId?: string; reason?: string }> = [];
  for (const name of names) {
    if (channel.ignoreFolders?.includes(name)) continue;
    const folder = path.join(base, name);
    try {
      if (!statSync(folder).isDirectory()) continue;
    } catch {
      continue;
    }
    if (only && !only.includes(name.normalize('NFC'))) continue;

    // Solo vídeos con packaging.md (hace falta el título/ángulo para la descripción).
    if (!existsSync(path.join(folder, '_PACKAGING', 'packaging.md'))) {
      results.push({ name, launched: false, reason: 'sin packaging.md' });
      continue;
    }
    if (dryRun) {
      results.push({ name, launched: false, reason: 'dryRun' });
      continue;
    }

    const v: VideoContext = { channel: slug, title: name, state: 'production', folderPath: folder };
    try {
      const built = buildSeoDescriptionDraft(v);
      const job = startJob({
        skill: 'seo',
        label: `SEO descripción v1 — ${name.slice(0, 38)}`,
        prompt: built.prompt,
        cwd: built.cwd,
        timeoutMs: built.timeoutMs,
        videoFolder: folder.replace(/\\/g, '/'),
        model: built.model,
      });
      results.push({ name, launched: true, jobId: job.jobId });
    } catch (e) {
      results.push({ name, launched: false, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ ok: true, channel: slug, launched: results.filter((r) => r.launched).length, results });
}
