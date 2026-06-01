// Configuración de canales. Solo Moderni Stoici está enabled en v0.1; el resto
// están aquí preparados para activarse cuando definamos su rootPath y mapping
// de estados.

import { channelScriptsRoot, H_YOUTUBE } from './config';

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
   * Biblioteca de brutos COMPARTIDA del canal (ruta absoluta). Si está definida,
   * el hito "brutos visuales" se da por cumplido cuando la biblioteca tiene clips,
   * porque los vídeos de estos canales NO traen brutos propios en
   * `01_BRUTOS/_VÍDEO/`: el render los toma de esta biblioteca común y los coloca
   * de forma aleatoria (no hay material por vídeo). Sin esto, el hito sale siempre
   * desmarcado para Moderni Stoici / Moderno Estoico aunque haya material de sobra.
   * Espejo de `brutos_library` en auto-edit/channels.json.
   */
  sharedBrutosLibrary?: string;
  /**
   * ID del canal en YouTube (formato `UC...`). Usado para comprobar via RSS
   * público si un vídeo ya está subido (sin OAuth, sin cuota API).
   * Pablo: rellena con el ID real cuando lo tengas a mano. Si está vacío, el
   * endpoint /api/youtube/status devuelve `{ uploaded: false, configured: false }`.
   */
  youtubeChannelId?: string;
  /**
   * Si true, la columna "Ideas" del kanban permite "Iniciar pipeline" (crea la
   * carpeta del vídeo y lanza a SARA en automático hasta listo para subir). Canal
   * piloto: solo `moderni-stoici`. En el resto el botón sale deshabilitado.
   */
  autoPipeline?: boolean;
  /**
   * Si true, cuando un vídeo de este canal queda completo (render + miniatura +
   * packaging) y sin jobs vivos, la app lo sube SOLA a YouTube como `unlisted`
   * (oculto) con todo el packaging y avisa a Pablo por Telegram para que lo
   * programe desde el móvil. Canal piloto: solo `moderni-stoici`. 100% hands-off.
   * Ver `lib/auto-publish.ts`. Para activarlo en otro canal, basta poner `true`
   * (requiere que el canal esté autorizado en el engine youtube-uploader).
   */
  autoPublishUnlisted?: boolean;
}

