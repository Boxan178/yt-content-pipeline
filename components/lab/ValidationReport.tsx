'use client';

import type { ValidationReport } from '@/lib/lab/types';

/**
 * Validation report view — Liquid Glass refresh 2026-05-27.
 *
 * Renderiza el veredicto MARIO + Algrow (green/yellow/red) con un hero card
 * grande, badge de veredicto y métricas en grid. Sub-secciones en glass surfaces
 * tintadas según naturaleza (wedges en verde, riesgos en amber, keywords en
 * violet). Icono SVG en lugar del emoji 🟢/🟡/🔴.
 */

interface VerdictVisual {
  label: string;
  text: string;
  bg: string;
  border: string;
  glow: string;
  icon: JSX.Element;
}

const VERDICT_ICON_OK = (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 12l5 5L20 7" />
  </svg>
);
const VERDICT_ICON_WARN = (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 9v4M12 17h.01" />
    <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
  </svg>
);
const VERDICT_ICON_STOP = (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </svg>
);

const VERDICT_VISUAL: Record<ValidationReport['verdict'], VerdictVisual> = {
  green: {
    label: 'Adelante',
    text: 'text-green-300',
    bg: 'bg-green-500/10',
    border: 'border-green-500/40',
    glow: '0 0 32px -8px rgba(34,197,94,0.45)',
    icon: VERDICT_ICON_OK,
  },
  yellow: {
    label: 'Con matices',
    text: 'text-amber-300',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/40',
    glow: '0 0 32px -8px rgba(245,158,11,0.45)',
    icon: VERDICT_ICON_WARN,
  },
  red: {
    label: 'Riesgo alto',
    text: 'text-red-300',
    bg: 'bg-red-500/10',
    border: 'border-red-500/40',
    glow: '0 0 32px -8px rgba(239,68,68,0.45)',
    icon: VERDICT_ICON_STOP,
  },
};

export function ValidationReportView({ report }: { report: ValidationReport }) {
  const v = VERDICT_VISUAL[report.verdict];
  return (
    <div className="space-y-4">
      {/* Hero verdict card */}
      <div
        className={`glass rounded-[28px] border ${v.border} ${v.bg} p-6`}
        style={{ boxShadow: v.glow }}
      >
        <div className="flex items-center gap-4">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${v.border} ${v.bg} ${v.text}`}
          >
            {v.icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-label text-zinc-500">
              Veredicto MARIO + Algrow
            </p>
            <h2
              className={`font-display text-2xl font-semibold tracking-display ${v.text}`}
            >
              {v.label}
            </h2>
          </div>
        </div>

        {/* Métricas demand / saturation */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Metric label="Demand" value={report.demandScore} />
          <Metric label="Saturation" value={report.saturationScore} />
        </div>
      </div>

      {report.wedges.length > 0 && (
        <ReportSection title="Ángulos defendibles (wedges)" tint="green">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-200">
            {report.wedges.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </ReportSection>
      )}

      {report.risks.length > 0 && (
        <ReportSection title="Riesgos" tint="amber">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-200">
            {report.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </ReportSection>
      )}

      {report.referenceChannelsRecommended.length > 0 && (
        <ReportSection title="Canales de referencia recomendados" tint="sky">
          <ul className="space-y-2 text-sm">
            {report.referenceChannelsRecommended.map((c, i) => (
              <li key={i}>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-sky-300 underline-offset-2 hover:underline"
                >
                  {c.name}
                </a>
                <div className="mt-0.5 text-xs leading-relaxed text-zinc-400">
                  {c.reason}
                </div>
              </li>
            ))}
          </ul>
        </ReportSection>
      )}

      {report.keywords.length > 0 && (
        <ReportSection title="Keywords" tint="violet">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] font-medium uppercase tracking-label text-zinc-500">
                <th className="pb-2 text-left">Keyword</th>
                <th className="pb-2 text-right">Volumen</th>
                <th className="pb-2 text-right">Competencia</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              {report.keywords.map((k, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="py-1.5">{k.keyword}</td>
                  <td className="nums py-1.5 text-right">
                    {k.volume.toLocaleString()}
                  </td>
                  <td className="nums py-1.5 text-right">{k.competition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportSection>
      )}

      {report.rawReport && (
        <details className="glass rounded-2xl">
          <summary className="cursor-pointer px-4 py-2.5 text-[11px] font-medium uppercase tracking-label text-zinc-500 hover:text-zinc-300">
            Informe completo
          </summary>
          <pre className="whitespace-pre-wrap px-4 pb-4 text-[12px] leading-relaxed text-zinc-300">
            {report.rawReport}
          </pre>
        </details>
      )}

      <div className="nums font-mono text-[10px] text-zinc-600">
        generado: {new Date(report.runAt).toLocaleString()}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-label text-zinc-500">
        {label}
      </p>
      <p className="nums font-display text-2xl font-bold tracking-display text-white">
        {value}
      </p>
    </div>
  );
}

interface SectionProps {
  title: string;
  tint: 'green' | 'amber' | 'sky' | 'violet';
  children: React.ReactNode;
}

const TINT_BORDER: Record<SectionProps['tint'], string> = {
  green: 'border-green-500/25',
  amber: 'border-amber-500/25',
  sky: 'border-sky-500/25',
  violet: 'border-violet-500/25',
};

const TINT_LABEL: Record<SectionProps['tint'], string> = {
  green: 'text-green-300',
  amber: 'text-amber-300',
  sky: 'text-sky-300',
  violet: 'text-violet-300',
};

function ReportSection({ title, tint, children }: SectionProps) {
  return (
    <div className={`glass rounded-2xl border ${TINT_BORDER[tint]} p-4`}>
      <h4
        className={`mb-3 text-[11px] font-medium uppercase tracking-label ${TINT_LABEL[tint]}`}
      >
        {title}
      </h4>
      {children}
    </div>
  );
}
