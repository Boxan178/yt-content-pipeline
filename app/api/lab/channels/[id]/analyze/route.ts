import { NextRequest, NextResponse } from 'next/server';
import { appendJobId, ensureDraftDiskPath, getDraft } from '@/lib/lab/drafts';
import { launchAnalysisJob } from '@/lib/lab/style-engine-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: { id: string };
}

/**
 * POST /api/lab/channels/[id]/analyze
 *
 * Lanza el job style-engine STATES 1-6 (análisis + Style DNA + script) sobre el
 * draft indicado. El draft DEBE tener `referenceChannelUrl`, `transcripts` y
 * `initialTopic` poblados.
 *
 * El job se persiste en `<draftFolder>/.claude-jobs/<jobId>.json`. Cliente
 * polleia `/api/claude/jobs/<jobId>` para estado.
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const draft = getDraft(ctx.params.id);
  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }
  if ((draft.transcripts ?? []).filter((t) => t.trim().length > 0).length === 0) {
    return NextResponse.json(
      { error: 'Missing transcripts — el draft necesita 2-3 transcripts antes del análisis.' },
      { status: 400 },
    );
  }

  const folder = ensureDraftDiskPath(draft.id);

  try {
    const job = launchAnalysisJob(draft, folder);
    appendJobId(draft.id, job.jobId);
    return NextResponse.json({ ok: true, job });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
