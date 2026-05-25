import { NextRequest, NextResponse } from 'next/server';
import { appendJobId, ensureDraftDiskPath, getDraft } from '@/lib/lab/drafts';
import { launchBootstrapJob } from '@/lib/lab/style-engine-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: { id: string };
}

/**
 * POST /api/lab/channels/[id]/bootstrap
 *
 * Lanza el job style-engine STATE 16 completo (B1-B7) sin ejecutar el script
 * python — sólo prepara propuestas de nombre, descripción, logo prompt y
 * banner prompt. Pablo elige en la UI y luego dispara /execute.
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const draft = getDraft(ctx.params.id);
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

  const folder = ensureDraftDiskPath(draft.id);

  try {
    const job = launchBootstrapJob(draft, folder);
    appendJobId(draft.id, job.jobId);
    return NextResponse.json({ ok: true, job });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
