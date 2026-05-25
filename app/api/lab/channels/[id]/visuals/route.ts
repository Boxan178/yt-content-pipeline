import { NextRequest, NextResponse } from 'next/server';
import { appendJobId, ensureDraftDiskPath, getDraft } from '@/lib/lab/drafts';
import { launchVisualsJob } from '@/lib/lab/style-engine-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: { id: string };
}

/**
 * POST /api/lab/channels/[id]/visuals
 *
 * Lanza el job style-engine STATES 7-9 + 11-13 (visual + thumbnails). El draft
 * DEBE tener `sampleFrameUrls` y `thumbnailSampleUrls` con paths absolutos
 * válidos (claude los lee con su Read tool).
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const draft = getDraft(ctx.params.id);
  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }
  if (draft.sampleFrameUrls.length === 0) {
    return NextResponse.json(
      { error: 'Missing sample frames — sube 3-5 frames del vídeo antes.' },
      { status: 400 },
    );
  }
  if (draft.thumbnailSampleUrls.length === 0) {
    return NextResponse.json(
      { error: 'Missing thumbnail samples — sube 2-3 thumbnails del canal.' },
      { status: 400 },
    );
  }

  const folder = ensureDraftDiskPath(draft.id);

  try {
    const job = launchVisualsJob(draft, folder);
    appendJobId(draft.id, job.jobId);
    return NextResponse.json({ ok: true, job });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
