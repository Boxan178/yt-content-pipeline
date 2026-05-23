// Tipos y constantes de progreso. SIN imports de node:* para que sea
// importable desde componentes client (VideoCard, ProgressBar).
// La función computeProgress() vive en lib/progress.ts (server-only).

export interface ProgressDetails {
  hasPackagingMd: boolean;
  scriptWritten: boolean;
  locucionReady: boolean;
  brutosVisuales: boolean;
  renderPrincipal: boolean;
  miniaturaFinal: boolean;
}

export interface Progress {
  hits: number;
  total: number;
  percent: number;
  details: ProgressDetails;
}

export const HIT_LABELS: Record<keyof ProgressDetails, string> = {
  hasPackagingMd: 'Packaging iniciado',
  scriptWritten: 'Guion escrito',
  locucionReady: 'Locución lista',
  brutosVisuales: 'Brutos visuales',
  renderPrincipal: 'Render principal',
  miniaturaFinal: 'Miniatura final',
};

export const HIT_ORDER: (keyof ProgressDetails)[] = [
  'hasPackagingMd',
  'scriptWritten',
  'locucionReady',
  'brutosVisuales',
  'renderPrincipal',
  'miniaturaFinal',
];
