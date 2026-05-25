import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { findJob, setApproval, jobsDirFor } from '@/lib/claude-jobs';
import { normalizeAllowedPath } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/claude/jobs/[jobId]/approval?videoFolder=...
 * Body: { approval: 'approved' | 'rejected' | null }
 * Marca el job con feedback humano cosmético.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const url = new URL(req.url);
  const folderParam = url.searchParams.get('videoFolder');
  const videoFolder = normalizeAllowedPath(folderParam);
  if (!videoFolder) {
    return NextResponse.json({ ok: false, error: 'Missing or invalid videoFolder' }, { status: 400 });
  }

  let body: { approval?: 'approved' | 'rejected' | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  const value = body.approval;
  if (value !== 'approved' && value !== 'rejected' && value !== null) {
    return NextResponse.json(
      { ok: false, error: "approval debe ser 'approved' | 'rejected' | null" },
      { status: 400 },
    );
  }

  const job = findJob(videoFolder, params.jobId);
  if (!job) {
    return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 });
  }

  const jobPath = path.join(jobsDirFor(videoFolder), `${params.jobId}.json`);
  const updated = setApproval(jobPath, value);
  if (!updated) {
    return NextResponse.json({ ok: false, error: 'No se pudo actualizar el job' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, job: updated });
}