export const CHANNELS: Channel[] = [
  {
    slug: 'moderni-stoici',
    name: 'Moderni Stoici',
    enabled: true,
    rootPath: H_YOUTUBE + '/CANALES ESTOICISMO/MODERNI STOICI',
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
    scriptsRoot: channelScriptsRoot('moderni-stoici'),
    sharedBrutosLibrary: H_YOUTUBE + '/CANALES ESTOICISMO/MODERNI STOICI/Biblioteca de Brutos',
    autoPipeline: true,
    autoPublishUnlisted: true,
  },
  // Placeholders — completar rootPath y stateFolders cuando se activen.
  {
    slug: 'moderno-estoico',
    name: 'Moderno Estoico',
    enabled: true,
    rootPath: H_YOUTUBE + '/CANALES ESTOICISMO/MODERNO ESTOICO',
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
    scriptsRoot: channelScriptsRoot('moderno-estoico'),
    // Réplica española de Moderni Stoici: comparte su misma biblioteca de brutos
    // (no tiene una propia en disco).
    sharedBrutosLibrary: H_YOUTUBE + '/CANALES ESTOICISMO/MODERNI STOICI/Biblioteca de Brutos',
  },
  {
    // Canal de historias narrativas cortas. Reciclaje del canal YouTube
    // existente "The Vaultman" (Pablo confirmó nombre 2026-05-23). El formato
    // será historias breves y narrativas (sleep stories podría ser un subset).
    slug: 'vaultman',
    name: 'The Vaultman',
    enabled: true,
    rootPath: H_YOUTUBE + '/THE VAULTMAN',
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
    scriptsRoot: channelScriptsRoot('vaultman'),
    sharedBrutosLibrary: H_YOUTUBE + '/THE VAULTMAN/Biblioteca de Brutos',
  },
  {
    // Canal de historias narrativas cortas (en español). Activado 2026-05-27.
    slug: 'uncharted-history',
    name: 'Uncharted History',
    enabled: true,
    rootPath: H_YOUTUBE + '/UNCHARTED HISTORY',
    stateFolders: {
      pending_locution: '_PENDIENTE LOCUCION',
      production: '_EN PRODUCCIÓN',
      ready: '_LISTOS PARA SUBIR',
      uploaded: '_SUBIDOS',
      archived: '_ARCHIVO',
    },
    ignoreFolders: [
      'PENDIENTE DE REVISAR',
      '_PACKAGING',
      'branding',
      'Historias cortas español',
    ],
    scriptsRoot: channelScriptsRoot('uncharted-history'),
  },
  // ── Canales SLEEP STORIES (creados 2026-05-29) ───────────────────────────
  // Tres canales nuevos de historias para dormir bajo
  // H:/YOUTUBE/CANALES SLEEP STORIES/. Estructura estándar, muy parecidos a
  // Moderni Stoici. Brutos (Pablo, 2026-05-29):
  //   - the-sleeping-stoic → reutiliza la biblioteca estoica de Moderni Stoici.
  //   - drowsy-tales / the-sleepy-historian → PENDIENTE de crear su biblioteca;
  //     de momento apuntan a _RECURSOS/Biblioteca Brutos compartida (vacía →
  //     hito "brutos" sin marcar hasta llenarla; cuenta vídeos O fotos).
  {
    // Sleep story ESTOICO: reutiliza los mismos brutos (149 clips) y la música
    // de Moderni Stoici, igual que Moderno Estoico. No necesita biblioteca
    // propia — el render tira de la biblioteca estoica común. La voz también es
    // la misma. (Pablo, 2026-05-29.)
    slug: 'the-sleeping-stoic',
    name: 'The Sleeping Stoic',
    enabled: true,
    rootPath: H_YOUTUBE + '/CANALES SLEEP STORIES/THE SLEEPING STOIC',
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
      '_PACKAGING',
      'branding',
    ],
    scriptsRoot: channelScriptsRoot('the-sleeping-stoic'),
    sharedBrutosLibrary: H_YOUTUBE + '/CANALES ESTOICISMO/MODERNI STOICI/Biblioteca de Brutos',
    autoPipeline: true,
  },
  {
    slug: 'drowsy-tales',
    name: 'Drowsy Tales',
    enabled: true,
    rootPath: H_YOUTUBE + '/CANALES SLEEP STORIES/DROWSY TALES',
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
      '_PACKAGING',
      'branding',
    ],
    scriptsRoot: channelScriptsRoot('drowsy-tales'),
    sharedBrutosLibrary: H_YOUTUBE + '/CANALES SLEEP STORIES/_RECURSOS/Biblioteca Brutos compartida',
  },
  {
    slug: 'the-sleepy-historian',
    name: 'The Sleepy Historian',
    enabled: true,
    rootPath: H_YOUTUBE + '/CANALES SLEEP STORIES/THE SLEEPY HISTORIAN',
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
      '_PACKAGING',
      'branding',
    ],
    scriptsRoot: channelScriptsRoot('the-sleepy-historian'),
    sharedBrutosLibrary: H_YOUTUBE + '/CANALES SLEEP STORIES/_RECURSOS/Biblioteca Brutos compartida',
  },
  { slug: 'dailydog',         name: 'Daily Dog',        enabled: false, rootPath: H_YOUTUBE + '/DAILY DOG', stateFolders: { pending_locution: '', production: '', ready: '', uploaded: '', archived: '' }, ignoreFolders: [] },
  { slug: 'tail-tales',       name: 'Tail Tales',       enabled: false, rootPath: H_YOUTUBE + '/TAIL TALES_EN', stateFolders: { pending_locution: '', production: '', ready: '', uploaded: '', archived: '' }, ignoreFolders: [] },
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

/**
 * Color de marca por canal (hex) para la UI editorial: calendario, badges,
 * leyendas. Browser-safe (este módulo ya lo importan componentes client). Solo
 * hace falta para los canales que aparecen datados en el calendario; el resto
 * cae al gris neutro de `channelColor()`.
 */
export const CHANNEL_COLORS: Record<string, string> = {
  'moderni-stoici': '#6366f1',      // indigo
  'moderno-estoico': '#a78bfa',     // violet (réplica ES)
  'vaultman': '#f59e0b',            // amber
  'uncharted-history': '#14b8a6',   // teal
  'the-sleeping-stoic': '#38bdf8',  // sky
  'drowsy-tales': '#ec4899',        // pink
  'the-sleepy-historian': '#f43f5e',// rose
};

/** Color de marca del canal (hex). Fallback gris neutro si no está mapeado. */
export function channelColor(slug: string): string {
  return CHANNEL_COLORS[slug] ?? '#71717a';
}
