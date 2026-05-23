import { NextRequest, NextResponse } from 'next/server';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { getChannel } from '@/lib/channels';
import { readJob, writeJob, killPid, isPidAlive } from '@/lib/render';

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

  const videoTitle = decodeURIComponent(params.video);
  const stateDirs = Object.values(channel.stateFolders);
  const videoFolder = await findVideoFolder(channel.rootPath, stateDirs, videoTitle);
  if (!videoFolder) {
    return NextResponse.json({ error: 'Video folder not found' }, { status: 404 });
  }

  const job = await readJob(videoFolder);
  if (!job) {
    return NextResponse.json({ error: 'No hay render en curso' }, { status: 404 });
  }

  if (job.status !== 'running') {
    return NextResponse.json({ ok: true, job, note: `Job ya estaba en estado ${job.status}` });
  }

  if (isPidAlive(job.pid)) {
    killPid(job.pid);
  }

  job.status = 'cancelled';
  job.finishedAt = new Date().toISOString();
  await writeJob(videoFolder, job);

  return NextResponse.json({ ok: true, job });
}
