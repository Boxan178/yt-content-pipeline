'use client';

import { useState } from 'react';
import type { VideoState } from '@/lib/channels';
import type { Progress } from '@/lib/progress-types';
import { ProgressBar } from './ProgressBar';

export interface ActiveJob {
  jobId: string;
  skill: string;
  label: string;
  startedAt: string;
}

export interface VideoCardData {
  channel: string;
  title: string;
  displayTitle?: string | null;
  state: VideoState;
  folderPath: string;
  thumbnailUrl: string | null;
  renderOk: boolean;
  shortsCount: number;
  hasPackaging: boolean;
  mtime: string;
  warnings: string[];
  progress: Progress;
  activeJobs?: ActiveJob[];
  isCompilation?: boolean;
  compilationSources?: number;
  scheduledUpload?: {
    id: string;
    scheduledFor: string;
    status: 'pending' | 'uploading' | 'done';
    privacyOnPublish: 'public' | 'unlisted' | 'private';
    youtubeVideoId?: string;
  };
}

interface Props {
  video: VideoCardData;
  onArchived?: (video: VideoCardData) => void;
  onOpen?: (video: VideoCardData) => void;
  /** Si true, dibuja un ring verde animado + emoji 🎉 durante unos segundos. */
  celebrate?: boolean;
}

const RELATIVE = new Intl.RelativeTimeFormat('es-ES', { numeric: 'auto' });

