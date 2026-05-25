import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { findJob, tailLog } from '@/lib/claude-jobs';
import { parseStreamLog } from '@/lib/stream-events';
import { normalizeAllowedPath } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/claude/jobs/[jobId]?videoFolder=...
 * Devuelve estado del job + tail del log.
 */
export async function GET(
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
  const tail = tailLog(job.logPath, 300);
  // Para los eventos parseamos el log entero (no solo el tail) — son JSON por
  // línea, no es excesivo. Si llega a serlo, paginar más adelante.
  let events: ReturnType<typeof parseStreamLog> = [];
  try {
    const fullLog = readFileSync(job.logPath, 'utf-8');
    events = parseStreamLog(fullLog);
  } catch {
    events = [];
  }
  const durationMs =
    new Date(job.finishedAt ?? new Date().toISOString()).getTime() -
    new Date(job.startedAt).getTime();
  return NextResponse.json({ ok: true, job, tail, events, durationMs });
}
