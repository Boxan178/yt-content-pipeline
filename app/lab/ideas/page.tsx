import { LabSidebar } from '@/components/lab/LabSidebar';
import { IdeasPanel } from '@/components/lab/IdeasPanel';
import { listIdeas } from '@/lib/lab/ideas';

export const dynamic = 'force-dynamic';

export default function LabIdeasPage() {
  const ideas = listIdeas();
  return (
    <div className="flex h-full">
      <LabSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border bg-panel/40 px-6 py-4">
          <h1 className="text-xl font-bold text-white">Ideas</h1>
          <p className="text-xs text-zinc-400">
            Banco de ideas crudas + ideas asignadas a un canal (real o borrador).
          </p>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <IdeasPanel initialIdeas={ideas} />
        </main>
      </div>
    </div>
  );
}
