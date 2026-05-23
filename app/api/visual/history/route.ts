import { NextResponse } from 'next/server';
import { readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OUTPUT_DIR = path.join(os.homedir(), '.yt-content-pipeline', 'visual-lab');

/**
 * GET /api/visual/history
 * Lista las imágenes generadas localmente, sorted más recientes primero.
 * Limita a las últimas 50.
 */
export async function GET() {
  try {
    const entries = await readdir(OUTPUT_DIR);
    const files = entries.filter((e) => /\.(png|jpg|jpeg|webp)$/i.test(e));
    const withStats = await Promise.all(
      files.map(async (name) => {
        try {
          const s = await stat(path.join(OUTPUT_DIR, name));
          return { name, mtime: s.mtimeMs, size: s.size };
        } catch {
          return null;
        }
      }),
    );
    const list = withStats
      .filter((x): x is { name: string; mtime: number; size: number } => x !== null)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 50)
      .map((x) => ({
        filename: x.name,
        fileUrl: `/api/visual/file/${encodeURIComponent(x.name)}`,
        size: x.size,
        createdAt: new Date(x.mtime).toISOString(),
      }));
    return NextResponse.json({ ok: true, items: list });
  } catch {
    return NextResponse.json({ ok: true, items: [] });
  }
}
