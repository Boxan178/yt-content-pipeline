import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OUTPUT_DIR = path.join(os.homedir(), '.yt-content-pipeline', 'visual-lab');
const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/**
 * GET /api/visual/file/[filename]
 * Sirve una imagen generada localmente. Filename debe ser solo nombre, sin
 * separadores de path (anti path-traversal).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { filename: string } },
) {
  const filename = decodeURIComponent(params.filename);
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return NextResponse.json({ error: 'filename inválido' }, { status: 400 });
  }
  const p = path.join(OUTPUT_DIR, filename);
  try {
    const st = await stat(p);
    if (!st.isFile()) return NextResponse.json({ error: 'No file' }, { status: 404 });
    const buf = await readFile(p);
    const ext = path.extname(filename).toLowerCase();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Content-Length': String(buf.length),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'No file' }, { status: 404 });
  }
}
