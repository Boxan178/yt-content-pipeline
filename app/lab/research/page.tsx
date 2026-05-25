import { LabSidebar } from '@/components/lab/LabSidebar';
import { ResearchPanel } from '@/components/lab/ResearchPanel';
import { listResearch } from '@/lib/lab/research';

export const dynamic = 'force-dynamic';

export default function LabResearchPage() {
  const items = listResearch();
  return (
    <div className="flex h-full">
      <LabSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border bg-panel/40 px-6 py-4">
          <h1 className="text-xl font-bold text-white">Investigaciones</h1>
          <p className="text-xs text-zinc-400">
            Modo rápido (resultado en pantalla, no se guarda) y modo profundo (persiste en
            <code className="ml-1 font-mono">research.json</code>).
          </p>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <ResearchPanel initialItems={items} />
        </main>
      </div>
    </div>
  );
}
