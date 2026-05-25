import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findJob, tailLog } from '@/lib/claude-jobs';
import { parseStreamLog } from '@/lib/stream-events';
import { extractAssistantText } from '@/lib/lab/parse-engine-output';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESEARCH_JOBS_DIR = path.join(os.homedir(), '.yt-content-pipeline', 'lab', 'research');

interface Ctx {
  params: { jobId: string };
}

/**
 * GET /api/lab/research/jobs/[jobId]
 *
 * Status + tail + parsed RESEARCH_JSON. Reusa la regex de los bloques
 * VALIDATION_JSON / RESEARCH_JSON.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const job = findJob(RESEARCH_JOBS_DIR, ctx.params.jobId);
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

  const parsed = parseResearchJson(assistantText);
  const durationMs =
    new Date(job.finishedAt ?? new Date().toISOString()).getTime() -
    new Date(job.startedAt).getTime();

  return NextResponse.json({ ok: true, job, tail, events, assistantText, parsed, durationMs });
}

function parseResearchJson(text: string): unknown {
  const m = text.match(/RESEARCH_JSON\s*\n[─\-_]{20,}\n([\s\S]+?)\n[─\-_]{20,}/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}
