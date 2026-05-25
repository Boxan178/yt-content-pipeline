import { NextRequest, NextResponse } from 'next/server';
import { startJob, listJobsForFolder, listActiveJobsForFolder } from '@/lib/claude-jobs';
import { JARVIS_ROOT, normalizeAllowedPath } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
// Spawn es detached, el endpoint devuelve inmediatamente. Subimos el límite
// del timeoutMs propio del job para skills largas como LUIS (render 25 min +
// audit + AMELIA + MARCUS + mover = ~35-40 min en el peor caso).
const MAX_TIMEOUT_MS = 60 * 60 * 1000;

interface StartBody {
  skill: string;
  label?: string;
  prompt: string;
  cwd?: string;
  videoFolder?: string;
  timeoutMs?: number;
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'max';
}

/**
 * POST /api/claude/jobs
 * Body: { skill, label?, prompt, cwd?, videoFolder?, timeoutMs? }
 * Spawns claude -p detached, devuelve el job inmediatamente sin esperar a que termine.
 */
export async function POST(req: NextRequest) {
  let body: StartBody;
  try {
    body = (await req.json()) as StartBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.prompt || typeof body.prompt !== 'string') {
    return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
  }
  if (!body.skill || typeof body.skill !== 'string') {
    return NextResponse.json({ error: 'Missing skill' }, { status: 400 });
  }

  const cwd = normalizeAllowedPath(body.cwd) ?? JARVIS_ROOT;
  const videoFolder = normalizeAllowedPath(body.videoFolder) ?? undefined;
  const requested = typeof body.timeoutMs === 'number' && body.timeoutMs > 0
    ? body.timeoutMs : DEFAULT_TIMEOUT_MS;
  const timeoutMs = Math.min(requested, MAX_TIMEOUT_MS);

  try {
    const job = startJob({
      skill: body.skill,
      label: body.label ?? body.skill,
      prompt: body.prompt,
      cwd,
      videoFolder,
      timeoutMs,
      model: body.model,
      effort: body.effort,
    });
    return NextResponse.json({ ok: true, job });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/**
 * GET /api/claude/jobs?videoFolder=...&onlyActive=1
 * Lista jobs (todos o solo activos) de un videoFolder.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const folderParam = url.searchParams.get('videoFolder');
  const onlyActive = url.searchParams.get('onlyActive') === '1';

  const videoFolder = normalizeAllowedPath(folderParam);
  if (!videoFolder) {
    return NextResponse.json({ error: 'Missing or invalid videoFolder' }, { status: 400 });
  }

  const jobs = onlyActive ? listActiveJobsForFolder(videoFolder) : listJobsForFolder(videoFolder);
  return NextResponse.json({ ok: true, jobs });
}
