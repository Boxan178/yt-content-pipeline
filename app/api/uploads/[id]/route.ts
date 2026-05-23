import { NextRequest, NextResponse } from 'next/server';
import { cancelUpload, removeUpload } from '@/lib/upload-schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/uploads/[id]?action=cancel
 * action=cancel → cancela un pending o uploading
 * sin action → elimina del listado (solo si no está uploading)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const action = new URL(req.url).searchParams.get('action');
  if (action === 'cancel') {
    const ok = cancelUpload(params.id);
    if (!ok) return NextResponse.json({ ok: false, error: 'No se pudo cancelar' }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  const ok = removeUpload(params.id);
  if (!ok) return NextResponse.json({ ok: false, error: 'No se pudo eliminar (¿está subiendo?)' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
