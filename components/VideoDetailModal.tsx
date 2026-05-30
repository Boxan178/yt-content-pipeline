'use client';

import { useEffect, useMemo, useState } from 'react';
import { PackagingSections } from './PackagingSections';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { VideoCardData } from './VideoCard';
import { ChecklistPanel } from './ChecklistPanel';
import { PabloDecisionsPanel } from './PabloDecisionsPanel';
import { VerifyLocucionButton } from './VerifyLocucionButton';
import { ShortsGrid } from './ShortsGrid';
import { parsePabloDecisions } from '@/lib/parse-pablo-decisions';
import { ClaudeRunButton } from './ClaudeRunButton';
import { ThumbnailsPanel } from './ThumbnailsPanel';
import { parseChecklists } from '@/lib/parse-checkboxes';
import { buildElenaAudit, buildSaraResume, buildAmeliaAudit, buildMarcusReview, buildLuisRender, buildCaliopeFullAudio, buildMarcosTitles, buildUploadToYoutube, buildMarioStrategy, buildTest72hPostMortem, type VideoContext } from '@/lib/prompts';

interface FileEntry {
  name: string;
  relPath: string;
  size: number;
  ext: string;
  mtime: string;
}

interface DetailResponse {
  channel: string;
  title: string;
  folderPath: string;
  stateFolder: string;
  packagingMd: string | null;
  counts: { videos: number; audios: number; images: number };
  renderPrincipal: FileEntry | null;
  shorts: FileEntry[];
  audios: FileEntry[];
  images: FileEntry[];
  allFiles: FileEntry[];
}

interface Props {
  video: VideoCardData;
  onClose: () => void;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  return Promise.reject(new Error('Clipboard API not available'));
}

