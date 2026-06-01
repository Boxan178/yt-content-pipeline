import { NextRequest, NextResponse } from 'next/server';
import { normalizeAllowedPath } from '@/lib/config';
import { applyDecision, DecisionError } from '@/lib/decisions';

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

  try {
    const result = await applyDecision({
      folder,
      itemText: body.itemText,
      decision: body.decision,
      rationale: body.rationale,
      statusAnchor: body.statusAnchor,
    });
    return NextResponse.json({
      ok: true,
      packagingUpdated: result.packagingUpdated,
      historyPath: result.historyPath,
    });
  } catch (e) {
    if (e instanceof DecisionError && e.code === 'NO_PACKAGING') {
      return NextResponse.json({ ok: false, error: 'packaging.md no existe' }, { status: 404 });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
