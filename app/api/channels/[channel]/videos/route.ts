import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { getChannel, type VideoState } from '@/lib/channels';
import { computeProgress, type Progress } from '@/lib/progress';
import { listActiveJobsForFolder, type ClaudeJob } from '@/lib/claude-jobs';
import { diffAndUpdate, type Transition } from '@/lib/seen-states';
import { readSchedule, type ScheduledUpload } from '@/lib/upload-schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface VideoDTO {
  channel: string;
  title: string;
  state: VideoState;
  folderPath: string;
  thumbnailUrl: string | null;
  renderOk: boolean;
  shortsCount: number;
  hasPackaging: boolean;
  mtime: string;
  warnings: string[];
  progress: Progress;
  /** Jobs claude vivos asociados a este vídeo. UI muestra badge "trabajando" si len>0. */
  activeJobs: Array<Pick<ClaudeJob, 'jobId' | 'skill' | 'label' | 'startedAt'>>;
  /** Es una recopilación (existe _PACKAGING/compilation.json). */
  isCompilation: boolean;
  /** Si es recopilación, número de historias fuente. */
  compilationSources?: number;
  /** Si tiene una subida programada (pending/uploading), su info. */
  scheduledUpload?: {
    id: string;
    scheduledFor: string;
    status: 'pending' | 'uploading';
    privacyOnPublish: 'public' | 'unlisted' | 'private';
  };
}

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAIN_VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv']);

async function safeReaddir(p: string): Promise<string[]> {
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

async function inspectVideoFolder(
  channelSlug: string,
  state: VideoState,
  rootPath: string,
  stateFolder: string,
  folderName: string,
): Promise<VideoDTO | null> {
  const folderPath = path.join(rootPath, stateFolder, folderName);
  const st = await tryStat(folderPath);
  if (!st || !st.isDirectory()) return null;

  const entries = await safeReaddir(folderPath);
  const hasPackaging = entries.includes('_PACKAGING');
  const hasRender = entries.includes('RENDER');

  if (!hasPackaging && !hasRender) return null;

  const warnings: string[] = [];

  let renderOk = false;
  let shortsCount = 0;
  if (hasRender) {
    const renderPath = path.join(folderPath, 'RENDER');
    const renderEntries = await safeReaddir(renderPath);
    for (const e of renderEntries) {
      const ext = path.extname(e).toLowerCase();
      if (!MAIN_VIDEO_EXT.has(ext)) continue;
      if (/^Short\s+\d/i.test(e)) {
        shortsCount++;
      } else {
        const eStat = await tryStat(path.join(renderPath, e));
        if (eStat && eStat.size > 1024 * 1024) {
          renderOk = true;
        }
      }
    }
    if (!renderOk) warnings.push('Sin render principal');
  } else {
    warnings.push('Sin carpeta RENDER');
  }

  let thumbnailUrl: string | null = null;
  if (hasPackaging) {
    const minisPath = path.join(folderPath, '_PACKAGING', 'MINIATURAS');
    const minis = await safeReaddir(minisPath);
    type Cand = { name: string; mtime: number };
    const candidates: Cand[] = [];
    for (const m of minis) {
      const ext = path.extname(m).toLowerCase();
      if (!IMAGE_EXT.has(ext)) continue;
      const ms = await tryStat(path.join(minisPath, m));
      if (ms && ms.isFile()) {
        candidates.push({ name: m, mtime: ms.mtimeMs });
      }
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.mtime - a.mtime);
      thumbnailUrl =
        `/api/channels/${encodeURIComponent(channelSlug)}` +
        `/videos/${encodeURIComponent(folderName)}/thumbnail`;
    } else {
      warnings.push('Sin miniatura');
    }
  } else {
    warnings.push('Sin _PACKAGING');
  }

  const progress = await computeProgress(folderPath);

  // Detección de recopilación: existe _PACKAGING/compilation.json
  let isCompilation = false;
  let compilationSources: number | undefined;
  if (hasPackaging) {
    const compPath = path.join(folderPath, '_PACKAGING', 'compilation.json');
    const compStat = await tryStat(compPath);
    if (compStat?.isFile()) {
      isCompilation = true;
      try {
        const { readFile } = await import('node:fs/promises');
        const raw = await readFile(compPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.sources)) compilationSources = parsed.sources.length;
      } catch {}
    }
  }

  // Jobs claude vivos asociados a este vídeo (escanea .claude-jobs/ del folder)
  const activeJobs = listActiveJobsForFolder(folderPath.replace(/\\/g, '/')).map((j) => ({
    jobId: j.jobId,
    skill: j.skill,
    label: j.label,
    startedAt: j.startedAt,
  }));

  return {
    channel: channelSlug,
    title: folderName,
    state,
    folderPath,
    thumbnailUrl,
    renderOk,
    shortsCount,
    hasPackaging,
    mtime: new Date(st.mtimeMs).toISOString(),
    warnings,
    progress,
    activeJobs,
    isCompilation,
    compilationSources,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { channel: string } },
) {
  const channel = getChannel(params.channel);
  if (!channel) {
    return NextResponse.json({ error: `Unknown channel: ${params.channel}` }, { status: 404 });
  }
  if (!channel.enabled) {
    return NextResponse.json({ error: `Channel disabled: ${channel.slug}` }, { status: 403 });
  }

  const allVideos: VideoDTO[] = [];
  const stateEntries = Object.entries(channel.stateFolders) as [VideoState, string][];

  await Promise.all(
    stateEntries.map(async ([state, folder]) => {
      const folderPath = path.join(channel.rootPath, folder);
      const entries = await safeReaddir(folderPath);
      const results = await Promise.all(
        entries.map((name) =>
          inspectVideoFolder(channel.slug, state, channel.rootPath, folder, name),
        ),
      );
      for (const r of results) if (r) allVideos.push(r);
    }),
  );

  // Cruce con subidas programadas. Para cada vídeo, buscamos en el scheduler
  // una entrada PENDING o UPLOADING cuyo videoFolder coincida (normalizado a /).
  try {
    const schedule = readSchedule();
    const activeByFolder = new Map<string, ScheduledUpload>();
    for (const item of schedule.items) {
      if (item.status === 'pending' || item.status === 'uploading') {
        activeByFolder.set(item.videoFolder.replace(/\\/g, '/'), item);
      }
    }
    for (const v of allVideos) {
      const key = v.folderPath.replace(/\\/g, '/');
      const upl = activeByFolder.get(key);
      if (upl) {
        v.scheduledUpload = {
          id: upl.id,
          scheduledFor: upl.scheduledFor,
          status: upl.status === 'pending' ? 'pending' : 'uploading',
          privacyOnPublish: upl.privacyOnPublish,
        };
      }
    }
  } catch {}

  allVideos.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));

  const counts: Record<VideoState, number> = { pending_locution: 0, production: 0, ready: 0, uploaded: 0, archived: 0 };
  for (const v of allVideos) counts[v.state]++;

  // Detección de transiciones de estado para gamificación. Primera carga
  // global registra los current states sin disparar nada (decisión "empezar
  // limpio"). Llamadas siguientes devuelven solo nuevas transiciones a
  // uploaded / ready.
  let transitions: Transition[] = [];
  try {
    transitions = diffAndUpdate(
      allVideos.map((v) => ({
        videoFolder: v.folderPath.replace(/\\/g, '/'),
        videoTitle: v.title,
        state: v.state,
      })),
    );
  } catch {}

  return NextResponse.json({
    channel: channel.slug,
    name: channel.name,
    counts,
    videos: allVideos,
    transitions,
  });
}
