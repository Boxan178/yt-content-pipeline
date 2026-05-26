import { NextResponse } from 'next/server';
import { readdir, stat, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLAUDE_DIR = path.join(os.homedir(), '.claude', 'projects');

// Filtro de workspace: solo se muestran chats cuyo proyecto pertenezca al
// workspace YouTube OS (`Y:/04_DEV/J.A.R.V.I.S/youtube-os/` y subdirectorios).
// Claude Code escribe el dirname reemplazando `/`, `\`, `:`, `.` por `-`,
// así que el prefix queda como `Y--04-DEV-J-A-R-V-I-S-youtube-os`.
// Decisión 2026-05-25 (Pablo): los chats de otros workspaces (lab, biblioteca,
// pdf-farming, sandbox, C:/dev/yt-content-pipeline, etc.) NO interesan en
// esta app — es una ventana sobre la producción YouTube.
const YOUTUBE_OS_PROJECT_PREFIX = 'Y--04-DEV-J-A-R-V-I-S-youtube-os';

interface ChatSummary {
  sessionId: string;
  project: string;        // dirname del cwd (claude code lo guarda con / → -)
  filePath: string;       // path absoluto del .jsonl
  mtime: string;
  sizeKb: number;
  preview: string;        // primer mensaje user truncado
  turns: number;
}

async function tryReaddir(p: string): Promise<string[]> {
  try { return await readdir(p); } catch { return []; }
}
async function tryStat(p: string) {
  try { return await stat(p); } catch { return null; }
}

/**
 * GET /api/chats
 * Lista todas las sesiones de claude code guardadas en
 * ~/.claude/projects/<cwd-hash>/<session-id>.jsonl, ordenadas por mtime desc.
 * Lee solo el primer mensaje user para preview (no carga todo el .jsonl).
 */
export async function GET() {
  if (!(await tryStat(CLAUDE_DIR))?.isDirectory()) {
    return NextResponse.json({ ok: true, chats: [] });
  }
  const projects = await tryReaddir(CLAUDE_DIR);
  const summaries: ChatSummary[] = [];

  for (const project of projects) {
    // Saltar todo lo que no sea workspace YouTube OS.
    if (!project.startsWith(YOUTUBE_OS_PROJECT_PREFIX)) continue;
    const projDir = path.join(CLAUDE_DIR, project);
    const ps = await tryStat(projDir);
    if (!ps?.isDirectory()) continue;
    const files = await tryReaddir(projDir);
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const filePath = path.join(projDir, f);
      const fs = await tryStat(filePath);
      if (!fs?.isFile()) continue;
      try {
        const content = await readFile(filePath, 'utf-8');
        const lines = content.split(/\r?\n/).filter((l) => l.trim());
        // Buscar el primer mensaje user
        let preview = '';
        for (const line of lines) {
          try {
            const j = JSON.parse(line);
            if (j.type === 'user' || j.message?.role === 'user') {
              const c = j.message?.content;
              if (typeof c === 'string') {
                preview = c.slice(0, 200);
                break;
              }
              if (Array.isArray(c)) {
                const txt = c.find((b: any) => b?.type === 'text');
                if (txt && txt.text) {
                  preview = String(txt.text).slice(0, 200);
                  break;
                }
              }
            }
          } catch {}
        }
        summaries.push({
          sessionId: path.basename(f, '.jsonl'),
          project,
          filePath: filePath.replace(/\\/g, '/'),
          mtime: new Date(fs.mtimeMs).toISOString(),
          sizeKb: Math.round(fs.size / 1024),
          preview,
          turns: lines.length,
        });
      } catch {}
    }
  }

  summaries.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  return NextResponse.json({ ok: true, chats: summaries });
}
