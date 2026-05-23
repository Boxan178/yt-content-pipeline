import { NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIR = path.join(os.homedir(), '.yt-content-pipeline');
const CANDIDATES = ['avatar.jpg', 'avatar.jpeg', 'avatar.png', 'avatar.webp'];
const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * GET /api/avatar
 * Sirve ~/.yt-content-pipeline/avatar.* si existe. Si no, 404.
 * Pablo puede dejar su foto ahí para que aparezca en el sidebar.
 */
export async function GET() {
  for (const name of CANDIDATES) {
    const p = path.join(DIR, name);
    try {
      const st = await stat(p);
      if (st.isFile()) {
        const ext = path.extname(p).toLowerCase();
        const buf = await readFile(p);
        return new NextResponse(buf, {
          status: 200,
          headers: {
            'Content-Type': MIME[ext] ?? 'application/octet-stream',
            'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
            'Content-Length': String(buf.length),
          },
        });
      }
    } catch {}
  }
  return NextResponse.json({ error: 'No avatar' }, { status: 404 });
}
