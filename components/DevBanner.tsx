'use client';

import { useEffect, useState } from 'react';

/**
 * Banner amarillo arriba si la app corre en modo dev (`electron .` directo,
 * NO el .exe empaquetado). Lee `window.electronAPI.isDev` que viene inyectado
 * desde main.ts via `webPreferences.additionalArguments`.
 */
export function DevBanner() {
  const [isDev, setIsDev] = useState(false);

  useEffect(() => {
    // window.electronAPI puede no estar disponible si abres la página en un
    // navegador normal (durante next dev fuera de Electron) — en ese caso
    // también es dev, así que verificamos location.hostname también.
    const fromElectron = typeof window !== 'undefined' && window.electronAPI?.isDev === true;
    const fromBrowser = typeof window !== 'undefined' && !window.electronAPI && location.hostname === 'localhost';
    setIsDev(fromElectron || fromBrowser);
  }, []);

  if (!isDev) return null;

  return (
    <div className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-500/40 bg-amber-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-amber-200">
      <span className="text-base">⚠️</span>
      <span>Modo desarrollo · estás corriendo el código sin empaquetar</span>
    </div>
  );
}
