import { NextRequest, NextResponse } from 'next/server';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { getChannel } from '@/lib/channels';
import {
  readJob,
  writeJob,
  readLogTail,
  inferStatusFromLog,
  isPidAlive,
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

export async function GET(
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
    return NextResponse.json({ ok: true, job: null });
  }

  // Si el job sigue marcado como running, verifica PID y log
  if (job.status === 'running') {
    const alive = isPidAlive(job.pid);
    if (!alive) {
      const log = await readLogTail(videoFolder, 500);
      const inferred = inferStatusFromLog(log) ?? 'failed';
      job.status = inferred;
      job.finishedAt = new Date().toISOString();
      await writeJob(videoFolder, job);
    } else {
      // Aunque siga vivo, si el log ya tiene OK/FAIL, registralo
      const log = await readLogTail(videoFolder, 500);
      const inferred = inferStatusFromLog(log);
      if (inferred === 'done' || inferred === 'failed') {
        job.status = inferred;
        job.finishedAt = new Date().toISOString();
        await writeJob(videoFolder, job);
      }
    }
  }

  const tail = await readLogTail(videoFolder, 200);
  const startedMs = new Date(job.startedAt).getTime();
  const endMs = job.finishedAt ? new Date(job.finishedAt).getTime() : Date.now();
  const durationSec = Math.round((endMs - startedMs) / 1000);

  return NextResponse.json({ ok: true, job, tail, durationSec });
}
