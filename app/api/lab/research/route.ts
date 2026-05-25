import { NextRequest, NextResponse } from 'next/server';
import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createResearch, listResearch } from '@/lib/lab/research';
import { startJob } from '@/lib/claude-jobs';
import { JARVIS_ROOT } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESEARCH_JOBS_DIR = path.join(os.homedir(), '.yt-content-pipeline', 'lab', 'research');

interface ResearchPostBody {
  mode: 'quick' | 'deep';
  niche: string;
  language?: string;
  channelDraftId?: string | null;
}

export async function GET() {
  return NextResponse.json({ ok: true, researches: listResearch() });
}

/**
 * POST /api/lab/research
 *
 * Lanza un job MARIO + Algrow MCP para investigar un nicho. Modo:
 *   - 'quick': cliente polleia, NO se persiste cuando termina.
 *   - 'deep' : cliente polleia, al terminar el cliente envía PUT para guardar
 *              en research.json. (Persistencia client-side mantiene simple
 *              el endpoint.)
 *
 * Devuelve `{ job }` con el jobId — cliente polleia con
 *   GET /api/lab/research/jobs/[jobId]
 */
export async function POST(req: NextRequest) {
  let body: ResearchPostBody;
  try {
    body = (await req.json()) as ResearchPostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.niche?.trim()) {
    return NextResponse.json({ error: 'niche es obligatorio' }, { status: 400 });
  }
  if (body.mode !== 'quick' && body.mode !== 'deep') {
    return NextResponse.json({ error: 'mode debe ser quick o deep' }, { status: 400 });
  }

  if (!existsSync(RESEARCH_JOBS_DIR)) {
    mkdirSync(RESEARCH_JOBS_DIR, { recursive: true });
  }

  const language = (body.language ?? 'en').toString().slice(0, 4);
  const isDeep = body.mode === 'deep';

  const prompt = `MARIO, investiga el nicho "${body.niche.trim()}" para validar si merece la pena producir contenido nuevo en él${isDeep ? ' (modo PROFUNDO)' : ' (modo RÁPIDO — informe corto)'}.

Usa las herramientas Algrow MCP (mcp__algrow__*) en este orden:
1. search_viral_videos(niche="${body.niche.trim()}", daysBack=90, minVPH=3) → outliers (max ${isDeep ? 30 : 10}).
2. search_longform_channels(niche="${body.niche.trim()}", language=${language}) → competencia (max ${isDeep ? 30 : 10}).
3. keyword_research(${body.niche.trim()}) → volúmenes y competencia.
${isDeep ? '4. breakout_channels(niche, language) → canales que están explotando.' : ''}

VEREDICTO:
- 🟢 green: demand > 70, saturation < 60, ≥1 wedge defendible.
- 🟡 yellow: intermedio.
- 🔴 red: demand < 40 o saturation > 85 sin wedge claro.

ENTREGA FINAL (obligatorio): bloque con header RESEARCH_JSON seguido del JSON:

RESEARCH_JSON
─────────────────────────────────────────
{
  "verdict": "green" | "yellow" | "red",
  "summary": "2-3 párrafos para el dashboard.",
  "outliers": [{"title":"","channel":"","views":0,"vph":0,"url":""}],
  "breakoutChannels": [{"name":"","url":"","growthRate":0,"reason":""}],
  "keywordResearch": [{"keyword":"","volume":0,"competition":0,"trend":"up|flat|down"}],
  "rawReport": "Informe markdown completo."
}
─────────────────────────────────────────

Cuando termines, escribe la línea exacta:
<<<DONE>>>`;

  try {
    const job = startJob({
      skill: 'mario',
      label: `MARIO — research ${body.mode}: ${body.niche.trim().slice(0, 30)}`,
      prompt,
      cwd: JARVIS_ROOT,
      timeoutMs: isDeep ? 20 * 60 * 1000 : 8 * 60 * 1000,
      videoFolder: RESEARCH_JOBS_DIR,
      model: 'sonnet',
    });
    return NextResponse.json({ ok: true, job, mode: body.mode, niche: body.niche.trim(), language });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/lab/research?action=save
 *
 * Body: { mode, niche, keywords, channelDraftId, summary, outliers,
 *         breakoutChannels, keywordResearch, verdict, rawReport }
 *
 * Persiste el resultado de un research deep tras parsearlo client-side.
 */
export async function PUT(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  try {
    const research = createResearch({
      mode: (body.mode as 'quick' | 'deep') ?? 'deep',
      niche: String(body.niche ?? ''),
      keywords: Array.isArray(body.keywords) ? (body.keywords as string[]) : [],
      channelDraftId: (body.channelDraftId as string | null) ?? null,
      summary: String(body.summary ?? ''),
      outliers: Array.isArray(body.outliers) ? (body.outliers as never) : [],
      breakoutChannels: Array.isArray(body.breakoutChannels) ? (body.breakoutChannels as never) : [],
      keywordResearch: Array.isArray(body.keywordResearch) ? (body.keywordResearch as never) : [],
      verdict: (body.verdict as 'green' | 'yellow' | 'red') ?? 'yellow',
      rawReport: String(body.rawReport ?? ''),
    });
    return NextResponse.json({ ok: true, research });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
