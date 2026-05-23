import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIR = path.join(os.homedir(), '.yt-content-pipeline');
const AVATAR_DIR = path.join(DIR, 'avatars');
const GENERIC_CANDIDATES = ['avatar.jpg', 'avatar.jpeg', 'avatar.png', 'avatar.webp'];
const PIXEL_EXTS = ['png', 'webp', 'jpg', 'jpeg'];
const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

async function serveFile(p: string) {
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

/**
 * GET /api/avatar?level=N
 *
 * Prioridad de búsqueda:
 *   1. Sprite pixel-art específico por nivel:
 *        ~/.yt-content-pipeline/avatars/level-<N>.png (.webp/.jpg/.jpeg)
 *   2. Sprite del rango Jedi alcanzado (busca hacia atrás desde N hasta encontrar):
 *        ~/.yt-content-pipeline/avatars/level-<X>.{png,...} donde X <= N
 *   3. Avatar genérico de Pablo:
 *        ~/.yt-content-pipeline/avatar.{jpg,jpeg,png,webp}
 *   4. 404 (el cliente cae a iniciales).
 *
 * Si no se pasa `level`, salta a paso 3 directamente.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const levelParam = url.searchParams.get('level');
  const level = levelParam ? parseInt(levelParam, 10) : NaN;

  // 1+2) Buscar sprite de nivel exacto, luego retroceder
  if (!Number.isNaN(level) && level > 0) {
    for (let lv = level; lv >= 1; lv--) {
      for (const ext of PIXEL_EXTS) {
        const p = path.join(AVATAR_DIR, `level-${lv}.${ext}`);
        try {
          const st = await stat(p);
          if (st.isFile()) return await serveFile(p);
        } catch {}
      }
    }
  }

  // 3) Avatar genérico
  for (const name of GENERIC_CANDIDATES) {
    const p = path.join(DIR, name);
    try {
      const st = await stat(p);
      if (st.isFile()) return await serveFile(p);
    } catch {}
  }

  return NextResponse.json({ error: 'No avatar' }, { status: 404 });
}
