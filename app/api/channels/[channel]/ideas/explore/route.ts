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
 * Lanza un job MARIO + Algrow/vidiq MCP de Fase 0 (exploración de MERCADO):
 * usa el canal de Pablo solo como señal de audiencia/formato y mina outliers
 * del mercado abierto (cross-niche) para proponer ideas NUEVAS con el packaging
 * correcto — NO replica el propio catálogo. Mismo patrón que el research del
 * /lab: el cliente polleia con GET .../explore/[jobId] y al terminar parsea el
 * bloque IDEAS_JSON.
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

  const prompt = `MARIO, necesito IDEAS NUEVAS de vídeo para mi canal **${channel.name}** (faceless YouTube). Esto es tu **Fase 0 — exploración de MERCADO**, NO repackaging y NO "replicar mi canal".

REGLA DE ORO: NO me propongas variaciones de mis propios vídeos. Mi catálogo sirve SOLO para entender a MI AUDIENCIA (a qué deseo/dolor responde) y mi firma de formato — NUNCA como cantera de ideas. Las ideas nuevas salen de outliers del MERCADO ABIERTO de YouTube, incluso de OTROS nichos, reencuadrados a mi canal. Si una idea es "mi vídeo X con otro título", deséchala.

EL ÁNGULO ESTOICO/FILOSÓFICO ES OPCIONAL, no obligatorio. No hace falta hablar de Marco Aurelio, Séneca ni Epicteto en cada vídeo. Un topic potente de disciplina, rutina, transformación personal, mentalidad o alto rendimiento encaja perfectamente si conecta con el deseo de mi audiencia. Lo innegociable: que encaje con MI AUDIENCIA y su promesa, y que lleve el packaging correcto para llamar al clic.

CONTEXTO:
- Canal: ${channel.name} (slug interno: ${channel.slug}).
- ${channelIdHint}
${focus ? `- Enfoque que pido para esta tanda: ${focus}` : ''}

PROCESO (Fase 0 — usa las herramientas Algrow/vidiq MCP — mcp__algrow__* y mcp__vidiq__*):
1. SEÑAL DE MI CANAL (solo para ENTENDER, no para copiar): trae mis vídeos (\`mcp__algrow__get_channel_videos\` o \`mcp__vidiq__vidiq_channel_videos\`), detecta mis top reales por views/VPH y quédate con DOS cosas: (a) quién es mi audiencia y qué promesa le resuena, (b) mi firma de formato/packaging. NO propongas variaciones de estos vídeos.
2. MINA EL MERCADO ABIERTO (el corazón de la Fase 0): busca outliers REALES fuera de mi catálogo — en mi nicho Y en nichos adyacentes o distintos (disciplina, hábitos, psicología, mentalidad, productividad, alto rendimiento, motivación, masculinidad sana...). Usa \`mcp__algrow__search_viral_videos\`, \`mcp__algrow__youtube_search\` (order viewCount + ventana de fecha) y \`mcp__vidiq__vidiq_outliers\`. Para cada outlier fuerte anota: título exacto, miniatura (descrita), canal, nicho, views vs mediana (xN) y el MOTOR (por qué petó, en una frase).
3. FUSIONA (Type 4 controlado): cruza 1 topic-outlier de un nicho × 1 packaging-outlier de otro → una idea NUEVA reencuadrada a mi audiencia, con título y concepto de miniatura que roben la ESTRUCTURA del outlier, nunca sus frases ni su composición exacta. Diferénciate en la superficie, converge en la estructura. El cruce debe ser inédito en mi nicho.
4. Propón **${count}** ideas así, accionables como vídeo long-form. Cada una referida al OUTLIER DE MERCADO del que sale el patrón (de OTRO canal/nicho), NUNCA a un vídeo mío.

ENTREGA FINAL (OBLIGATORIO): un bloque con header IDEAS_JSON seguido del JSON (array), así:

IDEAS_JSON
─────────────────────────────────────────
[
  {
    "title": "Título tentativo del vídeo (con el packaging robado del outlier, a la voz del canal)",
    "description": "2-4 frases: de qué va, a qué deseo/dolor de mi audiencia apela, y de qué nicho/outlier de mercado sale el patrón.",
    "angle": "El ángulo/gancho diferencial (puede ser no-filosófico).",
    "whyItWorks": "El MOTOR del outlier de mercado que replica (patrón portable) + por qué encaja con mi audiencia.",
    "sourceVideoTitle": "Título del OUTLIER DE MERCADO que modela la idea/packaging (de OTRO canal/nicho, NUNCA un vídeo mío) (o '')",
    "sourceVideoUrl": "URL de ese outlier de mercado (o '')",
    "tags": ["tag1", "tag2"],
    "priority": 3
  }
]
─────────────────────────────────────────

Reglas: \`priority\` 1-5 (5 = apuesta más fuerte, mayor probabilidad de outlier × viabilidad). Devuelve EXACTAMENTE ${count} ideas. NO repliques mis vídeos. No incluyas nada después del cierre del bloque salvo la línea final.

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
