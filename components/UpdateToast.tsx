'use client';

import { useEffect, useState } from 'react';

/**
 * ✅ RECONECTADO (2026-06-01, fase beta): Pablo pidió volver a VER la ventanita
 * de actualización y aplicarla con un click. electron/main.ts vuelve a emitir
 * `updater:downloaded` al renderer y app/layout.tsx renderiza este componente.
 * El instalador sigue siendo silencioso (quitAndInstall(true,true) → sin ventana
 * NSIS); este toast solo da el control de "aplicar ahora". (Antes, 2026-05-29,
 * estuvo desconectado por la decisión de "silencio total".)
 *
 * Toast que aparece abajo-derecha cuando electron-updater descarga una nueva
 * versión. Estilo discreto, dark, con flecha "→". Al click → quitAndInstall.
 *
 * No es bloqueante: si el usuario lo ignora, la actualización se aplica de
 * todas formas al cerrar la app (`autoInstallOnAppQuit: true` en main.ts).
 *
 * Solo se renderiza si window.electronAPI.updater está disponible (es decir,
 * dentro de Electron y con el preload nuevo).
 */
export function UpdateToast() {
  const [version, setVersion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI?.updater : undefined;
    if (!api) return;
    const off = api.onDownloaded((info) => {
      setVersion(info.version);
      setDismissed(false);
    });
    return off;
  }, []);

  if (!version || dismissed) return null;

  const handleRestart = async () => {
    const api = window.electronAPI?.updater;
    if (!api) return;
    setBusy(true);
    try {
      await api.quitAndInstall();
    } catch {
      setBusy(false);
    }
    // Si quitAndInstall procede, la app reinicia y este componente desaparece.
  };

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex items-end">
      <button
        type="button"
        onClick={handleRestart}
        disabled={busy}
        className="pointer-events-auto group flex items-center gap-3 rounded-2xl border border-zinc-700/60 bg-zinc-900/95 px-4 py-3 text-left shadow-2xl backdrop-blur transition hover:border-zinc-500/80 hover:bg-zinc-800/95 disabled:opacity-60"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zinc-800 text-lg">
          {/* Hojita simple, sin importar librería de iconos */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-emerald-300"
            aria-hidden
          >
            <path d="M11 20A7 7 0 0 1 4 13V4h7a7 7 0 0 1 7 7v9z" />
            <path d="M4 4l14 14" />
          </svg>
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-medium text-zinc-100">
            {busy ? 'Reiniciando…' : 'Reiniciar para actualizar'}
          </span>
          <span className="text-[11px] text-zinc-400">v{version}</span>
        </span>
        <span className="ml-2 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-zinc-100">
          →
        </span>
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="pointer-events-auto ml-1 mb-1 rounded-full p-1 text-[10px] text-zinc-500 hover:text-zinc-200"
        title="Ocultar (se aplicará al cerrar la app)"
        aria-label="Ocultar aviso"
      >
        ✕
      </button>
    </div>
  );
}
