'use client';

import { useEffect, useState } from 'react';

type Mode = 'home' | 'away';
const STORAGE_KEY = 'ytcp:working-mode';

/**
 * Toggle "En PC / Fuera". Persiste en el SERVER (/api/working-mode) para que el
 * backend lo lea, + localStorage como caché optimista para pintar al instante.
 *
 * Semántica MIXTA (Pablo, 2026-06-01): las aprobaciones van SIEMPRE por Telegram
 * en ambos modos. 'away' ("Fuera") añade avisos de completados (renders, subidas…).
 * Al cambiar de modo, el backend manda un aviso a Telegram. El flag de completados
 * se usará en una tarea siguiente; hoy el toggle ya persiste + avisa.
 */
export function WorkingModeToggle() {
  const [mode, setMode] = useState<Mode>('home');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // localStorage primero (instantáneo), luego el server como fuente de verdad.
    try {
      const m = localStorage.getItem(STORAGE_KEY);
      if (m === 'home' || m === 'away') setMode(m);
    } catch {}
    fetch('/api/working-mode')
      .then((r) => r.json())
      .then((d: { mode?: Mode }) => {
        if (d?.mode === 'home' || d?.mode === 'away') {
          setMode(d.mode);
          try { localStorage.setItem(STORAGE_KEY, d.mode); } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const toggle = async () => {
    if (busy) return;
    const prev = mode;
    const next: Mode = mode === 'home' ? 'away' : 'home';
    setBusy(true);
    setMode(next); // optimista
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    // Notif global por si algún componente quiere reaccionar
    window.dispatchEvent(new CustomEvent('ytcp:working-mode-changed', { detail: { mode: next } }));
    try {
      const r = await fetch('/api/working-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch {
      // El server no aceptó el cambio: revertir UI + caché para no mentir sobre
      // el modo real (Pablo podría creerse "Fuera" con el backend en "home").
      setMode(prev);
      try { localStorage.setItem(STORAGE_KEY, prev); } catch {}
      window.dispatchEvent(new CustomEvent('ytcp:working-mode-changed', { detail: { mode: prev } }));
    } finally {
      setBusy(false);
    }
  };

  const isHome = mode === 'home';

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
        isHome ? 'pill-pc' : 'pill-away'
      }`}
      title={
        isHome
          ? 'En el PC. Las decisiones te llegan por Telegram igual. Click para "Fuera" (+ avisos de lo que acaba).'
          : 'Fuera del PC. Decisiones + avisos de todo lo que acaba, por Telegram. Click para volver a "En el PC".'
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
