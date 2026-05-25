import { notFound } from 'next/navigation';
import { LabSidebar } from '@/components/lab/LabSidebar';
import { getDraft } from '@/lib/lab/drafts';
import { DraftWizard } from './DraftWizard';
import type { WizardStep } from '@/lib/lab/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { draftId: string };
  searchParams: { step?: string };
}

export default function DraftDetailPage({ params, searchParams }: PageProps) {
  const draft = getDraft(params.draftId);
  if (!draft) notFound();

  const stepParam = searchParams.step ? parseInt(searchParams.step, 10) : NaN;
  const step: WizardStep = (
    Number.isFinite(stepParam) && stepParam >= 1 && stepParam <= 5
      ? stepParam
      : draft.currentStep
  ) as WizardStep;

  return (
    <div className="flex h-full">
      <LabSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <DraftWizard initialDraft={draft} initialStep={step} />
      </div>
    </div>
  );
}
