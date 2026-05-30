/**
 * Lógica compartida para arrancar el pipeline de un vídeo a partir de una idea
 * de la columna "Ideas": crea la carpeta del vídeo en _EN PRODUCCIÓN con la
 * estructura estándar + idea.md, construye el prompt de SARA y, según el modo,
 * lo lanza ya (`now`) o lo mete en la cola serial (`queue`).
 *
 * Usado por:
 *   - POST .../ideas/[id]/start-pipeline   (mode 'now')
 *   - POST .../ideas/start-queue           (mode 'queue', uno detrás de otro)
 */

import 'server-only';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Channel } from './channels';
import type { Idea } from './lab/types';
import { updateIdea } from './lab/ideas';
import { startJob } from './claude-jobs';
import { enqueue } from './job-queue';
import { buildSaraFromIdea, QUEUE_COMPLETION_INSTRUCTION, type VideoContext } from './prompts';
import { JARVIS_ROOT } from './config';

/** Quita caracteres ilegales de Windows pero conserva espacios y acentos. */
export function sanitizeFolderName(title: string): string {
  return title
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export type StartMode = 'now' | 'queue';

export interface StartIdeaResult {
  videoFolder: string;
  /** jobId si mode==='now'. */
  jobId?: string;
  /** id del item de cola si mode==='queue'. */
  queueItemId?: string;
}

/**
 * Crea la carpeta del vídeo para una idea y arranca/encola a SARA.
 * Lanza Error con mensaje legible si algo impide crear la carpeta (para que el
 * caller lo aísle por idea y siga con la siguiente).
 */
export function startPipelineForIdea(
  channel: Channel,
  idea: Idea,
  mode: StartMode,
): StartIdeaResult {
  const productionFolder = channel.stateFolders.production;
  if (!productionFolder) {
    throw new Error(`El canal ${channel.slug} no tiene carpeta de producción configurada.`);
  }
  const safeTitle = sanitizeFolderName(idea.title);
  if (safeTitle.length < 3) {
    throw new Error('El título de la idea es demasiado corto para crear carpeta.');
  }

  const videoDir = path.join(channel.rootPath, productionFolder, safeTitle);
  if (!existsSync(channel.rootPath)) {
    throw new Error(`No existe la raíz del canal en disco: ${channel.rootPath}`);
  }
  if (existsSync(videoDir)) {
    throw new Error(`Ya existe una carpeta con ese nombre: ${videoDir}`);
  }

  // Estructura mínima per convención H: del proyecto.
  const subdirs = [
    'RENDER',
    path.join('_PACKAGING', 'MINIATURAS'),
    path.join('01_BRUTOS', '_FOTO'),
    path.join('01_BRUTOS', '_LOCUCION'),
    path.join('01_BRUTOS', '_VÍDEO'),
  ];
  mkdirSync(videoDir, { recursive: true });
  for (const sub of subdirs) mkdirSync(path.join(videoDir, sub), { recursive: true });

  writeFileSync(
    path.join(videoDir, 'idea.md'),
    `# ${idea.title}\n\n` +
      `${idea.description}\n\n` +
      (idea.sourceVideoTitle
        ? `**Inspirada en:** ${idea.sourceVideoTitle}${idea.sourceVideoUrl ? ` (${idea.sourceVideoUrl})` : ''}\n\n`
        : '') +
      (idea.tags?.length ? `**Tags:** ${idea.tags.join(', ')}\n\n` : '') +
      `Canal: ${channel.name} (${channel.slug})\n` +
      `Idea iniciada como pipeline el ${new Date().toISOString()}.\n`,
    'utf-8',
  );

  const folderPathFwd = videoDir.replace(/\\/g, '/');
  const vctx: VideoContext = {
    channel: channel.slug,
    title: safeTitle,
    state: 'production',
    folderPath: videoDir,
  };
  const sara = buildSaraFromIdea(
    {
      title: idea.title,
      description: idea.description,
      sourceVideoTitle: idea.sourceVideoTitle ?? null,
      sourceVideoUrl: idea.sourceVideoUrl ?? null,
    },
    vctx,
  );
  const label = `SARA — idea: ${idea.title.slice(0, 40)}`;
  const startedAt = new Date().toISOString();

  if (mode === 'now') {
    const job = startJob({
      skill: 'sara',
      label,
      prompt: sara.prompt,
      cwd: sara.cwd ?? JARVIS_ROOT,
      videoFolder: folderPathFwd,
      timeoutMs: sara.timeoutMs,
      model: sara.model,
    });
    updateIdea(idea.id, {
      status: 'in-production',
      videoFolder: folderPathFwd,
      pipelineJobId: job.jobId,
      pipelineStartedAt: startedAt,
    });
    return { videoFolder: folderPathFwd, jobId: job.jobId };
  }

  // mode === 'queue': la cola procesa este vídeo DE PRINCIPIO A FIN (loop por
  // turnos hasta 100% o bloqueo) antes de pasar al siguiente. Si SARA se bloquea
  // en una decisión que requiere a Pablo, lo marca con <<<VIDEO_BLOCKED>>>, se
  // deja ese vídeo y la cola sigue con el siguiente (no bloquea la cola entera).
  const item = enqueue({
    skill: 'sara',
    label,
    videoFolder: folderPathFwd,
    videoTitle: safeTitle,
    prompt: sara.prompt + QUEUE_COMPLETION_INSTRUCTION,
    cwd: sara.cwd ?? JARVIS_ROOT,
    timeoutMs: sara.timeoutMs,
    model: sara.model,
    loopUntilComplete: true,
    maxAttempts: 6,
  });
  updateIdea(idea.id, {
    status: 'in-production',
    videoFolder: folderPathFwd,
    pipelineJobId: null,
    pipelineStartedAt: startedAt,
  });
  return { videoFolder: folderPathFwd, queueItemId: item.id };
}
