'use client';

import { useEffect, useState } from 'react';

interface StatusInfo {
  enabled: boolean;
  state: {
    lastStatus: 'ok' | 'error' | 'noop' | null;
    consecutiveErrors: number;
  };
}

/**
 * Indicador puntual del estado del poller Notion. Se monta en la sidebar al
 * lado del icono de Configuración. Verde = último tick OK, rojo = error,
 * gris = noop / desactivado, sin punto = aún no se ha hecho ningún tick.
 */
export function NotionPollerBadge() {
  const [info, setInfo] = useState<StatusInfo | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const r = await fetch('/api/notion/status', { cache: 'no-store' });
        const data = await r.json();
        if (active && data.ok) setInfo({ enabled: data.enabled, state: data.state });
      } catch {}
    };
    load();
    const id = setInterval(load, 15_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  if (!info) return null;
  if (!info.enabled) {
    // Pequeño dot gris para indicar "configurado pero apagado"
    return <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-zinc-700" />;
  }
  const color =
    info.state.lastStatus === 'error'
      ? 'bg-red-500'
      : info.state.lastStatus === 'ok'
        ? 'bg-emerald-500'
        : 'bg-amber-400';
  const pulse = info.state.lastStatus === 'error' ? 'animate-pulse' : '';
  return (
    <span
      className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${color} ${pulse}`}
      title={`Notion poller — ${info.state.lastStatus ?? 'pending'}${info.state.consecutiveErrors > 0 ? ` · ${info.state.consecutiveErrors} errores` : ''}`}
    />
  );
}
