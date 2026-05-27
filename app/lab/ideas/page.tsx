import { LabSidebar } from '@/components/lab/LabSidebar';
import { IdeasPanel } from '@/components/lab/IdeasPanel';
import { listIdeas } from '@/lib/lab/ideas';

export const dynamic = 'force-dynamic';

/**
 * Lab ideas page — Liquid Glass refresh 2026-05-27.
 *
 * Wrapper de IdeasPanel con header glass alineado al canon del módulo Lab.
 */
export default function LabIdeasPage() {
  const ideas = listIdeas();
  return (
    <div className="flex h-full">
      <LabSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-auto px-8 pb-12 pt-2">
          <header className="mb-6">
            <h1 className="font-display text-3xl font-semibold tracking-display text-white">
              Ideas
            </h1>
            <p className="mt-1.5 text-sm text-zinc-400">
              Banco de ideas crudas + ideas asignadas a un canal (real o
              borrador).
            </p>
          </header>
          <IdeasPanel initialIdeas={ideas} />
        </main>
      </div>
    </div>
  );
}
