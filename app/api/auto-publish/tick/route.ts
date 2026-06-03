import { NextResponse } from 'next/server';
import { runAutoPublishTick } from '@/lib/auto-publish';
import { tickScheduler } from '@/lib/upload-schedule';
import { tickAutoRender } from '@/lib/auto-render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auto-publish/tick
 *
 * 1. Detecta vídeos completos+idle de canales con autoPublishUnlisted y los
 *    encola para subir a YouTube como `unlisted`.
 * 2. Avanza la cola de subidas (lanza upload.py para los que toquen, cierra los
 *    terminados, dispara el aviso a Telegram).
 *
 * Idempotente. Lo invoca el poller en background de Electron cada 60s.
 */
export async function POST() {
  try {
    const enqueued = await runAutoPublishTick();
    const state = await tickScheduler();
    // Auto-render: si el modo está en 'auto' y no hay render corriendo, arranca
    // el siguiente (uno a uno). Aislado: un fallo aquí NO rompe la auto-subida.
    let autoRenderStarted: string | null = null;
    try {
      autoRenderStarted = (await tickAutoRender()).started?.title ?? null;
    } catch {
      // ignorado
    }
    const active = state.items.filter(
      (i) => i.status === 'pending' || i.status === 'uploading',
    ).length;
    return NextResponse.json({ ok: true, enqueued, active, autoRenderStarted });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
