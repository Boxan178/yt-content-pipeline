import { LabSidebar } from '@/components/lab/LabSidebar';
import { ResearchPanel } from '@/components/lab/ResearchPanel';
import { listResearch } from '@/lib/lab/research';

export const dynamic = 'force-dynamic';

/**
 * Lab research page — Liquid Glass refresh 2026-05-27.
 *
 * Wrapper de ResearchPanel con header glass alineado al canon del módulo Lab.
 */
export default function LabResearchPage() {
  const items = listResearch();
  return (
    <div className="flex h-full">
      <LabSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-auto px-8 pb-12 pt-2">
          <header className="mb-6">
            <h1 className="font-display text-3xl font-semibold tracking-display text-white">
              Investigaciones
            </h1>
            <p className="mt-1.5 text-sm text-zinc-400">
              Modo rápido (resultado en pantalla, no se guarda) y modo profundo
              (persiste en{' '}
              <code className="font-mono text-[12px] text-fuchsia-300">
                research.json
              </code>
              ).
            </p>
          </header>
          <ResearchPanel initialItems={items} />
        </main>
      </div>
    </div>
  );
}
