"use client";

// Esta vista vive bajo /automator/proyectos dentro de yt-content-pipeline.
// El header, sidebar y nav los pone el layout root — aquí solo metemos el contenido.

import Link from "next/link";
import { useEffect, useState } from "react";

interface Project {
  name: string;
  created_at: number;
  images_count: number;
  videos_count: number;
  total_bytes: number;
  drive_folder_id?: string | null;
  drive_url?: string | null;
}

interface Response {
  projects: Project[];
  output_root?: string;
  error?: string;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function FolderIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProjectCard({ p }: { p: Project }) {
  const total = p.images_count + p.videos_count;
  const openHref = `/automator?project=${encodeURIComponent(p.name)}`;
  return (
    <div className="card-panel p-4 hover:border-zinc-700 transition-colors group">
      <Link href={openHref} className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-md bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
          <FolderIcon className="w-5 h-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-zinc-100 truncate group-hover:text-white">
            {p.name}
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">{formatDate(p.created_at)}</div>
        </div>
      </Link>
      <div className="flex items-center gap-2 mt-3">
        {p.images_count > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px]">
            <span className="w-1 h-1 rounded-full bg-emerald-400" />
            {p.images_count} img
          </span>
        )}
        {p.videos_count > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[10px]">
            <span className="w-1 h-1 rounded-full bg-blue-400" />
            {p.videos_count} vid
          </span>
        )}
        <span className="ml-auto text-[10px] text-zinc-500">{formatBytes(p.total_bytes)}</span>
      </div>
      {total > 0 && (
        <div className="mt-3 h-0.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-red-500 to-red-400"
            style={{ width: "100%" }}
          />
        </div>
      )}
      {p.drive_url && (
        <a
          href={p.drive_url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-emerald-300 hover:text-emerald-200 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7.71 3.5L1.15 15l3.43 6h6.86l3.43-6L7.71 3.5zm15.14 11.5L16.29 3.5h-6.86l6.57 11.5h6.85zm-8 .5l3.43 6H1.15l3.43-6h10.27z" />
          </svg>
          Abrir en Drive
        </a>
      )}
    </div>
  );
}

export default function ProyectosClient() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/projects", { cache: "no-store" })
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-full px-6 py-6">
      {/* Toolbar compacta: breadcrumb a /automator + título */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <FolderIcon className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Proyectos</h1>
            <p className="text-xs text-zinc-500">
              Explora, gestiona y regenera tus proyectos de vídeo.
              {data?.output_root && (
                <span className="ml-2 font-mono text-zinc-600">{data.output_root}</span>
              )}
            </p>
          </div>
        </div>
        <Link
          href="/automator"
          className="px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        >
          ← Volver a Automator
        </Link>
      </div>

      {/* Grid */}
      <section>
        {loading && (
          <div className="text-sm text-zinc-500">Cargando proyectos…</div>
        )}
        {!loading && data?.error && (
          <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md p-3">
            Error: {data.error}
          </div>
        )}
        {!loading && data?.projects && data.projects.length === 0 && (
          <div className="card-panel p-10 text-center">
            <FolderIcon className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-400">
              Todavía no tienes proyectos generados.
            </p>
            <Link
              href="/automator"
              className="btn-primary mt-4 inline-flex"
            >
              Crear el primero
            </Link>
          </div>
        )}
        {!loading && data?.projects && data.projects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {data.projects.map((p) => (
              <ProjectCard key={p.name} p={p} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
