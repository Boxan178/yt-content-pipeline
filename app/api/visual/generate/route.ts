import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Paths a kie-bridge y al directorio de outputs. JARVIS_ROOT desofuscado
// para que NFT no lo trace como dependencia.
const JARVIS_ROOT = ['Y:', '04_DEV', 'J.A.R.V.I.S'].join('/');
const KIE_PY = path.join(JARVIS_ROOT.replace(/\//g, path.sep), 'lab', 'kie-bridge', 'kie.py');
const OUTPUT_DIR = path.join(os.homedir(), '.yt-content-pipeline', 'visual-lab');
const TMP_PROMPT_DIR = path.join(os.homedir(), '.yt-content-pipeline', 'visual-lab', '.prompts');

interface GenerateRequest {
  prompt: string;
  model?: string;        // nano-banana-2 | nano-banana-pro | etc.
  aspect?: string;       // 1:1 | 16:9 | 9:16 | 2:3 | 4:5
  resolution?: string;   // 1K | 2K
  format?: string;       // png | jpg | webp
}

/**
 * POST /api/visual/generate
 * Invoca kie-bridge para generar una imagen y la guarda en
 * `~/.yt-content-pipeline/visual-lab/<id>.<ext>`. Devuelve metadata + URL
 * para consumir desde el cliente vía /api/visual/file/<id>.
 *
 * El proceso es síncrono — el cliente debe esperar (suele tardar 30-60s).
 */
export async function POST(req: NextRequest) {
  let body: GenerateRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.prompt?.trim()) {
    return NextResponse.json({ ok: false, error: 'prompt vacío' }, { status: 400 });
  }
  const model = (body.model ?? 'nano-banana-2').trim();
  const aspect = (body.aspect ?? '16:9').trim();
  const resolution = (body.resolution ?? '2K').trim();
  const format = (body.format ?? 'png').trim();

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!existsSync(TMP_PROMPT_DIR)) mkdirSync(TMP_PROMPT_DIR, { recursive: true });

  const id = randomUUID();
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${ts}_${id.slice(0, 8)}.${format}`;
  const outPath = path.join(OUTPUT_DIR, filename);
  const promptPath = path.join(TMP_PROMPT_DIR, `${id}.txt`);

  // Escribir prompt a archivo (kie.py prefiere --prompt-file para textos largos)
  await writeFile(promptPath, body.prompt, 'utf-8');

  const result = await new Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }>((resolve) => {
    const args = [
      KIE_PY,
      '--model', model,
      '--prompt-file', promptPath,
      '--aspect', aspect,
      '--resolution', resolution,
      '--format', format,
      '--out', outPath,
    ];
    let stdout = '';
    let stderr = '';
    const child = spawn('python', args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    child.stdout.on('data', (c) => { stdout += c.toString(); });
    child.stderr.on('data', (c) => { stderr += c.toString(); });
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
    }, 5 * 60 * 1000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0 && existsSync(outPath), stdout, stderr, code });
    });
  });

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      error: result.stderr?.slice(-1500) || result.stdout?.slice(-1500) || `exit ${result.code}`,
    }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id,
    filename,
    fileUrl: `/api/visual/file/${encodeURIComponent(filename)}`,
    model,
    aspect,
    resolution,
    format,
    createdAt: new Date().toISOString(),
  });
}
