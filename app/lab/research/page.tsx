import { LabSidebar } from '@/components/lab/LabSidebar';
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
            Modo rápido (en pantalla, no se guarda) y modo profundo (persiste y se asocia a un draft).
          </p>
        </header>
        <main className="flex-1 overflow-auto p-6">
          {items.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Aún no hay investigaciones guardadas. (Fase E del LAB-PLAN — pendiente.)
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((r) => (
                <li key={r.id} className="rounded border border-border bg-panel p-3 text-sm">
                  <div className="font-semibold text-white">{r.niche}</div>
                  <div className="text-xs text-zinc-400">{r.summary}</div>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    </div>
  );
}
