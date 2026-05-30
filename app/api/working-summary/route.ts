import { NextResponse } from 'next/server';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { CHANNELS } from '@/lib/channels';
import { listActiveJobsForFolder } from '@/lib/claude-jobs';
import { readQueue } from '@/lib/job-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/working-summary
 *
 * Resumen ligero por canal de "qué se está trabajando": jobs claude VIVOS
 * (PID vivo, vía listActiveJobsForFolder) + items en cola pendientes. Para
 * destacar en la home los canales que están produciendo. Read-only respecto al
 * motor de la cola (solo lee readQueue + escanea .claude-jobs como el kanban).
 */

interface ChannelWork {
  slug: string;
  name: string;
  /** Jobs claude vivos ahora mismo en este canal. */
  liveJobs: number;
  /** Items en cola esperando (status pending) de este canal. */
  pending: number;
  /** El job vivo más antiguo (lo que se está haciendo + desde cuándo). */
  current: { videoTitle: string; skill: string; label: string; startedAt: string } | null;
}

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

const norm = (p: string) => p.replace(/\\/g, '/');

export async function GET() {
  const channels = CHANNELS.filter((c) => c.enabled);
  const summary: Record<string, ChannelWork> = {};
  for (const c of channels) {
    summary[c.slug] = { slug: c.slug, name: c.name, liveJobs: 0, pending: 0, current: null };
  }

  // Jobs vivos: escanea las carpetas de vídeo de cada canal (mismo patrón que /jobs).
  await Promise.all(
    channels.map(async (channel) => {
      const s = summary[channel.slug];
      for (const stateFolder of Object.values(channel.stateFolders)) {
        if (!stateFolder) continue;
        const stateDir = path.join(channel.rootPath, stateFolder);
        const entries = await tryReaddir(stateDir);
        await Promise.all(
          entries.map(async (folderName) => {
            const videoFolder = norm(path.join(stateDir, folderName));
            const st = await tryStat(videoFolder);
            if (!st?.isDirectory()) return;
            const active = listActiveJobsForFolder(videoFolder);
            if (active.length === 0) return;
            s.liveJobs += active.length;
            for (const j of active) {
              if (!s.current || j.startedAt < s.current.startedAt) {
                s.current = { videoTitle: folderName, skill: j.skill, label: j.label, startedAt: j.startedAt };
              }
            }
          }),
        );
      }
    }),
  );

  // Cola: items pendientes mapeados a canal por prefijo de rootPath.
  try {
    const queue = readQueue();
    for (const it of queue.items) {
      if (it.status !== 'pending') continue;
      const vf = norm(it.videoFolder).normalize('NFC');
      const ch = channels.find((c) => {
        const root = norm(c.rootPath).normalize('NFC');
        return vf === root || vf.startsWith(root + '/');
      });
      if (ch) summary[ch.slug].pending += 1;
    }
  } catch {}

  const arr = Object.values(summary);
  const totals = {
    liveJobs: arr.reduce((a, s) => a + s.liveJobs, 0),
    pending: arr.reduce((a, s) => a + s.pending, 0),
    workingChannels: arr.filter((s) => s.liveJobs > 0 || s.pending > 0).length,
  };

  return NextResponse.json({ ok: true, channels: summary, totals });
}
