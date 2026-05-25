import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { findJob, tailLog } from '@/lib/claude-jobs';
import { parseStreamLog } from '@/lib/stream-events';
import { ensureDraftDiskPath, getDraft } from '@/lib/lab/drafts';
import { extractAssistantText, parseAnalysisJob, parseVisualsJob } from '@/lib/lab/parse-engine-output';
import { parseValidationResult } from '@/lib/lab/niche-validator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: { id: string; jobId: string };
}

/**
 * GET /api/lab/channels/[id]/jobs/[jobId]
 *
 * Endpoint dedicado del lab. Resuelve el draftFolder internamente (no acepta
 * paths del cliente) y devuelve estado + tail + eventos del job, más los
 * bloques style-engine ya parseados.
 *
 * Query param `parse=analyze|visuals|none` controla qué parser ejecutar
 * sobre el texto del assistant. Default `none`.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const draft = getDraft(ctx.params.id);
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

  const folder = ensureDraftDiskPath(draft.id);
  const job = findJob(folder, ctx.params.jobId);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const tail = tailLog(job.logPath, 300);

  let events: ReturnType<typeof parseStreamLog> = [];
  let assistantText = '';
  try {
    const raw = readFileSync(job.logPath, 'utf-8');
    events = parseStreamLog(raw);
    assistantText = extractAssistantText(raw);
  } catch {
    events = [];
  }

  const parseMode = new URL(req.url).searchParams.get('parse') ?? 'none';
  let parsed: unknown = undefined;
  if (parseMode === 'analyze') parsed = parseAnalysisJob(assistantText);
  else if (parseMode === 'visuals') parsed = parseVisualsJob(assistantText);
  else if (parseMode === 'validate') parsed = parseValidationResult(assistantText);

  const durationMs =
    new Date(job.finishedAt ?? new Date().toISOString()).getTime() -
    new Date(job.startedAt).getTime();

  return NextResponse.json({
    ok: true,
    job,
    tail,
    events,
    assistantText,
    parsed,
    durationMs,
  });
}
