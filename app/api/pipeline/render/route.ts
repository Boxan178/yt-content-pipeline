import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getChannel } from '@/lib/channels';
import { startJob, listActiveJobsForFolder } from '@/lib/claude-jobs';
import { buildLuisRender, type VideoContext } from '@/lib/prompts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RENDER_MIN_BYTES = 50 * 1024 * 1024;
const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv']);

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
 * POST /api/pipeline/render — lanza LUIS (render + auto-audit + AMELIA + MARCUS) sobre los
 * vídeos de producción que aún no tienen render, RESPETANDO un tope de concurrencia para no
 * petar la máquina. Idempotente: si ya hay `maxConcurrent` renders activos, no lanza más;
 * vuelve a llamarlo (cada tick del vigía) para "rellenar" huecos según vayan acabando.
 *
 * Body: { channel?: string='moderni-stoici', maxConcurrent?: number=2, only?: string[] }
 */
export async function POST(req: NextRequest) {
  let body: { channel?: string; maxConcurrent?: number; only?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // defaults
  }
  const slug = body.channel || 'moderni-stoici';
  const maxConcurrent = Math.max(1, Math.min(6, body.maxConcurrent ?? 2));
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

  const active: string[] = [];
  const rendered: string[] = [];
  const pending: Array<{ name: string; folder: string }> = [];

  for (const name of names) {
    if (channel.ignoreFolders?.includes(name)) continue;
    const folder = path.join(base, name);
    try {
      if (!statSync(folder).isDirectory()) continue;
    } catch {
      continue;
    }
    if (only && !only.includes(name.normalize('NFC'))) continue;
    if (!existsSync(path.join(folder, '_PACKAGING', 'packaging.md'))) continue;

    // Un render en curso es DETACHED (render_project.py) — el job LUIS ya salió tras lanzarlo,
    // así que listActiveJobsForFolder no lo ve. Marcamos `.render-launched` al lanzar para
    // detectarlo (si no, el endpoint lo vería "pendiente" y relanzaría un DUPLICADO). El marcador
    // caduca a 45 min → auto-retry si el render murió sin producir MP4.
    const marker = path.join(folder, '.render-launched');
    const markerFresh = existsSync(marker) && Date.now() - statSync(marker).mtimeMs < 45 * 60 * 1000;
    if (hasMainRender(folder)) {
      rendered.push(name);
    } else if (markerFresh || listActiveJobsForFolder(folder.replace(/\\/g, '/')).length > 0) {
      active.push(name);
    } else {
      pending.push({ name, folder });
    }
  }

  const started: Array<{ name: string; jobId: string }> = [];
  let slots = maxConcurrent - active.length;
  for (const { name, folder } of pending) {
    if (slots <= 0) break;
    const v: VideoContext = { channel: slug, title: name, state: 'production', folderPath: folder };
    try {
      const built = buildLuisRender(v);
      // OVERRIDE PRUEBA 3 — LUIS solo LANZA el render (no monitoriza). En claude -p LUIS no
      // puede monitorizar (ScheduleWakeup es no-op → el loop le re-invoca → renders DUPLICADOS).
      // render_project.py se auto-completa y mueve el MP4 a RENDER/ él mismo; el orquestador
      // (Claude) monitoriza, audita, pone chapters y programa DESPUÉS.
      const launchOnlyOverride =
        `\n\n⚠️ OVERRIDE PRUEBA 3 — SOLO LANZAR EL RENDER, NADA MÁS:\n` +
        `1. STATE 1: verifica inputs (guion, locución, brutos, música).\n` +
        `2. DEDUP-GUARD: si YA hay un render en curso para este slug (un log reciente en ` +
        `Y:/04_DEV/J.A.R.V.I.S/lab/auto-edit/out/_logs/ para este slug SIN "OK en"/"RENDER FAILED", o un proceso ` +
        `render_project.py con este --slug), NO lances otro: di "ya en curso" y termina con <<<DONE>>>.\n` +
        `3. Si no hay ninguno, lanza render_project.py en BACKGROUND (venv C:/.venvs/auto-edit, tu método NORMAL — ` +
        `NUNCA el MCP de Premiere) con los args correctos (--slug, --project-folder, --script, --channel).\n` +
        `4. Reporta el PATH del log del render y TERMINA INMEDIATAMENTE con <<<DONE>>>.\n` +
        `PROHIBIDO: monitorizar el render, hacer la auditoría (watch/AMELIA/MARCUS), mover la carpeta, usar ` +
        `ScheduleWakeup, invocar assign-task. El orquestador (Claude) hace todo eso DESPUÉS. Tu único trabajo: ` +
        `verificar inputs + lanzar el render + reportar el log + <<<DONE>>>.`;
      const job = startJob({
        skill: 'luis',
        label: `LUIS lanza render — ${name.slice(0, 40)}`,
        prompt: built.prompt + launchOnlyOverride,
        cwd: built.cwd,
        timeoutMs: built.timeoutMs,
        videoFolder: folder.replace(/\\/g, '/'),
        model: built.model,
      });
      try { writeFileSync(path.join(folder, '.render-launched'), new Date().toISOString()); } catch { /* best-effort */ }
      started.push({ name, jobId: job.jobId });
      slots--;
    } catch {
      // si uno falla, seguimos con los demás
    }
  }

  return NextResponse.json({
    ok: true,
    channel: slug,
    maxConcurrent,
    counts: { rendered: rendered.length, active: active.length + started.length, pendingRemaining: pending.length - started.length },
    started,
    activeBefore: active,
    rendered,
  });
}
