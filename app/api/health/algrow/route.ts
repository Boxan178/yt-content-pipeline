import { NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALGROW_URL = 'https://mcp.algrow.online/mcp';

/** Token del MCP de Algrow (desde env o ~/.claude.json). */
function algrowToken(): string | null {
  if (process.env.ALGROW_MCP_TOKEN) return process.env.ALGROW_MCP_TOKEN;
  try {
    const raw = readFileSync(path.join(os.homedir(), '.claude.json'), 'utf-8');
    const m = raw.match(/mcp\.algrow\.online[\s\S]{0,200}?Bearer\s+([A-Za-z0-9_\-.]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/health/algrow — comprueba si el servicio externo de Algrow (voz + miniaturas)
 * responde. El monitor lo pega cada ciclo para detectar caídas PROACTIVAMENTE (el 504
 * que tumbó la voz el 2026-06-02 habría saltado aquí). `up=false` => Algrow caído.
 */
export async function GET() {
  const token = algrowToken();
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(ALGROW_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token ?? ''}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      signal: ctrl.signal,
    });
    clearTimeout(tm);
    // <500 = el gateway responde (Algrow vivo, aunque sea 400/401). 5xx/504 = caído.
    return NextResponse.json({ ok: true, up: r.status < 500, status: r.status });
  } catch (e) {
    clearTimeout(tm);
    // timeout / conexión rechazada = caído.
    return NextResponse.json({ ok: true, up: false, status: 0, error: e instanceof Error ? e.message : String(e) });
  }
}
