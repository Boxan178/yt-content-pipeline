import { notFound } from 'next/navigation';
import { LabSidebar } from '@/components/lab/LabSidebar';
import { FirstVideoTimeline } from '@/components/lab/FirstVideoTimeline';
import { getDraft } from '@/lib/lab/drafts';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { draftId: string };
}

export default function FirstVideoPage({ params }: PageProps) {
  const draft = getDraft(params.draftId);
  if (!draft) notFound();

  return (
    <div className="flex h-full">
      <LabSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border bg-panel/40 px-6 py-4">
          <h1 className="text-xl font-bold text-white">Primer vídeo</h1>
          <p className="text-xs text-zinc-400">
            Materializa el primer vídeo del canal recién bootstrappeado. Crea la
            carpeta en disco y revisa las fases que vendrán después.
          </p>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <FirstVideoTimeline draft={draft} />
        </main>
      </div>
    </div>
  );
}
