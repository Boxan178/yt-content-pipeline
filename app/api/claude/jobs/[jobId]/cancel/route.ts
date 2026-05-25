import { NextRequest, NextResponse } from 'next/server';
import { cancelJob, findJob } from '@/lib/claude-jobs';
import { normalizeAllowedPath } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/claude/jobs/[jobId]/cancel?videoFolder=...
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const url = new URL(req.url);
  const folderParam = url.searchParams.get('videoFolder');
  const videoFolder = normalizeAllowedPath(folderParam);
  if (!videoFolder) {
    return NextResponse.json({ error: 'Missing or invalid videoFolder' }, { status: 400 });
  }
  const job = findJob(videoFolder, params.jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  const result = cancelJob(job.jobPath);
  return NextResponse.json({ ok: true, job: result });
}