export function VideoDetailModal({ video, onClose }: Props) {
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audioIdx, setAudioIdx] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reloadDetail = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    const enc = (s: string) => encodeURIComponent(s);
    fetch(`/api/channels/${enc(video.channel)}/videos/${enc(video.title)}/detail`)
      .then(async (r) => {
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d) => setDetail(d as DetailResponse))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [video.channel, video.title, reloadKey]);

  // Esc para cerrar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((c) => (c === msg ? null : c)), 2500);
  };

  const mediaUrl = (relPath: string) =>
    `/api/channels/${encodeURIComponent(video.channel)}/videos/${encodeURIComponent(video.title)}/media?file=${encodeURIComponent(relPath)}`;

  const openFolder = async () => {
    try {
      const r = await fetch(
        `/api/channels/${encodeURIComponent(video.channel)}/videos/${encodeURIComponent(video.title)}/open-folder`,
        { method: 'POST' },
      );
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || `HTTP ${r.status}`);
      }
      flash('Carpeta abierta en Explorer.');
    } catch (e) {
      alert(`Error al abrir carpeta: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const copyPath = async (p: string) => {
    try {
      await copyToClipboard(p);
      flash('Ruta copiada.');
    } catch {
      alert(`No pude copiar. Ruta:\n${p}`);
    }
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-premium my-8 w-full max-w-7xl overflow-hidden rounded-[28px]"
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-label text-zinc-500">
              {video.state}{detail?.stateFolder ? ` · ${detail.stateFolder}` : ''}
            </p>
            <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-display text-white">
              {video.title}
            </h1>
            {detail?.folderPath && (
              <button
                onClick={() => copyPath(detail.folderPath)}
                className="mt-1.5 flex max-w-full items-center gap-1.5 truncate font-mono text-[11px] text-zinc-500 transition hover:text-white"
                title={detail.folderPath}
              >
                <IconCopy />
                <span className="truncate">{detail.folderPath}</span>
              </button>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {(() => {
              const pct = video.progress?.percent ?? 0;
              const ready = pct >= 80;
              const reason = !ready
                ? `Necesitas al menos 80% de progreso para subir (ahora ${pct}%).`
                : undefined;
              return (
                <a
                  href={
                    ready
                      ? `/upload?channel=${encodeURIComponent(video.channel)}&video=${encodeURIComponent(video.title)}`
                      : '#'
                  }
                  onClick={(e) => {
                    if (!ready) e.preventDefault();
                  }}
                  title={reason || 'Configurar subida a YouTube'}
                  className={
                    ready
                      ? 'btn-gold'
                      : 'btn-glass cursor-not-allowed opacity-60'
                  }
                >
                  <IconUpload />
                  Subir
                </a>
              );
            })()}
            <button onClick={openFolder} className="btn-glass" title="Abrir carpeta en Explorer">
              <IconFolder />
              Abrir carpeta
            </button>
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
              title="Cerrar (Esc)"
            >
              <IconClose />
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-3">
          {/* Left column: media + packaging (2/3 del ancho en md+) */}
          <div className="flex flex-col gap-6 md:col-span-2">
            {/* Render principal */}
            <section>
              <h2 className="mb-3 text-[11px] font-medium uppercase tracking-label text-zinc-500">
                Render principal
              </h2>
              {loading ? (
                <div className="glass flex h-40 items-center justify-center rounded-3xl text-zinc-500">
                  Cargando…
                </div>
              ) : detail?.renderPrincipal ? (
                <div className="mx-auto w-full max-w-3xl">
                  <video
                    controls
                    preload="metadata"
                    className="max-h-[55vh] w-full rounded-2xl border border-white/10 bg-black"
                    src={mediaUrl(detail.renderPrincipal.relPath)}
                  />
                  <p className="mt-2 font-mono text-[11px] text-zinc-500">
                    {detail.renderPrincipal.name} · {formatBytes(detail.renderPrincipal.size)}
                  </p>
                </div>
              ) : (
                <div className="glass rounded-3xl px-4 py-8 text-center text-sm text-zinc-500">
                  Sin render principal
                </div>
              )}
            </section>

            {/* Miniaturas: galería + botón generar */}
            {detail && (
              <ThumbnailsPanel
                channel={video.channel}
                videoTitle={video.title}
                videoFolder={detail.folderPath.replace(/\\/g, '/')}
                ctx={{
                  channel: video.channel,
                  title: video.title,
                  state: video.state,
                  folderPath: detail.folderPath,
                  progress: video.progress,
                }}
                miniaturesImages={detail.images}
              />
            )}

            {/* Shorts derivados (reproductores inline) */}
            {detail && detail.shorts.length > 0 && (
              <ShortsGrid shorts={detail.shorts} mediaUrlFor={mediaUrl} />
            )}

            {/* Locución (audios) */}
            {detail && detail.audios.length > 0 && (
              <section>
                <h2 className="mb-3 text-[11px] font-medium uppercase tracking-label text-zinc-500">
                  Locución <span className="nums text-zinc-400">({detail.audios.length})</span>
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {detail.audios.map((a, i) => (
                    <button
                      key={a.relPath}
                      onClick={() => setAudioIdx(i)}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        audioIdx === i
                          ? 'border-accent/50 bg-accent/15 text-accent'
                          : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {a.name.replace(/\.[^.]+$/, '')}
                    </button>
                  ))}
                </div>
                {detail.audios[audioIdx] && (
                  <div className="mt-3 glass rounded-2xl p-3">
                    <audio
                      controls
                      preload="metadata"
                      className="w-full"
                      src={mediaUrl(detail.audios[audioIdx].relPath)}
                    />
                    <p className="mt-2 font-mono text-[11px] text-zinc-500">
                      {detail.audios[audioIdx].name} · {formatBytes(detail.audios[audioIdx].size)}
                    </p>
                  </div>
                )}
                <VerifyLocucionButton folder={detail.folderPath.replace(/\\/g, '/')} />
              </section>
            )}

            {/* Packaging.md — secciones colapsables */}
            {detail?.packagingMd ? (
              <section>
                <h2 className="mb-3 text-[11px] font-medium uppercase tracking-label text-zinc-500">
                  packaging.md
                </h2>
                <PackagingSections markdown={detail.packagingMd} />
              </section>
            ) : detail ? (
              <section>
                <div className="glass rounded-3xl px-4 py-8 text-center text-sm text-zinc-500">
                  Sin packaging.md
                </div>
              </section>
            ) : null}
          </div>

          {/* Right column: render panel + file lists + meta (1/3 del ancho en md+) */}
          <aside className="flex flex-col gap-4 md:col-span-1">
            {error && (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            {detail && (() => {
              const ctx: VideoContext = {
                channel: video.channel,
                title: video.title,
                state: video.state,
                folderPath: detail.folderPath,
                progress: video.progress,
              };
              const sara = buildSaraResume(ctx);
              const elena = buildElenaAudit(ctx);
              const amelia = buildAmeliaAudit(ctx);
              const marcus = buildMarcusReview(ctx);
              const luis = buildLuisRender(ctx);
              const caliope = buildCaliopeFullAudio(ctx);
              const marcos = buildMarcosTitles(ctx);
              const upload = buildUploadToYoutube(ctx);
              const mario = buildMarioStrategy(ctx);
              // Calcular horas desde publicación si está en estado 'uploaded'
              const hoursSincePublished = video.state === 'uploaded'
                ? Math.round((Date.now() - new Date(video.mtime).getTime()) / 3600000)
                : 0;
              const test72h = buildTest72hPostMortem(ctx, hoursSincePublished);
              const test72hDisabled = video.state !== 'uploaded'
                ? 'Solo aplica a vídeos ya subidos (estado uploaded).'
                : hoursSincePublished < 72
                ? `Espera al menos 72h desde la publicación. Llevan ~${hoursSincePublished}h.`
                : undefined;
              const hasRender = !!detail.renderPrincipal;
              const hasAnyAudio = (detail.audios?.length ?? 0) > 0;
              const det = video.progress.details;
              const elenaDisabled = !det.scriptWritten
                ? 'ELENA no encuentra guion: ni packaging.md (>2KB) ni text en tts-jobs.json (sleep story). Genera o vincula el guion primero.'
                : undefined;
              const ameliaDisabled = !det.renderPrincipal
                ? 'AMELIA audita el render. Aún no hay RENDER/*.mp4 final > 50MB.'
                : undefined;
              const marcusDisabled = !det.renderPrincipal
                ? 'MARCUS HALE necesita el render final para hacer el viewer-test.'
                : undefined;
              const luisDisabled = !det.locucionReady
                ? 'LUIS necesita la locución lista (hito 3/6): un único MP3 largo en _LOCUCION/ vale, o varios chunks. Si ya hay audio y sigue bloqueado, pulsa "Verificar locución". Si falta, pasa por CALIOPE.'
                : !det.scriptWritten
                ? 'LUIS necesita el guion para el forced alignment de subs. Falta el guion.'
                : undefined;
              const uploadDisabled = !det.renderPrincipal
                ? 'Para subir necesitas un render principal en RENDER/ (>50MB).'
                : !det.miniaturaFinal
                ? 'Para subir necesitas una miniatura final en _PACKAGING/MINIATURAS/.'
                : undefined;
              return (
                <section className="glass rounded-3xl p-4">
                  <h3 className="mb-3 text-[11px] font-medium uppercase tracking-label text-zinc-500">
                    Pipeline con Claude
                  </h3>
                  <div className="space-y-3">
                    <ClaudeRunButton
                      label="Retomar pipeline con SARA"
                      hint="SARA diagnostica el estado del vídeo y orquesta a quien corresponda. Siempre activa (su trabajo es arreglar lo que falte). Hasta 30 min."
                      prompt={sara.prompt}
                      cwd={sara.cwd}
                      videoFolder={detail.folderPath.replace(/\\/g, '/')}
                      skill="sara"
                      jobLabel="SARA"
                      timeoutMs={sara.timeoutMs}
                      model={sara.model}
                      variant="primary"
                    />
                    <ClaudeRunButton
                      label="Auditar guion con ELENA"
                      hint="Skill script-auditor sobre el guion. 1-3 min."
                      prompt={elena.prompt}
                      cwd={elena.cwd}
                      videoFolder={detail.folderPath.replace(/\\/g, '/')}
                      skill="elena"
                      jobLabel="ELENA"
                      timeoutMs={elena.timeoutMs}
                      model={elena.model}
                      disabledReason={elenaDisabled}
                      variant="subtle"
                    />
                    {hasRender && (
                      <ClaudeRunButton
                        label="QA del vídeo con AMELIA"
                        hint="Audita el render como producto digital."
                        prompt={amelia.prompt}
                        cwd={amelia.cwd}
                        videoFolder={detail.folderPath.replace(/\\/g, '/')}
                        skill="amelia"
                        jobLabel="AMELIA"
                        timeoutMs={amelia.timeoutMs}
                        model={amelia.model}
                        disabledReason={ameliaDisabled}
                        variant="subtle"
                      />
                    )}
                    {hasRender && (
                      <ClaudeRunButton
                        label="Review de MARCUS HALE (viewer)"
                        hint="Test del vídeo desde la perspectiva del viewer-persona MARCUS HALE."
                        prompt={marcus.prompt}
                        cwd={marcus.cwd}
                        videoFolder={detail.folderPath.replace(/\\/g, '/')}
                        skill="marcus-hale"
                        jobLabel="MARCUS"
                        timeoutMs={marcus.timeoutMs}
                        model={marcus.model}
                        disabledReason={marcusDisabled}
                        variant="subtle"
                      />
                    )}
                    <ClaudeRunButton
                      label={hasAnyAudio ? 'Completar locución con CALIOPE' : 'Generar locución con CALIOPE'}
                      hint={hasAnyAudio
                        ? 'CALIOPE compara los mp3s existentes con el tts-jobs.json y genera los chunks que falten via Algrow MCP.'
                        : 'CALIOPE busca el tts-jobs.json del vídeo y genera todos los chunks via Algrow MCP.'}
                      prompt={caliope.prompt}
                      cwd={caliope.cwd}
                      videoFolder={detail.folderPath.replace(/\\/g, '/')}
                      skill="caliope"
                      jobLabel="CALIOPE"
                      timeoutMs={caliope.timeoutMs}
                      model={caliope.model}
                      variant="subtle"
                    />
                    <ClaudeRunButton
                      label="Diagnóstico estratégico (MARIO)"
                      hint="MARIO valida topic + busca outliers + estima targets CTR/AVD + da veredicto GO/PIVOT/STOP. Útil antes de empezar producción."
                      prompt={mario.prompt}
                      cwd={mario.cwd}
                      videoFolder={detail.folderPath.replace(/\\/g, '/')}
                      skill="mario"
                      jobLabel="MARIO"
                      timeoutMs={mario.timeoutMs}
                      model={mario.model}
                      loop={mario.loop}
                      variant="subtle"
                    />
                    {video.state === 'uploaded' && (
                      <ClaudeRunButton
                        label="Post-mortem 72h (test-72h)"
                        hint="Pull de YouTube Analytics + comparativa vs target + propuestas de iteración (title v2 / thumb v2). Solo aplica >72h post-publicación."
                        prompt={test72h.prompt}
                        cwd={test72h.cwd}
                        videoFolder={detail.folderPath.replace(/\\/g, '/')}
                        skill="test-72h"
                        jobLabel="test-72h"
                        timeoutMs={test72h.timeoutMs}
                        model={test72h.model}
                        loop={test72h.loop}
                        disabledReason={test72hDisabled}
                        variant="subtle"
                      />
                    )}
                    <ClaudeRunButton
                      label="Proponer títulos con MARCOS"
                      hint="MARCOS genera 4 rutas de título (curiosidad / search / tensión / híbrido) y recomienda una. 1-3 min."
                      prompt={marcos.prompt}
                      cwd={marcos.cwd}
                      videoFolder={detail.folderPath.replace(/\\/g, '/')}
                      skill="marcos"
                      jobLabel="MARCOS"
                      timeoutMs={marcos.timeoutMs}
                      model={marcos.model}
                      variant="subtle"
                    />
                    <ClaudeRunButton
                      label="Subir a YouTube (privado)"
                      hint="Usa youtube-seo-optimizer: sube el render + miniatura + metadata como BORRADOR privado. Te paso el link para que apruebes y publiques manualmente."
                      prompt={upload.prompt}
                      cwd={upload.cwd}
                      videoFolder={detail.folderPath.replace(/\\/g, '/')}
                      skill="upload-youtube"
                      jobLabel="Upload YT"
                      timeoutMs={upload.timeoutMs}
                      model={upload.model}
                      loop={upload.loop}
                      disabledReason={uploadDisabled}
                      variant="subtle"
                    />
                    <ClaudeRunButton
                      label="Editar vídeo con LUIS"
                      hint="Pipeline completo de edición: render con forced alignment + auto-audit visual + AMELIA + MARCUS HALE + mover a PENDIENTE DE REVISAR + assign-task. 25-40 min."
                      prompt={luis.prompt}
                      cwd={luis.cwd}
                      videoFolder={detail.folderPath.replace(/\\/g, '/')}
                      skill="luis"
                      jobLabel="LUIS"
                      timeoutMs={luis.timeoutMs}
                      model={luis.model}
                      loop={luis.loop}
                      disabledReason={luisDisabled}
                      variant="primary"
                    />
                  </div>
                </section>
              );
            })()}

            {detail?.packagingMd && (
              <PabloDecisionsPanel
                decisions={parsePabloDecisions(detail.packagingMd)}
                videoFolder={detail.folderPath.replace(/\\/g, '/')}
                thumbnailOptions={detail.images
                  .filter((img) => /(^|\/)_PACKAGING\/MINIATURAS\//i.test(img.relPath))
                  .map((img) => ({ name: img.name, url: mediaUrl(img.relPath) }))}
                onResolved={reloadDetail}
              />
            )}

            {detail?.packagingMd && (
              <ChecklistPanel
                items={parseChecklists(detail.packagingMd)}
                ctx={{
                  channel: video.channel,
                  title: video.title,
                  state: video.state,
                  folderPath: detail.folderPath,
                  progress: video.progress,
                }}
                thumbnailOptions={detail.images
                  .filter((img) => /(^|\/)_PACKAGING\/MINIATURAS\//i.test(img.relPath))
                  .map((img) => ({ name: img.name, url: mediaUrl(img.relPath) }))}
                onResolved={reloadDetail}
              />
            )}

            {detail && (
              <>
                <section className="glass rounded-3xl p-4">
                  <h3 className="mb-3 text-[11px] font-medium uppercase tracking-label text-zinc-500">
                    Resumen
                  </h3>
                  <ul className="space-y-1.5 text-sm text-zinc-300">
                    <li className="flex items-center justify-between">
                      <span>Vídeos</span>
                      <span className="nums font-display font-medium text-white">{detail.counts.videos}</span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>Audios</span>
                      <span className="nums font-display font-medium text-white">{detail.counts.audios}</span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>Imágenes</span>
                      <span className="nums font-display font-medium text-white">{detail.counts.images}</span>
                    </li>
                  </ul>
                </section>

                <section className="glass rounded-3xl p-4">
                  <h3 className="mb-3 text-[11px] font-medium uppercase tracking-label text-zinc-500">
                    Archivos <span className="nums normal-case tracking-normal text-zinc-400">({detail.allFiles.length})</span>
                  </h3>
                  <ul className="max-h-80 space-y-1 overflow-y-auto pr-2">
                    {detail.allFiles.map((f) => (
                      <li key={f.relPath} className="flex items-start justify-between gap-2 rounded-md px-2 py-1 hover:bg-white/5">
                        <button
                          onClick={() => copyPath(`${detail.folderPath}/${f.relPath}`.replace(/\//g, '\\'))}
                          className="min-w-0 flex-1 truncate text-left font-mono text-[11px] text-zinc-400 transition hover:text-white"
                          title={`Copiar ruta · ${f.relPath}`}
                        >
                          {f.relPath}
                        </button>
                        <span className="nums shrink-0 font-mono text-[10px] text-zinc-500">
                          {formatBytes(f.size)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}
          </aside>
        </div>

        {toast && (
          <div className="glass-premium animate-toast-in pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-2xl px-4 py-2 text-sm text-white">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────── SVG icons ─────────────── */
function IconCopy() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
function IconUpload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v12M6 10l6-6 6 6M4 20h16" />
    </svg>
  );
}
function IconFolder() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
