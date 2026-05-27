import Link from 'next/link';
import { LabSidebar } from '@/components/lab/LabSidebar';
import { ChannelDraftCard } from '@/components/lab/ChannelDraftCard';
import { listDrafts } from '@/lib/lab/drafts';

export const dynamic = 'force-dynamic';

/**
 * Lab dashboard — Liquid Glass refresh 2026-05-27.
 *
 * Listado de canales borrador. La entrada principal del módulo /lab. Surface
 * .glass + magenta accents porque el Lab es la "zona premium" experimental.
 */
export default function LabHomePage() {
  const drafts = listDrafts();
  return (
    <div className="flex h-full">
      <LabSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-auto px-8 pb-12 pt-2">
          {/* Header con CTA magenta — el Lab usa magenta para su CTA principal */}
          <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-display text-white">
                Canales borrador
              </h1>
              <p className="mt-1.5 text-sm text-zinc-400">
                Crea, valida y bootstrapea canales nuevos a partir de un canal
                de referencia.
              </p>
            </div>
            <Link
              href="/lab/new-channel"
              className="inline-flex items-center gap-2 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/20 px-5 py-2 font-medium text-fuchsia-200 backdrop-blur-md transition hover:bg-fuchsia-500/30"
              style={{
                boxShadow:
                  'inset 0 1px 0 0 rgba(255,255,255,0.18), 0 0 24px -6px rgba(217,70,239,0.45)',
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Crear canal nuevo
            </Link>
          </header>

          {/* Stats compactas */}
          <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Total" value={drafts.length} accent={false} />
            <StatTile
              label="Borradores"
              value={drafts.filter((d) => d.status === 'draft').length}
              accent={false}
            />
            <StatTile
              label="Validados"
              value={drafts.filter((d) => d.status === 'validated').length}
              accent={false}
            />
            <StatTile
              label="Bootstrap OK"
              value={drafts.filter((d) => d.status === 'bootstrapped').length}
              accent
            />
          </section>

          {drafts.length === 0 ? (
            <EmptyState />
          ) : (
            <section>
              <h2 className="mb-4 text-[11px] font-medium uppercase tracking-label text-zinc-500">
                Borradores activos
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {drafts.map((d) => (
                  <ChannelDraftCard key={d.id} draft={d} />
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: boolean;
}) {
  return (
    <div className="glass rounded-3xl p-5">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-label text-zinc-500">
        {label}
      </p>
      <p
        className={`nums font-display text-3xl font-bold tracking-display ${
          accent ? 'text-fuchsia-200' : 'text-white'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="glass mx-auto flex max-w-2xl flex-col items-center rounded-[28px] px-8 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 3h6M10 3v8L4.5 19.5A2 2 0 0 0 6 22h12a2 2 0 0 0 1.5-2.5L14 11V3" />
          <path d="M7 15h10" />
        </svg>
      </div>
      <h2 className="mb-2 font-display text-xl font-semibold tracking-display text-white">
        No hay canales borrador todavía
      </h2>
      <p className="mb-6 max-w-md text-sm leading-relaxed text-zinc-400">
        El Lab te permite analizar un canal de referencia con{' '}
        <span className="font-mono text-[12px] text-fuchsia-300">style-engine</span>
        , generar un Style DNA y bootstrapear un canal nuevo en disco con su
        skill especializada.
      </p>
      <Link
        href="/lab/new-channel"
        className="inline-flex items-center gap-2 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/20 px-5 py-2 font-medium text-fuchsia-200 backdrop-blur-md transition hover:bg-fuchsia-500/30"
        style={{
          boxShadow:
            'inset 0 1px 0 0 rgba(255,255,255,0.18), 0 0 24px -6px rgba(217,70,239,0.45)',
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        Crear el primero
      </Link>
    </div>
  );
}
