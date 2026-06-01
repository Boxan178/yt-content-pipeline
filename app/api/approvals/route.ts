import { NextRequest, NextResponse } from 'next/server';
import { normalizeAllowedPath } from '@/lib/config';
import { createAndSendRequest, listApprovals } from '@/lib/approvals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/approvals — lista las solicitudes (recientes primero). */
export async function GET() {
  return NextResponse.json({ ok: true, items: listApprovals() });
}

interface CreateBody {
  videoFolder: string;
  channel?: string;
  videoTitle?: string;
  skill: string;
  label?: string;
  question?: string;
  title?: string;
  options?: string[];
  imagePath?: string;
  statusAnchor?: string;
  // Reanudación (override para flujos a medida / tests).
  resumeSkill?: string;
  resumePromptOverride?: string;
  resumeCwd?: string;
  resumeModel?: string;
  resumeTimeoutMs?: number;
}

/**
 * POST /api/approvals — crea y envía una solicitud de aprobación a Telegram.
 * Pensado para disparar un gate a mano (o desde el panel de la app) y para tests
 * de extremo a extremo. La detección automática vive en runTelegramPoll().
 */
export async function POST(req: NextRequest) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const videoFolder = normalizeAllowedPath(body.videoFolder);
  if (!videoFolder) {
    return NextResponse.json({ ok: false, error: 'videoFolder inválido o fuera de los prefijos permitidos' }, { status: 400 });
  }
  if (!body.skill?.trim()) {
    return NextResponse.json({ ok: false, error: 'skill requerida' }, { status: 400 });
  }

  const resumeCwd = body.resumeCwd ? normalizeAllowedPath(body.resumeCwd) ?? undefined : undefined;
  const imagePath = body.imagePath ? normalizeAllowedPath(body.imagePath) ?? undefined : undefined;

  try {
    const request = await createAndSendRequest({
      videoFolder,
      channel: body.channel,
      videoTitle: body.videoTitle,
      skill: body.skill,
      label: body.label,
      question: body.question ?? '¿Lo apruebas?',
      title: body.title,
      options: body.options,
      imagePath,
      statusAnchor: body.statusAnchor,
      resumeSkill: body.resumeSkill,
      resumePromptOverride: body.resumePromptOverride,
      resumeCwd,
      resumeModel: body.resumeModel,
      resumeTimeoutMs: body.resumeTimeoutMs,
    });
    return NextResponse.json({ ok: true, request });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
