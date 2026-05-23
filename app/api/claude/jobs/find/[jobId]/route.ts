import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CHANNELS } from '@/lib/channels';
import { findJob, tailLog } from '@/lib/claude-jobs';
import { parseStreamLog } from '@/lib/stream-events';

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
 * GET /api/claude/jobs/find/[jobId]
 * Busca el job en todos los canales activos. Devuelve el job + videoFolder +
 * metadatos del canal/vídeo + events parseados + tail.
 *
 * Más caro que /api/claude/jobs/[jobId] (escanea filesystem), úsalo solo cuando
 * el caller NO sabe el videoFolder (vista /jobs/[jobId]).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const jobId = params.jobId;
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
        const job = findJob(videoFolder, jobId);
        if (!job) continue;
        // Encontrado.
        const tail = tailLog(job.logPath, 300);
        let events: ReturnType<typeof parseStreamLog> = [];
        try {
          const fullLog = readFileSync(job.logPath, 'utf-8');
          events = parseStreamLog(fullLog);
        } catch {
          events = [];
        }
        const durationMs =
          new Date(job.finishedAt ?? new Date().toISOString()).getTime() -
          new Date(job.startedAt).getTime();
        return NextResponse.json({
          ok: true,
          job,
          tail,
          events,
          durationMs,
          videoFolder,
          videoTitle: folderName,
          channel: channel.slug,
          channelName: channel.name,
        });
      }
    }
  }
  return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 });
}
