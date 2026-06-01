import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isSafePathSegment } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLAUDE_DIR = path.join(os.homedir(), '.claude', 'projects');

async function tryReaddir(p: string): Promise<string[]> {
  try { return await readdir(p); } catch { return []; }
}
async function tryStat(p: string) {
  try { return await stat(p); } catch { return null; }
}

/**
 * GET /api/chats/[sessionId]
 * Busca el .jsonl correspondiente en cualquier subdirectorio de
 * ~/.claude/projects/. Devuelve el array completo de mensajes parseados.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  // Defensa en profundidad: el segmento se interpola en un nombre de fichero.
  if (!isSafePathSegment(params.sessionId)) {
    return NextResponse.json({ ok: false, error: 'invalid session id' }, { status: 400 });
  }
  const wanted = `${params.sessionId}.jsonl`;
  const projects = await tryReaddir(CLAUDE_DIR);
  for (const project of projects) {
    const filePath = path.join(CLAUDE_DIR, project, wanted);
    const st = await tryStat(filePath);
    if (st?.isFile()) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const messages = content
          .split(/\r?\n/)
          .filter((l) => l.trim())
          .map((l) => {
            try { return JSON.parse(l); } catch { return null; }
          })
          .filter((x) => x !== null);
        return NextResponse.json({
          ok: true,
          sessionId: params.sessionId,
          project,
          filePath: filePath.replace(/\\/g, '/'),
          messages,
        });
      } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
      }
    }
  }
  return NextResponse.json({ ok: false, error: 'session not found' }, { status: 404 });
}
