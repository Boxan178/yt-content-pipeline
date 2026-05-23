import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DecisionRequest {
  folder: string;       // videoFolder (path absoluto)
  itemText: string;     // texto exacto del item del checklist
  decision: string;     // respuesta de Pablo
  rationale?: string;   // explicación opcional
}

function normalizeFolder(p: string): string | null {
  const norm = p.replace(/\\/g, '/').replace(/\/+$/, '');
  if (norm.startsWith('H:/YOUTUBE/') || norm.startsWith('Y:/04_DEV/J.A.R.V.I.S')) return norm;
  return null;
}

/**
 * POST /api/decisions
 * Body: { folder, itemText, decision, rationale? }
 *
 * 1) Marca el item correspondiente en _PACKAGING/packaging.md como completado
 *    cambiando `- [ ] <texto>` por `- [x] <texto>` y añadiendo una línea
 *    debajo con la decisión.
 * 2) Escribe un registro histórico en _PACKAGING/decisions/<ts>.md.
 */
export async function POST(req: NextRequest) {
  let body: DecisionRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const folder = normalizeFolder(body.folder ?? '');
  if (!folder) {
    return NextResponse.json({ ok: false, error: 'folder inválido' }, { status: 400 });
  }
  if (!body.itemText?.trim()) {
    return NextResponse.json({ ok: false, error: 'itemText vacío' }, { status: 400 });
  }
  if (!body.decision?.trim()) {
    return NextResponse.json({ ok: false, error: 'decision vacía' }, { status: 400 });
  }

  const packagingPath = path.join(folder, '_PACKAGING', 'packaging.md');
  if (!existsSync(packagingPath)) {
    return NextResponse.json({ ok: false, error: 'packaging.md no existe' }, { status: 404 });
  }

  let md = await readFile(packagingPath, 'utf-8');
  const itemEscaped = body.itemText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Buscamos la línea `- [ ] <texto exacto>` permitiendo espacios variables
  const re = new RegExp(`^(\\s*)-\\s*\\[\\s*\\]\\s+${itemEscaped}\\s*$`, 'm');
  const ts = new Date();
  const tsHuman = ts.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

  let updated = false;
  if (re.test(md)) {
    md = md.replace(re, (_match, indent: string) => {
      updated = true;
      return `${indent}- [x] ${body.itemText}\n${indent}  → DECISIÓN: ${body.decision} _(${tsHuman})_`;
    });
  }

  if (!updated) {
    // No encontrado: añadir entrada en sección "Decisiones" al final
    md = md.trimEnd() + `\n\n## Decisiones\n\n- ${body.itemText}\n  → DECISIÓN: ${body.decision} _(${tsHuman})_\n`;
  }

  await writeFile(packagingPath, md, 'utf-8');

  // Histórico en disco
  const decisionsDir = path.join(folder, '_PACKAGING', 'decisions');
  if (!existsSync(decisionsDir)) await mkdir(decisionsDir, { recursive: true });
  const filename = `${ts.toISOString().replace(/[:.]/g, '-').slice(0, 19)}.md`;
  const histPath = path.join(decisionsDir, filename);
  const hist = `# Decisión · ${tsHuman}\n\n**Item**: ${body.itemText}\n\n**Decisión**: ${body.decision}\n${body.rationale ? `\n**Razón**: ${body.rationale}\n` : ''}`;
  await writeFile(histPath, hist, 'utf-8');

  return NextResponse.json({
    ok: true,
    packagingUpdated: updated,
    historyPath: histPath.replace(/\\/g, '/'),
  });
}
