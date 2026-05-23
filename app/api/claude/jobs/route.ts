import { NextRequest, NextResponse } from 'next/server';
import { startJob, listJobsForFolder, listActiveJobsForFolder } from '@/lib/claude-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_CWD_PREFIXES = [
  'Y:/04_DEV/J.A.R.V.I.S',
  'H:/YOUTUBE',
];
const DEFAULT_CWD = 'Y:/04_DEV/J.A.R.V.I.S';
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
// Spawn es detached, el endpoint devuelve inmediatamente. Subimos el límite
// del timeoutMs propio del job para skills largas como LUIS (render 25 min +
// audit + AMELIA + MARCUS + mover = ~35-40 min en el peor caso).
const MAX_TIMEOUT_MS = 60 * 60 * 1000;

function normalizeCwd(input?: string): string {
  if (!input) return DEFAULT_CWD;
  const norm = input.replace(/\\/g, '/').replace(/\/+$/, '');
  if (ALLOWED_CWD_PREFIXES.some((p) => norm === p || norm.startsWith(p + '/'))) return norm;
  return DEFAULT_CWD;
}

function normalizeVideoFolder(input?: string): string | undefined {
  if (!input) return undefined;
  const norm = input.replace(/\\/g, '/').replace(/\/+$/, '');
  if (norm.startsWith('H:/YOUTUBE/') || norm.startsWith('Y:/04_DEV/J.A.R.V.I.S')) return norm;
  return undefined;
}

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

  const cwd = normalizeCwd(body.cwd);
  const videoFolder = normalizeVideoFolder(body.videoFolder);
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

  const videoFolder = normalizeVideoFolder(folderParam ?? undefined);
  if (!videoFolder) {
    return NextResponse.json({ error: 'Missing or invalid videoFolder' }, { status: 400 });
  }

  const jobs = onlyActive ? listActiveJobsForFolder(videoFolder) : listJobsForFolder(videoFolder);
  return NextResponse.json({ ok: true, jobs });
}
