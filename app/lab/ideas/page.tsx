import { LabSidebar } from '@/components/lab/LabSidebar';
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
          {ideas.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Aún no hay ideas. (Fase E del LAB-PLAN — pendiente.)
            </p>
          ) : (
            <ul className="space-y-2">
              {ideas.map((i) => (
                <li key={i.id} className="rounded border border-border bg-panel p-3 text-sm">
                  <div className="font-semibold text-white">{i.title}</div>
                  <div className="text-xs text-zinc-400">{i.description}</div>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    </div>
  );
}
