import { NextRequest, NextResponse } from 'next/server';
import { appendJobId, ensureDraftDiskPath, getDraft } from '@/lib/lab/drafts';
import { launchValidationJob } from '@/lib/lab/niche-validator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: { id: string };
}

/**
 * POST /api/lab/channels/[id]/validate
 *
 * Lanza job MARIO+Algrow para validar el nicho. Cliente polleia
 * /api/lab/channels/[id]/jobs/[jobId]?parse=validate (no implementado todavía
 * — Step 4 polleia el endpoint genérico y parsea client-side el JSON).
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const draft = getDraft(ctx.params.id);
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

  const folder = ensureDraftDiskPath(draft.id);

  try {
    const job = launchValidationJob(draft, folder);
    appendJobId(draft.id, job.jobId);
    return NextResponse.json({ ok: true, job });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
