import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { openSync, existsSync, unlinkSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getChannel } from '@/lib/channels';
import {
  PYTHON_EXE,
  RENDER_SCRIPT,
  LOG_FILE,
  extractSlugFromPackaging,
  titleToSlug,
  findScript,
  readJob,
  writeJob,
  isPidAlive,
  type RenderJob,
} from '@/lib/render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function tryStat(p: string) {
  try {
    return await stat(p);
  } catch {
    return null;
  }
}

async function findVideoFolder(channelRoot: string, stateFolders: string[], videoTitle: string) {
  for (const sf of stateFolders) {
    const candidate = path.join(channelRoot, sf, videoTitle);
    const s = await tryStat(candidate);
    if (s && s.isDirectory()) return candidate;
  }
  return null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { channel: string; video: string } },
) {
  const channel = getChannel(params.channel);
  if (!channel || !channel.enabled) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }
  if (!channel.scriptsRoot) {
    return NextResponse.json({ error: 'Canal sin scriptsRoot configurado' }, { status: 422 });
  }

  // Verificar binarios
  if (!existsSync(PYTHON_EXE)) {
    return NextResponse.json(
      { error: `No encuentro python venv en ${PYTHON_EXE}` },
      { status: 500 },
    );
  }
  if (!existsSync(RENDER_SCRIPT)) {
    return NextResponse.json(
      { error: `No encuentro render_project.py en ${RENDER_SCRIPT}` },
      { status: 500 },
    );
  }

  const videoTitle = decodeURIComponent(params.video);
  const stateDirs = Object.values(channel.stateFolders);
  const videoFolder = await findVideoFolder(channel.rootPath, stateDirs, videoTitle);
  if (!videoFolder) {
    return NextResponse.json({ error: 'Video folder not found' }, { status: 404 });
  }

  // Evitar doble arranque
  const existing = await readJob(videoFolder);
  if (existing && existing.status === 'running' && isPidAlive(existing.pid)) {
    return NextResponse.json(
      { error: 'Ya hay un render en curso para este vídeo', job: existing },
      { status: 409 },
    );
  }

  // Slug: del packaging.md o fallback al título
  const packagingMd = path.join(videoFolder, '_PACKAGING', 'packaging.md');
  const slugFromPackaging = await extractSlugFromPackaging(packagingMd);
  const slug = slugFromPackaging ?? titleToSlug(videoTitle);

  // Script (guion-v2.md → guion.md)
  const scriptPath = await findScript(channel.scriptsRoot, slug);
  if (!scriptPath) {
    return NextResponse.json(
      {
        error: `No encuentro guion en ${channel.scriptsRoot}/${slug}/. Probé guion-v2.md y guion.md.`,
        hint: 'Si el slug es distinto, ajusta el campo `Slug:` del packaging.md.',
        slug,
      },
      { status: 422 },
    );
  }

  // Limpiar log previo
  const logPath = path.join(videoFolder, LOG_FILE);
  try {
    if (existsSync(logPath)) unlinkSync(logPath);
  } catch {
    // no-op
  }

  // Spawn detached con stdio → log file
  const out = openSync(logPath, 'a');
  const err = openSync(logPath, 'a');

  const winFolder = videoFolder.replace(/\//g, '\\');
  const winScript = scriptPath.replace(/\//g, '\\');
  const args = [
    RENDER_SCRIPT.replace(/\//g, '\\'),
    '--slug', slug,
    '--project-folder', winFolder,
    '--script', winScript,
  ];

  let child;
  try {
    child = spawn(PYTHON_EXE.replace(/\//g, '\\'), args, {
      detached: true,
      stdio: ['ignore', out, err],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
      },
      windowsHide: true,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Error spawning python: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  if (!child.pid) {
    return NextResponse.json(
      { error: 'Spawn no devolvió PID. Algo raro pasó.' },
      { status: 500 },
    );
  }

  child.unref();

  const job: RenderJob = {
    jobId: randomUUID(),
    pid: child.pid,
    status: 'running',
    startedAt: new Date().toISOString(),
    command: `${PYTHON_EXE} ${args.map((a) => `"${a}"`).join(' ')}`,
    slug,
    scriptPath,
    projectFolder: videoFolder,
  };

  await writeJob(videoFolder, job);

  return NextResponse.json({ ok: true, job });
}
