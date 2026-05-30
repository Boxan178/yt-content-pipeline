import { NextRequest, NextResponse } from 'next/server';
import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getChannel } from '@/lib/channels';
import { startJob } from '@/lib/claude-jobs';
import { JARVIS_ROOT } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Dir de jobs de exploración de ideas, por canal. */
function exploreJobsDir(slug: string): string {
  return path.join(os.homedir(), '.yt-content-pipeline', 'ideas-explore', slug);
}

interface Ctx {
  params: { channel: string };
}

interface PostBody {
  /** Cuántas ideas pedir (default 8). */
  count?: number;
  /** Nota opcional de Pablo para orientar la exploración. */
  focus?: string;
}

/**
 * POST /api/channels/[channel]/ideas/explore
 *
 * Lanza un job MARIO + Algrow/vidiq MCP que analiza el canal de Pablo, detecta
 * sus vídeos top y propone ideas NUEVAS replicables. Mismo patrón que el
 * research del /lab: el cliente polleia con GET .../explore/[jobId] y al
 * terminar parsea el bloque IDEAS_JSON.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const channel = getChannel(ctx.params.channel);
  if (!channel) {
    return NextResponse.json({ error: `Unknown channel: ${ctx.params.channel}` }, { status: 404 });
  }
  if (!channel.enabled) {
    return NextResponse.json({ error: `Channel disabled: ${channel.slug}` }, { status: 403 });
  }

  let body: PostBody = {};
  try {
    body = (await req.json()) as PostBody;
  } catch {
    // body opcional
  }
  const count = Math.min(Math.max(Number(body.count) || 8, 3), 20);
  const focus = (body.focus ?? '').toString().slice(0, 400).trim();

  const dir = exploreJobsDir(channel.slug);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const channelIdHint = channel.youtubeChannelId
    ? `Su channelId de YouTube es \`${channel.youtubeChannelId}\` (úsalo directamente con las herramientas que lo acepten).`
    : `No tengo el channelId guardado: resuélvelo por NOMBRE/handle con \`mcp__algrow__resolve_handle\` o \`mcp__algrow__youtube_search\` antes de pedir sus vídeos.`;

  const prompt = `MARIO, quiero IDEAS NUEVAS de vídeo para mi canal **${channel.name}** (faceless YouTube), replicando lo que ya me funciona.

CONTEXTO:
- Canal: ${channel.name} (slug interno: ${channel.slug}).
- ${channelIdHint}
${focus ? `- Enfoque que pido para esta tanda: ${focus}` : ''}

PROCESO (usa las herramientas Algrow/vidiq MCP — mcp__algrow__* y mcp__vidiq__*):
1. Localiza el canal y trae sus vídeos (\`mcp__algrow__get_channel_videos\` o \`mcp__vidiq__vidiq_channel_videos\`).
2. Detecta sus TOP performers reales por views/VPH (no por antigüedad). Identifica el PATRÓN que funciona: tipo de promesa, ángulo, formato, hook, packaging.
3. Para profundizar, mira outliers del nicho con \`mcp__vidiq__vidiq_outliers\` / \`mcp__algrow__search_viral_videos\` y cruza con lo que ya le funciona al canal.
4. Propón **${count}** ideas NUEVAS replicables: mismo formato ganador pero ángulo fresco (no recalcar el mismo vídeo). Cada idea debe ser accionable como vídeo long-form del canal.

ENTREGA FINAL (OBLIGATORIO): un bloque con header IDEAS_JSON seguido del JSON (array), así:

IDEAS_JSON
─────────────────────────────────────────
[
  {
    "title": "Título tentativo del vídeo (estilo del canal)",
    "description": "2-4 frases: de qué va y por qué encaja con lo que funciona.",
    "angle": "El ángulo/gancho diferencial.",
    "whyItWorks": "Qué patrón propio replica y por qué debería rendir.",
    "sourceVideoTitle": "Título del vídeo propio que la inspira (o '')",
    "sourceVideoUrl": "URL del vídeo fuente (o '')",
    "tags": ["tag1", "tag2"],
    "priority": 3
  }
]
─────────────────────────────────────────

Reglas: \`priority\` 1-5 (5 = apuesta más fuerte). Devuelve EXACTAMENTE ${count} ideas. No incluyas nada después del cierre del bloque salvo la línea final.

Cuando termines, escribe la línea exacta:
<<<DONE>>>`;

  try {
    const job = startJob({
      skill: 'mario',
      label: `MARIO — ideas: ${channel.name}`,
      prompt,
      cwd: JARVIS_ROOT,
      videoFolder: dir,
      timeoutMs: 12 * 60 * 1000,
      model: 'sonnet',
    });
    return NextResponse.json({ ok: true, job, count });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
