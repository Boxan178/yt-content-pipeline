import { NextRequest, NextResponse } from 'next/server';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIR = path.join(os.homedir(), '.yt-content-pipeline', 'checklist-orders');

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function keyFor(folder: string): string {
  return createHash('md5').update(folder).digest('hex');
}

/**
 * GET /api/checklist-order?folder=...
 * Devuelve { order: string[] } o { order: null } si no hay orden personalizado.
 */
export async function GET(req: NextRequest) {
  const folder = new URL(req.url).searchParams.get('folder');
  if (!folder) return NextResponse.json({ ok: false, error: 'Missing folder' }, { status: 400 });
  const file = path.join(DIR, `${keyFor(folder)}.json`);
  if (!existsSync(file)) return NextResponse.json({ ok: true, order: null });
  try {
    const raw = readFileSync(file, 'utf-8');
    return NextResponse.json({ ok: true, order: JSON.parse(raw) });
  } catch {
    return NextResponse.json({ ok: true, order: null });
  }
}

/**
 * POST /api/checklist-order?folder=...
 * Body: { order: string[] }  (array de IDs estables — usamos el text del item).
 * NO modifica packaging.md, solo guarda el orden de presentación.
 */
export async function POST(req: NextRequest) {
  const folder = new URL(req.url).searchParams.get('folder');
  if (!folder) return NextResponse.json({ ok: false, error: 'Missing folder' }, { status: 400 });
  let body: { order?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.order)) {
    return NextResponse.json({ ok: false, error: 'order debe ser array' }, { status: 400 });
  }
  ensureDir();
  const file = path.join(DIR, `${keyFor(folder)}.json`);
  writeFileSync(file, JSON.stringify(body.order), 'utf-8');
  return NextResponse.json({ ok: true });
}
