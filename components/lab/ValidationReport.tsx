'use client';

import type { ValidationReport } from '@/lib/lab/types';

const VERDICT_VISUAL: Record<
  ValidationReport['verdict'],
  { emoji: string; label: string; bg: string; border: string; text: string }
> = {
  green: {
    emoji: '🟢',
    label: 'Adelante',
    bg: 'bg-emerald-900/20',
    border: 'border-emerald-600/40',
    text: 'text-emerald-200',
  },
  yellow: {
    emoji: '🟡',
    label: 'Con matices',
    bg: 'bg-amber-900/20',
    border: 'border-amber-600/40',
    text: 'text-amber-200',
  },
  red: {
    emoji: '🔴',
    label: 'Riesgo alto',
    bg: 'bg-red-900/20',
    border: 'border-red-600/40',
    text: 'text-red-200',
  },
};

export function ValidationReportView({ report }: { report: ValidationReport }) {
  const v = VERDICT_VISUAL[report.verdict];
  return (
    <div className="space-y-4">
      <div className={`rounded-lg border ${v.border} ${v.bg} p-4`}>
        <div className={`flex items-center gap-3 ${v.text}`}>
          <span className="text-3xl">{v.emoji}</span>
          <div>
            <div className="text-lg font-bold">{v.label}</div>
            <div className="text-xs opacity-80">
              demand {report.demandScore} · saturation {report.saturationScore}
            </div>
          </div>
        </div>
      </div>

      {report.wedges.length > 0 && (
        <Section title="Ángulos defendibles (wedges)" tint="emerald">
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300">
            {report.wedges.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Section>
      )}

      {report.risks.length > 0 && (
        <Section title="Riesgos" tint="amber">
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300">
            {report.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Section>
      )}

      {report.referenceChannelsRecommended.length > 0 && (
        <Section title="Canales de referencia recomendados" tint="sky">
          <ul className="space-y-2 text-sm">
            {report.referenceChannelsRecommended.map((c, i) => (
              <li key={i}>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-sky-300 hover:underline"
                >
                  {c.name}
                </a>
                <div className="text-xs text-zinc-400">{c.reason}</div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {report.keywords.length > 0 && (
        <Section title="Keywords" tint="violet">
          <table className="w-full text-xs">
            <thead className="text-zinc-500">
              <tr>
                <th className="text-left">Keyword</th>
                <th className="text-right">Volumen</th>
                <th className="text-right">Competencia</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              {report.keywords.map((k, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1">{k.keyword}</td>
                  <td className="py-1 text-right">{k.volume.toLocaleString()}</td>
                  <td className="py-1 text-right">{k.competition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {report.rawReport && (
        <details className="rounded-md border border-border bg-bg/60">
          <summary className="cursor-pointer px-3 py-2 text-xs text-zinc-400">
            Informe completo
          </summary>
          <pre className="whitespace-pre-wrap px-3 py-2 text-[12px] leading-snug text-zinc-300">
            {report.rawReport}
          </pre>
        </details>
      )}

      <div className="text-[10px] text-zinc-600">
        Generado: {new Date(report.runAt).toLocaleString()}
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  tint: 'emerald' | 'amber' | 'sky' | 'violet';
  children: React.ReactNode;
}

const TINT: Record<SectionProps['tint'], string> = {
  emerald: 'border-emerald-700/40 bg-emerald-900/10',
  amber: 'border-amber-700/40 bg-amber-900/10',
  sky: 'border-sky-700/40 bg-sky-900/10',
  violet: 'border-violet-700/40 bg-violet-900/10',
};

function Section({ title, tint, children }: SectionProps) {
  return (
    <div className={`rounded-md border p-3 ${TINT[tint]}`}>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">
        {title}
      </h4>
      {children}
    </div>
  );
}
