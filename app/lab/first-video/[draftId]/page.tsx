import { notFound } from 'next/navigation';
import { LabSidebar } from '@/components/lab/LabSidebar';
import { FirstVideoTimeline } from '@/components/lab/FirstVideoTimeline';
import { getDraft } from '@/lib/lab/drafts';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { draftId: string };
}

/**
 * First video page — Liquid Glass refresh 2026-05-27.
 *
 * Vista del checklist del primer vídeo de un canal bootstrappeado. Header
 * glass + FirstVideoTimeline.
 */
export default function FirstVideoPage({ params }: PageProps) {
  const draft = getDraft(params.draftId);
  if (!draft) notFound();

  return (
    <div className="flex h-full">
      <LabSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-auto px-8 pb-12 pt-2">
          <header className="mb-6">
            <h1 className="font-display text-3xl font-semibold tracking-display text-white">
              Primer vídeo
            </h1>
            <p className="mt-1.5 text-sm text-zinc-400">
              Materializa el primer vídeo del canal recién bootstrappeado. Crea
              la carpeta en disco y revisa las fases que vendrán después.
            </p>
          </header>
          <FirstVideoTimeline draft={draft} />
        </main>
      </div>
    </div>
  );
}
