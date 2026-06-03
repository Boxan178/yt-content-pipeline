import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { getChannel } from '@/lib/channels';
import { startJob } from '@/lib/claude-jobs';
import { buildChaptersFinal, type VideoContext } from '@/lib/prompts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RENDER_MIN_BYTES = 50 * 1024 * 1024;
const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv']);

/** ¿Tiene un MP4 principal renderizado (>50MB, no un Short)? */
function hasMainRender(folder: string): boolean {
  const renderDir = path.join(folder, 'RENDER');
  if (!existsSync(renderDir)) return false;
  for (const f of readdirSync(renderDir)) {
    if (!VIDEO_EXT.has(path.extname(f).toLowerCase())) continue;
    if (/^Short\s+\d/i.test(f)) continue;
    try {
      if (statSync(path.join(renderDir, f)).size >= RENDER_MIN_BYTES) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

/**
 * POST /api/pipeline/finalize-chapters — PASO FINAL post-render: sustituye los chapters
 * ESTIMADOS de descripcion-seo.md por timestamps REALES (Whisper sobre el MP4) y marca la
 * descripción como FINAL. SOLO actúa sobre vídeos que YA tienen render principal — si no,
 * los salta (este paso es DESPUÉS de editar y auditar).
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

    if (!existsSync(path.join(folder, '_PACKAGING', 'descripcion-seo.md'))) {
      results.push({ name, launched: false, reason: 'sin descripcion-seo.md (genera antes el borrador v1)' });
      continue;
    }
    // GUARD: este paso es POST-render. Sin MP4 principal, no hay timestamps reales que sacar.
    if (!hasMainRender(folder)) {
      results.push({ name, launched: false, reason: 'sin render principal — este paso es DESPUÉS de editar' });
      continue;
    }
    if (dryRun) {
      results.push({ name, launched: false, reason: 'dryRun' });
      continue;
    }

    const v: VideoContext = { channel: slug, title: name, state: 'production', folderPath: folder };
    try {
      const built = buildChaptersFinal(v);
      const job = startJob({
        skill: 'seo',
        label: `Chapters REALES — ${name.slice(0, 40)}`,
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
