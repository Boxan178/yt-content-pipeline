// Tipos de la API expuesta por electron/preload.ts en window.electronAPI.
// Importable desde el renderer para tipar correctamente.

export interface ElectronNotifyAPI {
  (opts: { title: string; body: string; kind?: string }): void;
}

export interface ElectronUpdaterAPI {
  /** Devuelve unsubscribe. */
  onDownloaded: (cb: (info: { version: string }) => void) => () => void;
  quitAndInstall: () => Promise<{ ok: boolean; error?: string }>;
}

export interface ElectronAPI {
  /** True si la app corre desde `electron .` (no empaquetada). */
  isDev?: boolean;
  notify?: ElectronNotifyAPI;
  updater?: ElectronUpdaterAPI;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
