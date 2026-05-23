import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 1800; // 30 min — SARA orquestando varias skills puede tardar

const DEFAULT_CWD = 'Y:/04_DEV/J.A.R.V.I.S';

// Paths permitidos como CWD. La raíz de J.A.R.V.I.S. es donde viven todas las
// skills (.claude/skills/) y la memoria (claude-memory/, CLAUDE.md). El disco
// H: lo permitimos para CWD apuntando a carpetas de vídeo específicas.
const ALLOWED_CWD_PREFIXES = [
  'Y:/04_DEV/J.A.R.V.I.S',
  'H:/YOUTUBE',
];

function normalizeCwd(input?: string): string {
  if (!input) return DEFAULT_CWD;
  const norm = input.replace(/\\/g, '/').replace(/\/+$/, '');
  if (ALLOWED_CWD_PREFIXES.some((p) => norm === p || norm.startsWith(p + '/'))) {
    return norm;
  }
  // Fallback al default si el cwd no está permitido (path traversal o ruta arbitraria)
  return DEFAULT_CWD;
}

interface RunRequest {
  prompt: string;
  cwd?: string;
  /** Si true, devuelve también stderr para debug. Default false. */
  includeStderr?: boolean;
  /** Timeout en milisegundos. Default 10 min, max 29 min. */
  timeoutMs?: number;
}

export async function POST(req: NextRequest) {
  let body: RunRequest;
  try {
    body = (await req.json()) as RunRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.prompt || typeof body.prompt !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid `prompt`' }, { status: 400 });
  }

  const cwd = normalizeCwd(body.cwd);
  const startedAt = Date.now();

  // En Windows necesitamos shell:true para resolver claude.cmd / claude.exe
  // automáticamente. Pasar el prompt por stdin evita problemas de escape de
  // comillas, em-dashes y caracteres especiales.
  return new Promise<Response>((resolve) => {
    const child = spawn('claude', ['-p'], {
      cwd,
      shell: true,
      windowsHide: true,
      env: {
        ...process.env,
        // Evita que claude intente abrir un editor o pedir input interactivo
        TERM: 'dumb',
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf-8'); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf-8'); });

    const requestedTimeout = typeof body.timeoutMs === 'number' && body.timeoutMs > 0
      ? body.timeoutMs
      : 10 * 60 * 1000;
    const timeoutMs = Math.min(requestedTimeout, 29 * 60 * 1000);
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch {}
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 5_000);
      resolve(
        NextResponse.json(
          {
            error: `Timeout after ${timeoutMs / 1000}s`,
            output: stdout,
            stderr: body.includeStderr ? stderr : undefined,
            cwd,
            durationMs: Date.now() - startedAt,
          },
          { status: 504 },
        ),
      );
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve(
        NextResponse.json(
          { error: `spawn failed: ${err.message}`, cwd },
          { status: 500 },
        ),
      );
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startedAt;
      if (code === 0) {
        resolve(
          NextResponse.json({
            ok: true,
            output: stdout.trim(),
            stderr: body.includeStderr ? stderr : undefined,
            cwd,
            durationMs,
          }),
        );
      } else {
        resolve(
          NextResponse.json(
            {
              error: `claude exited with code ${code}`,
              output: stdout,
              stderr,
              cwd,
              durationMs,
            },
            { status: 500 },
          ),
        );
      }
    });

    // Enviamos el prompt por stdin y cerramos. Esto es más robusto que pasar
    // el prompt como argumento porque evita problemas de escape en Windows.
    try {
      child.stdin.write(body.prompt, 'utf-8');
      child.stdin.end();
    } catch (e) {
      clearTimeout(timer);
      try { child.kill(); } catch {}
      resolve(
        NextResponse.json(
          { error: `stdin write failed: ${e instanceof Error ? e.message : String(e)}` },
          { status: 500 },
        ),
      );
    }
  });
}
