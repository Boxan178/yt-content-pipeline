// Configuración de canales. Solo Moderni Stoici está enabled en v0.1; el resto
// están aquí preparados para activarse cuando definamos su rootPath y mapping
// de estados.

export type VideoState =
  | 'pending_locution'
  | 'production'
  | 'ready'
  | 'uploaded'
  | 'archived';

export interface ChannelStateFolders {
  pending_locution: string;
  production: string;
  ready: string;
  uploaded: string;
  archived: string;
}

export interface Channel {
  slug: string;
  name: string;
  enabled: boolean;
  rootPath: string;
  /** Mapeo de estado lógico → nombre exacto de la carpeta dentro de rootPath. */
  stateFolders: ChannelStateFolders;
  /** Otras carpetas que NO deben tratarse como vídeos (recursos compartidos). */
  ignoreFolders: string[];
  /** Raíz donde viven los guiones por proyecto: <scriptsRoot>/<slug>/guion-v2.md. */
  scriptsRoot?: string;
  /**
   * ID del canal en YouTube (formato `UC...`). Usado para comprobar via RSS
   * público si un vídeo ya está subido (sin OAuth, sin cuota API).
   * Pablo: rellena con el ID real cuando lo tengas a mano. Si está vacío, el
   * endpoint /api/youtube/status devuelve `{ uploaded: false, configured: false }`.
   */
  youtubeChannelId?: string;
}

export const CHANNELS: Channel[] = [
  {
    slug: 'moderni-stoici',
    name: 'Moderni Stoici',
    enabled: true,
    rootPath: 'H:/YOUTUBE/CANALES ESTOICISMO/MODERNI STOICI',
    stateFolders: {
      pending_locution: '_PENDIENTE LOCUCION',
      production: '_EN PRODUCCIÓN',
      ready: '_LISTOS PARA SUBIR',
      uploaded: '_SUBIDOS',
      archived: '_ARCHIVO',
    },
    ignoreFolders: [
      'PENDIENTE DE REVISAR',
      'Biblioteca de Brutos',
      '_REFERENCIA-THUMBNAILS-YOUTUBE',
    ],
    scriptsRoot: 'Y:/04_DEV/J.A.R.V.I.S/youtube-os/youtube/moderni-stoici/guiones',
  },
  // Placeholders — completar rootPath y stateFolders cuando se activen.
  {
    slug: 'moderno-estoico',
    name: 'Moderno Estoico',
    enabled: true,
    rootPath: 'H:/YOUTUBE/CANALES ESTOICISMO/MODERNO ESTOICO',
    stateFolders: {
      pending_locution: '_PENDIENTE LOCUCION',
      production: '_EN PRODUCCIÓN',
      ready: '_LISTOS PARA SUBIR',
      uploaded: '_SUBIDOS',
      archived: '_ARCHIVO',
    },
    ignoreFolders: [
      'PENDIENTE DE REVISAR',
    ],
    scriptsRoot: 'Y:/04_DEV/J.A.R.V.I.S/youtube-os/youtube/moderno-estoico/guiones',
  },
  {
    // Canal nuevo de historias narrativas cortas (sleep stories, micro-historias,
    // narraciones). Posible reciclaje del canal YouTube "TheBowMan" existente —
    // Pablo decide si retoma o crea uno nuevo. La carpeta física no tiene por
    // qué existir todavía; cuando exista, marcar `enabled: true`.
    slug: 'the-bow-man',
    name: 'The Bow Man',
    enabled: true,
    rootPath: 'H:/YOUTUBE/THE BOW MAN',
    stateFolders: {
      pending_locution: '_PENDIENTE LOCUCION',
      production: '_EN PRODUCCIÓN',
      ready: '_LISTOS PARA SUBIR',
      uploaded: '_SUBIDOS',
      archived: '_ARCHIVO',
    },
    ignoreFolders: [
      'PENDIENTE DE REVISAR',
      'Biblioteca de Brutos',
    ],
    scriptsRoot: 'Y:/04_DEV/J.A.R.V.I.S/youtube-os/youtube/the-bow-man/guiones',
  },
  { slug: 'vaultman',         name: 'Vaultman',         enabled: false, rootPath: '', stateFolders: { pending_locution: '', production: '', ready: '', uploaded: '', archived: '' }, ignoreFolders: [] },
  { slug: 'dailydog',         name: 'Daily Dog',        enabled: false, rootPath: 'H:/YOUTUBE/DAILY DOG', stateFolders: { pending_locution: '', production: '', ready: '', uploaded: '', archived: '' }, ignoreFolders: [] },
  { slug: 'tail-tales',       name: 'Tail Tales',       enabled: false, rootPath: 'H:/YOUTUBE/TAIL TALES_EN', stateFolders: { pending_locution: '', production: '', ready: '', uploaded: '', archived: '' }, ignoreFolders: [] },
  { slug: 'uncharted-history',name: 'Uncharted History', enabled: false, rootPath: '', stateFolders: { pending_locution: '', production: '', ready: '', uploaded: '', archived: '' }, ignoreFolders: [] },
  { slug: 'canal-espanol',    name: 'Canal Español',    enabled: false, rootPath: '', stateFolders: { pending_locution: '', production: '', ready: '', uploaded: '', archived: '' }, ignoreFolders: [] },
  { slug: 'canal-paranormal', name: 'Canal Paranormal', enabled: false, rootPath: '', stateFolders: { pending_locution: '', production: '', ready: '', uploaded: '', archived: '' }, ignoreFolders: [] },
];

export function getChannel(slug: string): Channel | undefined {
  return CHANNELS.find((c) => c.slug === slug);
}

export const STATE_LABEL: Record<VideoState, string> = {
  pending_locution: 'Pendiente locución',
  production: 'En producción',
  ready: 'Listos para subir',
  uploaded: 'Subidos',
  archived: 'Archivados',
};

export const STATE_ORDER: VideoState[] = ['pending_locution', 'production', 'ready', 'uploaded', 'archived'];
