import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getChannel } from '@/lib/channels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PENDIENTE = '**Estado:** ⏳ PENDIENTE ELECCIÓN DE PABLO';

/**
 * POST /api/pipeline/regate-miniatura — fuerza el gate de MINIATURA de uno o varios
 * vídeos cuya miniatura se auto-aprobó / reusó sin pasar por Telegram. NO regenera la
 * imagen (usa la 16:9 que ya existe): solo deja la sección "## Miniatura" en "PENDIENTE
 * ELECCIÓN DE PABLO" en packaging.md → detectAndSend manda el gate con la foto actual.
 *
 * Body: { channel?: string='moderni-stoici', only?: string[] }
 */
export async function POST(req: NextRequest) {
  let body: { channel?: string; only?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // defaults
  }
  const slug = body.channel || 'moderni-stoici';
  const only = Array.isArray(body.only) ? body.only.map((s) => s.normalize('NFC')) : null;

  const channel = getChannel(slug);
  if (!channel?.rootPath || !channel.stateFolders?.production) {
    return NextResponse.json({ ok: false, error: `Canal inválido: ${slug}` }, { status: 400 });
  }
  const base = path.join(channel.rootPath, channel.stateFolders.production);

  let names: string[];
  try {
    names = readdirSync(base);
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }

  const results: Array<{ name: string; regated: boolean; reason?: string }> = [];
  for (const name of names) {
    if (channel.ignoreFolders?.includes(name)) continue;
    const folder = path.join(base, name);
    try {
      if (!statSync(folder).isDirectory()) continue;
    } catch {
      continue;
    }
    if (only && !only.includes(name.normalize('NFC'))) continue;

    const pkgPath = path.join(folder, '_PACKAGING', 'packaging.md');
    if (!existsSync(pkgPath)) {
      results.push({ name, regated: false, reason: 'sin packaging.md' });
      continue;
    }
    // Debe existir una miniatura (la imagen 16:9 que vamos a re-gatear).
    const miniDir = path.join(folder, '_PACKAGING', 'MINIATURAS');
    const hasImg =
      existsSync(miniDir) &&
      readdirSync(miniDir).some((f) => /\.(png|jpe?g|webp)$/i.test(f));
    if (!hasImg) {
      results.push({ name, regated: false, reason: 'sin imagen de miniatura' });
      continue;
    }

    let md = readFileSync(pkgPath, 'utf-8');
    // Reemplaza la línea "**Estado:**..." DENTRO de la sección "## Miniatura" por PENDIENTE.
    const re = /(##\s*Miniatura[^\n]*\n[\s\S]*?)\*\*Estado:\*\*[^\r\n]*/i;
    if (re.test(md)) {
      md = md.replace(re, `$1${PENDIENTE}`);
    } else {
      // Sin línea Estado en la sección de miniatura → la añadimos al final de esa sección.
      const secRe = /(##\s*Miniatura[^\n]*\n[\s\S]*?)(\n##\s|\n*$)/i;
      if (!secRe.test(md)) {
        results.push({ name, regated: false, reason: 'sin sección ## Miniatura' });
        continue;
      }
      md = md.replace(secRe, `$1\n\n${PENDIENTE}\n$2`);
    }
    // Quita un .selected-thumb previo para que el gate no salga ya "elegido".
    try {
      const sel = path.join(miniDir, '.selected-thumb');
      if (existsSync(sel)) writeFileSync(sel + '.bak', readFileSync(sel)); // backup, no borrado duro
    } catch {
      // best-effort
    }
    writeFileSync(pkgPath, md, 'utf-8');
    results.push({ name, regated: true });
  }

  return NextResponse.json({ ok: true, channel: slug, regated: results.filter((r) => r.regated).length, results });
}
