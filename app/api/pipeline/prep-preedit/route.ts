import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getChannel } from '@/lib/channels';
import { enqueuePreEditResume } from '@/lib/job-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/pipeline/prep-preedit — Fase 1 de la "prueba de lava" (2026-06-02).
 *
 * Para cada vídeo en `_EN PRODUCCIÓN` del canal: escribe el marcador `.pre-edit-only`
 * (las reanudaciones por Telegram lo respetan y NO renderizan) y encola un SARA en modo
 * pre-edit (loop hasta "listo para editar": packaging + guion + locución + miniatura, sin
 * render). La cola los procesa de uno en uno. El render lo dispara Pablo después, vídeo a
 * vídeo, tras dar luz verde.
 *
 * Body: { channel?: string='moderni-stoici', only?: string[], dryRun?: boolean }
 *   - only: nombres EXACTOS de carpeta a incluir (para empezar por 1 y validar).
 *   - dryRun: solo lista lo que haría, sin escribir marcador ni encolar.
 */
export async function POST(req: NextRequest) {
  let body: { channel?: string; only?: string[]; dryRun?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // body vacío → defaults
  }
  const slug = body.channel || 'moderni-stoici';
  const dryRun = body.dryRun === true;
  const only = Array.isArray(body.only) ? body.only.map((s) => s.normalize('NFC')) : null;

  const channel = getChannel(slug);
  if (!channel || !channel.enabled || !channel.rootPath) {
    return NextResponse.json({ ok: false, error: `Canal inválido o sin rootPath: ${slug}` }, { status: 400 });
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
    return NextResponse.json(
      { ok: false, error: `No se pudo leer ${base}: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  const candidates: Array<{ name: string; enqueued: boolean; markerWritten: boolean; reason?: string }> = [];
  let enqueuedCount = 0;

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
    if (only && !only.includes(name.normalize('NFC'))) {
      candidates.push({ name, enqueued: false, markerWritten: false, reason: 'fuera del filtro only' });
      continue;
    }

    if (dryRun) {
      candidates.push({ name, enqueued: false, markerWritten: false, reason: 'dryRun' });
      continue;
    }

    // 1) Marcador .pre-edit-only (lo respeta approvals.ts para no renderizar al reanudar).
    let markerWritten = false;
    try {
      writeFileSync(
        path.join(folder, '.pre-edit-only'),
        `Fase 1 prueba de lava — SARA para antes de editar. Creado ${new Date().toISOString()}.\n`,
        'utf-8',
      );
      markerWritten = true;
    } catch (e) {
      candidates.push({
        name,
        enqueued: false,
        markerWritten: false,
        reason: `no se pudo escribir marcador: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }

    // 2) Encolar SARA pre-edit (idempotente: no duplica si ya hay item activo).
    const folderFwd = folder.replace(/\\/g, '/');
    const item = enqueuePreEditResume(folderFwd);
    if (item) enqueuedCount++;
    candidates.push({
      name,
      enqueued: !!item,
      markerWritten,
      reason: item ? undefined : 'ya había un item pending/running para esta carpeta',
    });
  }

  return NextResponse.json({
    ok: true,
    channel: slug,
    base,
    dryRun,
    enqueuedCount,
    total: candidates.length,
    candidates,
  });
}
