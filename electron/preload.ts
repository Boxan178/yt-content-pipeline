import { contextBridge, ipcRenderer } from 'electron';

// El flag isDev se inyecta desde main via `webPreferences.additionalArguments`.
// Buscamos `--ytcp-dev=1` o `=0` en process.argv del preload.
const isDevFlag = process.argv.some((a) => a === '--ytcp-dev=1');

/**
 * API expuesta al renderer via contextBridge.
 * Tipos compartidos en lib/electron-api.ts (importable desde renderer).
 *
 * NOTE: el viejo `terminal:*` IPC con node-pty se eliminó cuando se sustituyó
 * la xterm por el ChatDock React. Si volvemos a necesitar un shell embebido,
 * mirar el git log de este archivo.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /** True si la app corre desde `electron .` (no empaquetada). */
  isDev: isDevFlag,
  /** Notificación nativa del OS (con sonido). */
  notify: (opts: { title: string; body: string; kind?: string }) =>
    ipcRenderer.send('notify', opts),
  updater: {
    /** Suscribirse al evento "update descargada y lista para aplicar". */
    onDownloaded: (cb: (info: { version: string }) => void) => {
      const handler = (_e: unknown, info: { version: string }) => cb(info);
      ipcRenderer.on('updater:downloaded', handler);
      return () => ipcRenderer.removeListener('updater:downloaded', handler);
    },
    /** Disparar el reinicio + instalación. */
    quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
  },
});
