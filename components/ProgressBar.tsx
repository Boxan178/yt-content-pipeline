'use client';

import type { Progress } from '@/lib/progress-types';
import { HIT_LABELS, HIT_ORDER } from '@/lib/progress-types';

interface Props {
  progress: Progress;
  compact?: boolean;
}

function colorForPercent(p: number) {
  if (p >= 100) return 'bg-green-500';
  if (p >= 66) return 'bg-blue-500';
  if (p >= 33) return 'bg-yellow-500';
  return 'bg-zinc-500';
}

export function ProgressBar({ progress, compact = false }: Props) {
  const tooltip = HIT_ORDER.map((k) => {
    const done = progress.details[k];
    return `${done ? '✓' : '○'} ${HIT_LABELS[k]}`;
  }).join('\n');

  return (
    <div className="w-full" title={tooltip}>
      <div className="mb-0.5 flex items-center justify-between text-[10px] text-muted">
        <span>Progreso</span>
        <span>
          {progress.hits}/{progress.total} · {progress.percent}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
        <div
          className={`h-full transition-all ${colorForPercent(progress.percent)}`}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      {!compact && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {HIT_ORDER.map((k) => (
            <span
              key={k}
              className={`text-[9px] ${
                progress.details[k] ? 'text-green-300/80' : 'text-muted/60'
              }`}
              title={HIT_LABELS[k]}
            >
              {progress.details[k] ? '✓' : '○'} {HIT_LABELS[k].split(' ')[0].toLowerCase()}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
