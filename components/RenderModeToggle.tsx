'use client';

import { useEffect, useState } from 'react';

type Mode = 'auto' | 'manual';
const STORAGE_KEY = 'ytcp:render-mode';

/**
 * Toggle "Auto-render / Render manual". Persiste en el SERVER (/api/render-mode)
 * para que el poller lo lea, + localStorage como caché optimista.
 *
 * 'manual' (default): los renders los dispara Pablo desde «Cola de render».
 * 'auto': el poller arranca LUIS en cuanto un vídeo tiene todo menos el render,
 * UNO A UNO. Al cambiar de modo, el backend avisa por Telegram.
 */
export function RenderModeToggle() {
  const [mode, setMode] = useState<Mode>('manual');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const m = localStorage.getItem(STORAGE_KEY);
      if (m === 'auto' || m === 'manual') setMode(m);
    } catch {}
    fetch('/api/render-mode')
      .then((r) => r.json())
      .then((d: { mode?: Mode }) => {
        if (d?.mode === 'auto' || d?.mode === 'manual') {
          setMode(d.mode);
          try { localStorage.setItem(STORAGE_KEY, d.mode); } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const toggle = async () => {
    if (busy) return;
    const prev = mode;
    const next: Mode = mode === 'auto' ? 'manual' : 'auto';
    setBusy(true);
    setMode(next); // optimista
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    window.dispatchEvent(new CustomEvent('ytcp:render-mode-changed', { detail: { mode: next } }));
    try {
      const r = await fetch('/api/render-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch {
      setMode(prev);
      try { localStorage.setItem(STORAGE_KEY, prev); } catch {}
      window.dispatchEvent(new CustomEvent('ytcp:render-mode-changed', { detail: { mode: prev } }));
    } finally {
      setBusy(false);
    }
  };

  const isAuto = mode === 'auto';

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
        isAuto ? 'pill-away' : 'pill-pc'
      }`}
      title={
        isAuto
          ? 'Auto-render ON: los vídeos se renderizan solos (uno a uno). Click para render manual.'
          : 'Render manual: los disparas tú desde «Cola de render». Click para auto-render.'
      }
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${isAuto ? 'bg-amber-400' : 'bg-slate-400'}`}
        style={{
          boxShadow: isAuto ? '0 0 8px rgba(251,191,36,0.6)' : '0 0 8px rgba(148,163,184,0.5)',
        }}
      />
      <span>{isAuto ? 'Auto-render' : 'Render manual'}</span>
    </button>
  );
}
