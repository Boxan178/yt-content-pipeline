import { NextRequest, NextResponse } from 'next/server';
import { getDraft, updateDraft } from '@/lib/lab/drafts';
import { executeBootstrap, preflightCheck } from '@/lib/lab/bootstrap-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: { id: string };
}

interface Body {
  chosenName: string;
  chosenHandle: string;
  chosenDescription: string;
  descriptionVersion: 'A' | 'B' | 'C';
  logoPrompt: string;
  bannerPrompt: string;
  assetGenerationMethod: 'canva-mcp' | 'nano-banana-manual' | 'both';
}

/**
 * POST /api/lab/channels/[id]/bootstrap/execute
 *
 * Ejecuta bootstrap_channel.py con las decisiones de Pablo. Devuelve el
 * resultado del script + path en disco. Actualiza draft.bootstrap y
 * draft.status='bootstrapped'.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const draft = getDraft(ctx.params.id);
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.chosenName?.trim() || !body.chosenHandle?.trim() || !body.chosenDescription?.trim()) {
    return NextResponse.json(
      { error: 'chosenName, chosenHandle y chosenDescription son obligatorios.' },
      { status: 400 },
    );
  }
  if (!body.logoPrompt?.trim() || !body.bannerPrompt?.trim()) {
    return NextResponse.json(
      { error: 'logoPrompt y bannerPrompt son obligatorios.' },
      { status: 400 },
    );
  }

  const pre = preflightCheck();
  if (!pre.ok) {
    return NextResponse.json(
      {
        error: `Pre-flight check falló. Faltan: ${pre.missing.join(', ')}. Asegúrate de que el venv de youtube-seo-optimizer está creado y que la skill style-engine existe en Y:/.`,
      },
      { status: 500 },
    );
  }

  const result = executeBootstrap({
    draft,
    chosenName: body.chosenName.trim(),
    chosenHandle: body.chosenHandle.trim(),
    chosenDescription: body.chosenDescription.trim(),
    logoPrompt: body.logoPrompt.trim(),
    bannerPrompt: body.bannerPrompt.trim(),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? 'bootstrap_channel.py falló', result },
      { status: 500 },
    );
  }

  const updated = updateDraft(draft.id, {
    status: 'bootstrapped',
    currentStep: 5,
    bootstrap: {
      chosenName: body.chosenName.trim(),
      chosenHandle: body.chosenHandle.trim(),
      chosenDescription: body.chosenDescription.trim(),
      descriptionVersion: body.descriptionVersion,
      logoPrompt: body.logoPrompt.trim(),
      bannerPrompt: body.bannerPrompt.trim(),
      assetGenerationMethod: body.assetGenerationMethod,
      diskPath: result.diskPath,
      bootstrappedAt: new Date().toISOString(),
    },
  });

  return NextResponse.json({ ok: true, draft: updated, result });
}
