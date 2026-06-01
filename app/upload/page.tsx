'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { extractMetadata } from '@/lib/extract-metadata';

interface DetailResponse {
  ok?: boolean;
  folderPath?: string;
  packagingMd?: string | null;
  images?: Array<{ name: string; relPath: string; size: number; ext: string; mtime: string }>;
  renderPrincipal?: string | null;
  progress?: { percent: number; hits: number; total: number };
}

type Privacy = 'public' | 'unlisted' | 'private';

interface PresetDate {
  label: string;
  iso: string;
  hint: string;
}

function buildPresets(): PresetDate[] {
  const presets: PresetDate[] = [];
  const now = new Date();
  // Hoy 19:00
  const today19 = new Date(now);
  today19.setHours(19, 0, 0, 0);
  if (today19.getTime() > now.getTime()) {
    presets.push({ label: 'Hoy 19:00', iso: today19.toISOString(), hint: 'Prime time noche' });
  }
  // Mañana 12:00
  const tom12 = new Date(now);
  tom12.setDate(tom12.getDate() + 1);
  tom12.setHours(12, 0, 0, 0);
  presets.push({ label: 'Mañana 12:00', iso: tom12.toISOString(), hint: 'Mediodía' });
  // Próximo sábado 11:00
  const sat11 = new Date(now);
  const daysUntilSat = (6 - sat11.getDay() + 7) % 7 || 7;
  sat11.setDate(sat11.getDate() + daysUntilSat);
  sat11.setHours(11, 0, 0, 0);
  presets.push({ label: `Sábado ${sat11.getDate()}/${sat11.getMonth() + 1} 11:00`, iso: sat11.toISOString(), hint: 'Fin de semana' });
  // Próximo lunes 09:00
  const mon9 = new Date(now);
  const daysUntilMon = (1 - mon9.getDay() + 7) % 7 || 7;
  mon9.setDate(mon9.getDate() + daysUntilMon);
  mon9.setHours(9, 0, 0, 0);
  presets.push({ label: `Lunes ${mon9.getDate()}/${mon9.getMonth() + 1} 09:00`, iso: mon9.toISOString(), hint: 'Empieza la semana' });
  return presets;
}

/** Convierte ISO → input "datetime-local" (zona local). */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Convierte input "datetime-local" → ISO. */
function localInputToIso(local: string): string {
  return new Date(local).toISOString();
}

// Next 14 exige envolver useSearchParams() en <Suspense> para prerender
// estático. UploadPage es client-only y se prerenderiza con loading shell.
export default function UploadPageWrapper() {
  return (
    <Suspense
      fallback={
        <main className="flex h-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
        </main>
      }
    >
      <UploadPage />
    </Suspense>
  );
}

