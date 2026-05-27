'use client';

import { useEffect, useState } from 'react';

type Mode = 'home' | 'away';
const STORAGE_KEY = 'ytcp:working-mode';

/**
 * Toggle "En PC / Fuera". Persiste en localStorage.
 *
 * Cuando esté integrado el bridge Telegram (pendiente — punto 9 del roadmap),
 * las aprobaciones de jobs respetarán este modo: 'home' = aprobaciones en
 * modal local, 'away' = aprobaciones via Telegram al móvil.
 *
 * Hoy es puramente visual + flag persistido. El backend NO usa este valor
 * todavía. Cuando lo use, leer `localStorage.getItem('ytcp:working-mode')`.
 */
export function WorkingModeToggle() {
  const [mode, setMode] = useState<Mode>('home');

  useEffect(() => {
    try {
      const m = localStorage.getItem(STORAGE_KEY);
      if (m === 'home' || m === 'away') setMode(m);
    } catch {}
  }, []);

  const toggle = () => {
    const next: Mode = mode === 'home' ? 'away' : 'home';
    setMode(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    // Notif global por si algún componente quiere reaccionar
    window.dispatchEvent(new CustomEvent('ytcp:working-mode-changed', { detail: { mode: next } }));
  };

  const isHome = mode === 'home';

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition ${
        isHome ? 'pill-pc' : 'pill-away'
      }`}
      title={
        isHome
          ? 'En el PC (aprobaciones en pantalla). Click para cambiar a "Fuera".'
          : 'Fuera del PC (aprobaciones por Telegram, pendiente). Click para volver a "En el PC".'
      }
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${isHome ? 'bg-green-400' : 'bg-cyan-400'}`}
        style={{
          boxShadow: isHome
            ? '0 0 8px rgba(34,197,94,0.6)'
            : '0 0 8px rgba(34,211,238,0.6)',
        }}
      />
      <span>{isHome ? 'En el PC' : 'Fuera'}</span>
    </button>
  );
}
