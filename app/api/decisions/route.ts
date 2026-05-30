import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { normalizeAllowedPath } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DecisionRequest {
  folder: string;       // videoFolder (path absoluto)
  itemText: string;     // texto exacto del item del checklist
  decision: string;     // respuesta de Pablo
  rationale?: string;   // explicación opcional
  /**
   * Para decisiones "PENDIENTE ELECCIÓN DE PABLO" escritas como texto libre (no
   * checkbox): línea EXACTA del packaging.md a sustituir por "✅ ELEGIDO: …".
   */
  statusAnchor?: string;
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
  const folder = normalizeAllowedPath(body.folder ?? '');
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

  // Caso A — decisión "PENDIENTE ELECCIÓN DE PABLO" como texto libre: sustituimos
  // la línea de Estado por el resultado para que deje de aparecer como pendiente.
  if (body.statusAnchor?.trim()) {
    const anchor = body.statusAnchor.trim();
    const anchorEscaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const anchorRe = new RegExp(`^(\\s*)${anchorEscaped}\\s*$`, 'm');
    if (anchorRe.test(md)) {
      md = md.replace(anchorRe, (_m, indent: string) => {
        updated = true;
        return `${indent}**Estado:** ✅ ELEGIDO: ${body.decision} _(${tsHuman})_`;
      });
    }
  }

  // Caso B — checkbox markdown `- [ ] <texto>` → `- [x] …`.
  if (!updated && re.test(md)) {
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