function relTime(iso: string) {
  const d = new Date(iso).getTime();
  const diff = (d - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return RELATIVE.format(Math.round(diff), 'second');
  if (abs < 3600) return RELATIVE.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return RELATIVE.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return RELATIVE.format(Math.round(diff / 86400), 'day');
  if (abs < 86400 * 365) return RELATIVE.format(Math.round(diff / (86400 * 30)), 'month');
  return RELATIVE.format(Math.round(diff / (86400 * 365)), 'year');
}

export function VideoCard({ video, onArchived, onOpen, celebrate }: Props) {
  const [imgErr, setImgErr] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const archive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Archivar "${video.title}"? Mueve la carpeta de _SUBIDOS a _ARCHIVO.`)) return;
    setArchiving(true);
    try {
      const r = await fetch(
        `/api/channels/${encodeURIComponent(video.channel)}/videos/${encodeURIComponent(video.title)}/archive`,
        { method: 'POST' },
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${r.status}`);
      }
      onArchived?.(video);
    } catch (err) {
      alert(`Error al archivar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setArchiving(false);
    }
  };

  const open = () => onOpen?.(video);

  const activeJobs = video.activeJobs ?? [];
  const isWorking = activeJobs.length > 0;
  const inconsistent =
    (video.state === 'ready' || video.state === 'uploaded') && video.progress.percent < 100;

  const elapsedSec = isWorking
    ? Math.round((Date.now() - new Date(activeJobs[0].startedAt).getTime()) / 1000)
    : 0;
  const elapsedLabel = elapsedSec < 60
    ? `${elapsedSec}s`
    : `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`;

  return (
    <article
      onClick={open}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/x-ytcp-video', JSON.stringify({
          channel: video.channel,
          title: video.title,
          fromState: video.state,
        }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`group relative shrink-0 cursor-pointer overflow-hidden rounded-lg border bg-bg/60 transition ${
        celebrate
          ? 'border-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.4)] animate-toast-in'
          : isWorking
          ? 'border-red-500/70 shadow-[0_0_0_2px_rgba(239,68,68,0.25)] hover:border-red-400'
          : 'border-border hover:border-accent/60'
      }`}
    >
      {celebrate && (
        <span className="pointer-events-none absolute -top-2 -right-2 z-10 text-3xl animate-xp-bump">
          🎉
        </span>
      )}

      {/* Quick actions hover: quitados por petición de Pablo. El modal de
          detalle (click en la card) sigue teniendo todos los botones. */}
      <div className="relative h-32 w-full overflow-hidden bg-bg">
        {video.thumbnailUrl && !imgErr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            onError={() => setImgErr(true)}
            className="h-full w-full object-contain"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-zinc-500">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <span className="text-[10px]">sin miniatura</span>
          </div>
        )}
        <span className="absolute top-1.5 left-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-label text-white">
          {video.isCompilation
            ? video.compilationSources != null
              ? `📚 recop · ${video.compilationSources} hist`
              : '📚 recop'
            : 'long'}
        </span>
        {isWorking && (
          <div className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-label text-white shadow-lg">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            {activeJobs[0].label} · {elapsedLabel}
            {activeJobs.length > 1 && (
              <span
                className="ml-1 rounded bg-white/20 px-1 text-[10px]"
                title={activeJobs.slice(1).map((j) => j.label).join(' · ')}
              >
                +{activeJobs.length - 1}
              </span>
            )}
          </div>
        )}
        {video.scheduledUpload && (
          video.scheduledUpload.status === 'done' ? (
            <a
              href={
                video.scheduledUpload.youtubeVideoId
                  ? `https://studio.youtube.com/video/${video.scheduledUpload.youtubeVideoId}/edit`
                  : '#'
              }
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-label text-white shadow-lg transition hover:bg-emerald-400"
              title="Subido como OCULTO a YouTube — prográmalo desde Studio"
            >
              🔗 oculto
            </a>
          ) : (
            <div
              className={`absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-label text-white shadow-lg ${
                video.scheduledUpload.status === 'uploading' ? 'bg-orange-500' : 'bg-sky-500/90'
              }`}
              title={`Programado para ${new Date(video.scheduledUpload.scheduledFor).toLocaleString('es-ES')} · privacy ${video.scheduledUpload.privacyOnPublish}`}
            >
              📅 {video.scheduledUpload.status === 'uploading' ? 'subiendo' : 'prog'}
            </div>
          )
        )}
      </div>

      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-tight text-white" title={video.title}>
          {video.displayTitle || video.title}
        </h3>
        <p className="mt-1 text-[11px] text-muted">{relTime(video.mtime)}</p>

        <div className="mt-2 flex flex-wrap gap-1">
          {video.renderOk ? (
            <span className="rounded border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-300">
              render OK
            </span>
          ) : (
            <span className="rounded border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-[10px] text-yellow-300">
              sin render
            </span>
          )}
          {video.hasPackaging && (
            <span className="rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-300">
              packaging
            </span>
          )}
          {video.shortsCount > 0 && (
            <span className="rounded border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-300">
              + {video.shortsCount} shorts
            </span>
          )}
          {video.warnings.length > 0 && (
            <span
              className="rounded border border-zinc-600 bg-zinc-700/40 px-1.5 py-0.5 text-[10px] text-zinc-300"
              title={video.warnings.join(' · ')}
            >
              ⚠ {video.warnings.length}
            </span>
          )}
          {inconsistent && (
            <span
              className="rounded border border-orange-500/50 bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange-300"
              title={`Estado inconsistente: el vídeo está en "${video.state === 'ready' ? 'LISTOS PARA SUBIR' : 'SUBIDOS'}" pero su progreso es ${video.progress.hits}/${video.progress.total}. Debería estar en EN PRODUCCIÓN hasta completar todos los hitos.`}
            >
              ⚠ {video.progress.hits}/{video.progress.total} incompleto
            </span>
          )}
        </div>

        <div className="mt-3">
          <ProgressBar progress={video.progress} />
        </div>

        {video.state === 'uploaded' && (
          <button
            onClick={archive}
            disabled={archiving}
            className="mt-3 w-full rounded border border-border bg-bg px-2 py-1.5 text-xs text-muted transition hover:border-accent/60 hover:text-white disabled:opacity-50"
          >
            {archiving ? 'Archivando…' : 'Archivar'}
          </button>
        )}
      </div>
    </article>
  );
}
