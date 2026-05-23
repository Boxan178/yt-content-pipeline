import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { CHANNELS } from '@/lib/channels';
import { listJobsForFolder } from '@/lib/claude-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function tryReaddir(p: string): Promise<string[]> {
  try {
    return await readdir(p);
  } catch {
    return [];
  }
}

async function tryStat(p: string) {
  try {
    return await stat(p);
  } catch {
    return null;
  }
}

/**
 * GET /api/claude/jobs/all
 * Lista jobs (running + recientes) de TODOS los vídeos en TODOS los canales activos.
 * Para la vista /jobs.
 */
export async function GET(_req: NextRequest) {
  const allJobs: Array<{
    channel: string;
    channelName: string;
    videoTitle: string;
    videoFolder: string;
    job: ReturnType<typeof listJobsForFolder>[number];
  }> = [];

  for (const channel of CHANNELS) {
    if (!channel.enabled) continue;
    for (const stateFolder of Object.values(channel.stateFolders)) {
      if (!stateFolder) continue;
      const stateDir = path.join(channel.rootPath, stateFolder);
      const entries = await tryReaddir(stateDir);
      for (const folderName of entries) {
        const videoFolder = path.join(stateDir, folderName).replace(/\\/g, '/');
        const st = await tryStat(videoFolder);
        if (!st?.isDirectory()) continue;
        const jobs = listJobsForFolder(videoFolder);
        for (const j of jobs) {
          allJobs.push({
            channel: channel.slug,
            channelName: channel.name,
            videoTitle: folderName,
            videoFolder,
            job: j,
          });
        }
      }
    }
  }

  // Sort: running primero, después por startedAt desc
  allJobs.sort((a, b) => {
    const aRunning = a.job.status === 'running';
    const bRunning = b.job.status === 'running';
    if (aRunning !== bRunning) return aRunning ? -1 : 1;
    return a.job.startedAt < b.job.startedAt ? 1 : -1;
  });

  return NextResponse.json({ ok: true, jobs: allJobs });
}