function UploadPage() {
  const router = useRouter();
  const params = useSearchParams();
  const channel = params?.get('channel') ?? '';
  const videoTitle = params?.get('video') ?? '';
  // Fecha preseleccionada al llegar desde el calendario (drag de un vídeo listo).
  const dateParam = params?.get('date') ?? '';

  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string>('');
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [scheduleMode, setScheduleMode] = useState<'now' | 'scheduled'>('now');
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [busy, setBusy] = useState(false);
  const [successId, setSuccessId] = useState<string | null>(null);

  const presets = useMemo(buildPresets, []);

  const load = useCallback(async () => {
    if (!channel || !videoTitle) return;
    try {
      const r = await fetch(
        `/api/channels/${encodeURIComponent(channel)}/videos/${encodeURIComponent(videoTitle)}/detail`,
        { cache: 'no-store' },
      );
      const data = (await r.json()) as DetailResponse;
      setDetail(data);
      // Pre-rellenar
      if (data.packagingMd) {
        const meta = extractMetadata(data.packagingMd);
        if (meta.title) setTitle(meta.title);
        else setTitle(videoTitle);
        if (meta.description) setDescription(meta.description);
        if (meta.tags.length > 0) setTags(meta.tags.join(', '));
      } else {
        setTitle(videoTitle);
      }
      // Cargar miniatura actual (la marcada con .selected-thumb o la última)
      try {
        const sr = await fetch(
          `/api/channels/${encodeURIComponent(channel)}/videos/${encodeURIComponent(videoTitle)}/select-thumbnail`,
          { cache: 'no-store' },
        );
        const sd = await sr.json();
        if (sd.ok && sd.selected) setThumbnail(sd.selected);
        else {
          // Coger la más reciente
          const minis = (data.images ?? []).filter(
            (i) =>
              i.relPath.toUpperCase().includes('_PACKAGING/MINIATURAS/') ||
              i.relPath.toUpperCase().includes('_PACKAGING\\MINIATURAS\\'),
          );
          if (minis[0]) setThumbnail(minis[0].name);
        }
      } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, [channel, videoTitle]);

  useEffect(() => {
    load();
  }, [load]);

  // Si venimos del calendario con ?date=, arrancamos en modo Programar con esa
  // fecha ya puesta (programación nativa de YouTube vía publishAt).
  useEffect(() => {
    if (dateParam && !Number.isNaN(Date.parse(dateParam))) {
      setScheduleMode('scheduled');
      setScheduledLocal(isoToLocalInput(dateParam));
    }
  }, [dateParam]);

  const miniatures = useMemo(() => {
    return (detail?.images ?? []).filter(
      (i) =>
        i.relPath.toUpperCase().includes('_PACKAGING/MINIATURAS/') ||
        i.relPath.toUpperCase().includes('_PACKAGING\\MINIATURAS\\'),
    );
  }, [detail]);

  const goBack = () => {
    router.push(`/channels/${encodeURIComponent(channel)}`);
  };

  const generateMore = () => {
    // Volver al kanban — Pablo abre el modal del vídeo y pulsa NORA+IRIS desde ahí
    router.push(`/channels/${encodeURIComponent(channel)}`);
  };

  const submit = async () => {
    if (!detail?.folderPath) return;
    if (!title.trim() || !thumbnail) {
      setError('Necesitas título y una miniatura seleccionada');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const isScheduled = scheduleMode === 'scheduled';
      let publishAt: string | undefined;
      if (isScheduled) {
        if (!scheduledLocal) {
          setError('Elige la fecha/hora de publicación');
          setBusy(false);
          return;
        }
        publishAt = localInputToIso(scheduledLocal);
        if (new Date(publishAt).getTime() <= Date.now()) {
          setError('La fecha de publicación debe ser futura');
          setBusy(false);
          return;
        }
      }
      // El archivo se sube YA (mientras el PC está encendido). Si es programado,
      // YouTube lo publica SOLO en publishAt (sin PC a esa hora); exige public.
      const scheduledFor = new Date(Date.now() + 30 * 1000).toISOString();
      const r = await fetch('/api/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoFolder: detail.folderPath.replace(/\\/g, '/'),
          videoTitle,
          channel,
          title: title.trim(),
          description: description.trim(),
          tags: tags
            .split(',')
            .map((t) => t.trim().replace(/^#/, ''))
            .filter(Boolean),
          thumbnailFilename: thumbnail,
          privacyOnPublish: isScheduled ? 'public' : privacy,
          scheduledFor,
          publishAt,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setError(data.error || `HTTP ${r.status}`);
      } else {
        setSuccessId(data.item.id);
        setTimeout(() => router.push('/scheduled'), 1500);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  if (!channel || !videoTitle) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10 text-sm text-zinc-400">
        Faltan parámetros channel / video.
      </main>
    );
  }
  if (loading) {
    return (
      <main className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
      </main>
    );
  }

  if (successId) {
    const wasScheduled = scheduleMode === 'scheduled';
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <div className="text-5xl">✓</div>
        <h1 className="mt-3 text-xl font-bold text-white">
          {wasScheduled ? 'Programado' : 'Subiendo'}
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          {wasScheduled
            ? 'Te llevamos a la cola de programados en un momento…'
            : 'El vídeo se está subiendo. Te llevamos a la cola en un momento…'}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-6">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <button onClick={goBack} className="mb-2 text-xs text-zinc-400 hover:text-white">
            ← Volver al canal
          </button>
          <h1 className="truncate text-2xl font-bold text-white">📤 Subir a YouTube</h1>
          <p className="mt-1 truncate text-sm text-zinc-400" title={videoTitle}>{videoTitle}</p>
        </div>
        <Link
          href="/scheduled"
          className="rounded-md border border-border bg-bg px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
        >
          Cola programada →
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Columna izquierda: metadata */}
        <section className="space-y-5 lg:col-span-2">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-400">
              Título
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-white focus:border-accent/60 focus:outline-none"
            />
            <p className="mt-0.5 text-right text-[10px] text-zinc-500">{title.length}/100</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-400">
              Descripción
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={10}
              maxLength={5000}
              className="w-full rounded border border-border bg-bg px-3 py-2 text-sm leading-relaxed text-white focus:border-accent/60 focus:outline-none"
              placeholder="Descripción del vídeo…"
            />
            <p className="mt-0.5 text-right text-[10px] text-zinc-500">{description.length}/5000</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-400">
              Tags / hashtags <span className="text-zinc-500">(separados por coma)</span>
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-white focus:border-accent/60 focus:outline-none"
              placeholder="estoicismo, marco aurelio, filosofía..."
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-400">
              Privacy
            </label>
            <div className={`flex gap-2 ${scheduleMode === 'scheduled' ? 'opacity-50' : ''}`}>
              {(['public', 'unlisted', 'private'] as Privacy[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPrivacy(p)}
                  disabled={scheduleMode === 'scheduled'}
                  className={`flex-1 rounded border px-3 py-2 text-sm transition disabled:cursor-not-allowed ${
                    privacy === p
                      ? 'border-accent/60 bg-accent/10 text-accent'
                      : 'border-border bg-bg text-zinc-300 hover:border-accent/40'
                  }`}
                >
                  {p === 'public' && '🌍 Público'}
                  {p === 'unlisted' && '🔗 No listado'}
                  {p === 'private' && '🔒 Privado'}
                </button>
              ))}
            </div>
            {scheduleMode === 'scheduled' && (
              <p className="mt-1 text-[10px] text-amber-300/80">
                En modo Programar se sube como 🌍 Público con publicación diferida (lo exige YouTube).
              </p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-400">
              ¿Cuándo publicar?
            </label>
            <div className="mb-2 flex gap-2">
              <button
                onClick={() => setScheduleMode('now')}
                className={`flex-1 rounded border px-3 py-2 text-sm transition ${
                  scheduleMode === 'now'
                    ? 'border-accent/60 bg-accent/10 text-accent'
                    : 'border-border bg-bg text-zinc-300 hover:border-accent/40'
                }`}
              >
                ⚡ Subir ya
              </button>
              <button
                onClick={() => setScheduleMode('scheduled')}
                className={`flex-1 rounded border px-3 py-2 text-sm transition ${
                  scheduleMode === 'scheduled'
                    ? 'border-accent/60 bg-accent/10 text-accent'
                    : 'border-border bg-bg text-zinc-300 hover:border-accent/40'
                }`}
              >
                📅 Programar
              </button>
            </div>
            {scheduleMode === 'scheduled' && (
              <>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  {presets.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => setScheduledLocal(isoToLocalInput(p.iso))}
                      className="rounded border border-border bg-bg px-2 py-1.5 text-left text-xs text-zinc-300 hover:border-accent/40"
                    >
                      <div className="font-medium text-white">{p.label}</div>
                      <div className="text-[10px] text-zinc-500">{p.hint}</div>
                    </button>
                  ))}
                </div>
                <input
                  type="datetime-local"
                  value={scheduledLocal}
                  onChange={(e) => setScheduledLocal(e.target.value)}
                  className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-white focus:border-accent/60 focus:outline-none"
                />
                <p className="mt-1 text-[10px] text-zinc-500">
                  Programación <b>nativa de YouTube</b>: se sube ahora (con el PC encendido) y YouTube
                  lo publica solo en esa fecha — <b>no hace falta el PC encendido a esa hora</b>. Se
                  publica como 🌍 Público. Sin límite de 30 días.
                </p>
              </>
            )}
          </div>
        </section>

        {/* Columna derecha: miniatura */}
        <aside className="space-y-3 lg:col-span-1">
          <div>
            <label className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-zinc-400">
              <span>Miniatura ({miniatures.length})</span>
              <button
                onClick={generateMore}
                className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent hover:bg-accent/20"
                title="Volver al kanban para generar otra con NORA+IRIS"
              >
                + Generar otra
              </button>
            </label>
            {miniatures.length === 0 ? (
              <p className="rounded border border-dashed border-border px-3 py-4 text-center text-xs text-zinc-500">
                No hay miniaturas. Vuelve al canal y genera con NORA+IRIS.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {miniatures.map((img) => {
                  const isPicked = thumbnail === img.name;
                  return (
                    <button
                      key={img.relPath}
                      onClick={() => setThumbnail(img.name)}
                      className={`overflow-hidden rounded border transition ${
                        isPicked ? 'border-accent ring-2 ring-accent/40' : 'border-border hover:border-accent/40'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/channels/${encodeURIComponent(channel)}/videos/${encodeURIComponent(videoTitle)}/media?file=${encodeURIComponent(img.relPath)}`}
                        alt=""
                        className="aspect-video w-full bg-black object-contain"
                      />
                      <p className="line-clamp-1 px-1 py-0.5 text-[10px] text-zinc-300" title={img.name}>
                        {img.name}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {detail?.progress && detail.progress.percent < 100 && (
            <div className="rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200">
              ⚠ Progreso del vídeo: {detail.progress.percent}% ({detail.progress.hits}/{detail.progress.total}).
              Asegúrate de que esté completo antes de publicar.
            </div>
          )}
        </aside>
      </div>

      {error && (
        <div className="mt-5 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <footer className="mt-6 flex items-center justify-end gap-2 border-t border-border pt-5">
        <button
          onClick={goBack}
          disabled={busy}
          className="rounded border border-border bg-bg px-4 py-2 text-sm text-zinc-400 hover:text-white disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={submit}
          disabled={busy || !title.trim() || !thumbnail}
          className="rounded border border-accent/40 bg-accent/10 px-5 py-2 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
        >
          {busy
            ? 'Guardando…'
            : scheduleMode === 'now'
            ? '⚡ Subir ahora'
            : '📅 Programar subida'}
        </button>
      </footer>
    </main>
  );
}
