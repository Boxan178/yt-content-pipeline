import { NextRequest, NextResponse } from 'next/server';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { getChannel } from '@/lib/channels';
import { startJob } from '@/lib/claude-jobs';
import { buildMarcosRetitle, type VideoContext } from '@/lib/prompts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/pipeline/retitle — regenera los títulos de uno o varios vídeos con la
 * skill MARCOS ACTUALIZADA (job directo por vídeo, no pasa por la cola pre-edit).
 * Cada job sobrescribe la sección de título del packaging.md y la deja "PENDIENTE
 * ELECCIÓN DE PABLO" → dispara un gate de título nuevo en Telegram.
 *
 * Body: { channel?: string='moderni-stoici', only?: string[], dryRun?: boolean }
 *   - only: nombres EXACTOS de carpeta. Si se omite, retitula TODOS los vídeos en
 *           producción que ya tengan packaging.md (los que ya tienen un título).
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

  const { readdirSync } = await import('node:fs');
  let names: string[];
  try {
    names = readdirSync(base);
  } catch (e) {
    return NextResponse.json({ ok: false, error: `No se pudo leer ${base}: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }

  const results: Array<{ name: string; launched: boolean; jobId?: string; reason?: string }> = [];

  for (const name of names) {
    if (channel.ignoreFolders?.includes(name)) continue;
    const folder = path.join(base, name);
    let isDir = false;
    try {
      isDir = statSync(folder).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) continue;
    if (only && !only.includes(name.normalize('NFC'))) continue;

    // Solo vídeos que ya tengan packaging.md (= ya tienen un título que regenerar).
    const hasPackaging = existsSync(path.join(folder, '_PACKAGING', 'packaging.md'));
    if (!hasPackaging) {
      results.push({ name, launched: false, reason: 'sin packaging.md (usará el MARCOS nuevo cuando SARA lo titule)' });
      continue;
    }

    if (dryRun) {
      results.push({ name, launched: false, reason: 'dryRun' });
      continue;
    }

    const folderFwd = folder.replace(/\\/g, '/');
    const v: VideoContext = { channel: slug, title: name, state: 'production', folderPath: folder };
    try {
      const built = buildMarcosRetitle(v);
      const job = startJob({
        skill: 'marcos',
        label: `MARCOS re-título — ${name.slice(0, 40)}`,
        prompt: built.prompt,
        cwd: built.cwd,
        timeoutMs: built.timeoutMs,
        videoFolder: folderFwd,
        model: built.model,
      });
      results.push({ name, launched: true, jobId: job.jobId });
    } catch (e) {
      results.push({ name, launched: false, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    ok: true,
    channel: slug,
    dryRun,
    launched: results.filter((r) => r.launched).length,
    results,
  });
}
