import { NextRequest, NextResponse } from 'next/server';
import { removeItem, cancelItem, moveItem } from '@/lib/job-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/queue/[id]
 * Elimina un item pending de la cola. Si está running, lanza error
 * (usa /api/queue/[id]/cancel para abortarlo).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ok = removeItem(params.id);
  if (!ok) return NextResponse.json({ ok: false, error: 'No se pudo eliminar (¿está corriendo?)' }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/**
 * POST /api/queue/[id]?action=cancel
 * POST /api/queue/[id]?action=up
 * POST /api/queue/[id]?action=down
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  if (action === 'cancel') {
    const ok = cancelItem(params.id);
    if (!ok) return NextResponse.json({ ok: false, error: 'No se pudo cancelar' }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (action === 'up' || action === 'down') {
    const ok = moveItem(params.id, action);
    if (!ok) return NextResponse.json({ ok: false, error: 'No se pudo mover' }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: `Acción desconocida: ${action}` }, { status: 400 });
}
