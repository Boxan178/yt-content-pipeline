import Link from 'next/link';
import { LabSidebar } from '@/components/lab/LabSidebar';
import { ChannelDraftCard } from '@/components/lab/ChannelDraftCard';
import { listDrafts } from '@/lib/lab/drafts';

export const dynamic = 'force-dynamic';

export default function LabHomePage() {
  const drafts = listDrafts();
  return (
    <div className="flex h-full">
      <LabSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-panel/40 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold text-white">Canales borrador</h1>
            <p className="text-xs text-zinc-400">
              Crea, valida y bootstrapea canales nuevos a partir de un canal de referencia.
            </p>
          </div>
          <Link
            href="/lab/new-channel"
            className="rounded-md border border-accent/60 bg-accent/20 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/30"
          >
            + Crear canal nuevo
          </Link>
        </header>

        <main className="flex-1 overflow-auto p-6">
          {drafts.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {drafts.map((d) => (
                <ChannelDraftCard key={d.id} draft={d} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="text-5xl">🧪</div>
      <h2 className="mt-3 text-lg font-semibold text-white">No hay canales borrador todavía</h2>
      <p className="mt-1 max-w-md text-sm text-zinc-400">
        El lab te permite analizar un canal de referencia con{' '}
        <span className="font-mono text-accent">style-engine</span>, generar un
        Style DNA y bootstrapear un canal nuevo en disco con su skill especializada.
      </p>
      <Link
        href="/lab/new-channel"
        className="mt-5 rounded-md border border-accent/60 bg-accent/20 px-5 py-2 text-sm font-semibold text-accent transition hover:bg-accent/30"
      >
        + Crear el primero
      </Link>
    </div>
  );
}
