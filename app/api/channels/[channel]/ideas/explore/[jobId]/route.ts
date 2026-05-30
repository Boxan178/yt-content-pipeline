import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getChannel } from '@/lib/channels';
import { findJob, tailLog } from '@/lib/claude-jobs';
import { extractAssistantText } from '@/lib/lab/parse-engine-output';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function exploreJobsDir(slug: string): string {
  return path.join(os.homedir(), '.yt-content-pipeline', 'ideas-explore', slug);
}

interface Ctx {
  params: { channel: string; jobId: string };
}

/**
 * GET /api/channels/[channel]/ideas/explore/[jobId]
 * Status + tail + ideas parseadas del bloque IDEAS_JSON. Espejo del polling
 * de research del /lab.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const channel = getChannel(ctx.params.channel);
  if (!channel) {
    return NextResponse.json({ error: `Unknown channel: ${ctx.params.channel}` }, { status: 404 });
  }

  const dir = exploreJobsDir(channel.slug);
  const job = findJob(dir, ctx.params.jobId);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const tail = tailLog(job.logPath, 200);
  let parsed: unknown = null;
  let jobError: string | null = null;
  try {
    const raw = readFileSync(job.logPath, 'utf-8');
    const assistantText = extractAssistantText(raw);
    parsed = parseIdeasJson(assistantText);
    jobError = detectJobError(raw, assistantText);
  } catch {
    parsed = null;
  }

  return NextResponse.json({ ok: true, job, tail, parsed, jobError });
}

/**
 * Extrae el array de ideas tolerando varios formatos de salida de MARIO:
 *   1. Bloque `IDEAS_JSON` entre separadores (formato pedido).
 *   2. `IDEAS_JSON` seguido de una fence ```json … ```.
 *   3. Fallback: el primer array JSON top-level cuyos objetos tengan `title`.
 */
function parseIdeasJson(text: string): unknown {
  // 1) Bloque con separadores
  const block = text.match(/IDEAS_JSON\s*\n[─\-_]{20,}\n([\s\S]+?)\n[─\-_]{20,}/);
  if (block) {
    const arr = tryParseArray(block[1]);
    if (arr) return arr;
  }
  // 2) IDEAS_JSON + fence ```json
  const fence = text.match(/IDEAS_JSON[\s\S]*?```(?:json)?\s*([\s\S]+?)```/i);
  if (fence) {
    const arr = tryParseArray(fence[1]);
    if (arr) return arr;
  }
  // 3) Fallback: primer array de objetos con "title"
  const idx = text.indexOf('IDEAS_JSON');
  const scope = idx >= 0 ? text.slice(idx) : text;
  const loose = scope.match(/\[\s*\{[\s\S]*?\}\s*\]/);
  if (loose) {
    const arr = tryParseArray(loose[0]);
    if (arr && arr.some((x) => x && typeof x === 'object' && 'title' in (x as object))) return arr;
  }
  return null;
}

function tryParseArray(s: string): unknown[] | null {
  try {
    const v = JSON.parse(s.trim());
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Detecta un fallo a nivel de job (no de parseo): el `claude -p` que reventó
 * antes de producir nada útil. El caso más típico es un 401 de autenticación
 * (credenciales Pro caducadas o API key inválida heredada del entorno). Mira
 * el evento `result` con is_error y, como respaldo, patrones de error en el
 * texto del assistant. Devuelve null si no hay error claro.
 */
function detectJobError(raw: string, assistantText: string): string | null {
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith('{') || !t.includes('"type":"result"')) continue;
    try {
      const ev = JSON.parse(t) as { is_error?: boolean; result?: string };
      if (ev.is_error && typeof ev.result === 'string') return ev.result.slice(0, 500);
    } catch {}
  }
  if (/API Error: 401|authentication_error|Invalid authentication credentials/i.test(assistantText)) {
    return assistantText.slice(0, 500);
  }
  return null;
}
