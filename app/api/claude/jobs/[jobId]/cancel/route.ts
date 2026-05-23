import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { cancelJob, jobsDirFor, findJob } from '@/lib/claude-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeVideoFolder(input?: string): string | undefined {
  if (!input) return undefined;
  const norm = input.replace(/\\/g, '/').replace(/\/+$/, '');
  if (norm.startsWith('H:/YOUTUBE/') || norm.startsWith('Y:/04_DEV/J.A.R.V.I.S')) return norm;
  return undefined;
}

/**
 * POST /api/claude/jobs/[jobId]/cancel?videoFolder=...
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const url = new URL(req.url);
  const folderParam = url.searchParams.get('videoFolder');
  const videoFolder = normalizeVideoFolder(folderParam ?? undefined);
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
