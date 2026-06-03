import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { getChannel } from '@/lib/channels';
import { regenerateMiniatura } from '@/lib/miniatura-regen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/pipeline/regen-miniatura — regenera la miniatura de uno o varios vídeos con
 * un concepto DISTINTO. Aparta la(s) actual(es) a _PACKAGING/_miniaturas-descartadas/,
 * limpia .selected-thumb y lanza NORA+IRIS con instrucción de "algo nuevo/diferente".
 *
 * Lógica compartida con el rechazo de miniatura por Telegram (lib/miniatura-regen.ts).
 *
 * Body: { channel?: string='moderni-stoici', only: string[], reason?: 'reuse'|'rejected', notes?: string }
 */
export async function POST(req: NextRequest) {
  let body: { channel?: string; only?: string[]; reason?: 'reuse' | 'rejected'; notes?: string } = {};
  try {
    body = await req.json();
  } catch {
    // defaults
  }
  const slug = body.channel || 'moderni-stoici';
  const reason = body.reason === 'rejected' ? 'rejected' : 'reuse';
  const only = Array.isArray(body.only) ? body.only.map((s) => s.normalize('NFC')) : null;
  if (!only || only.length === 0) {
    return NextResponse.json({ ok: false, error: 'Falta `only` (lista de carpetas a regenerar)' }, { status: 400 });
  }

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

  const results: Array<{ name: string; launched: boolean; moved?: number; jobId?: string; reason?: string }> = [];
  for (const name of names) {
    if (channel.ignoreFolders?.includes(name)) continue;
    const folder = path.join(base, name);
    try {
      if (!statSync(folder).isDirectory()) continue;
    } catch {
      continue;
    }
    if (!only.includes(name.normalize('NFC'))) continue;

    const res = regenerateMiniatura(folder, { channel: slug, reason, notes: body.notes });
    results.push({
      name,
      launched: res.ok,
      moved: res.moved,
      jobId: res.jobId,
      reason: res.ok ? undefined : res.error,
    });
  }

  return NextResponse.json({ ok: true, channel: slug, reason, launched: results.filter((r) => r.launched).length, results });
}
