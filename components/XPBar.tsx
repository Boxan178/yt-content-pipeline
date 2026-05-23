'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchStats } from '@/lib/gamification-client';
import { deriveLevel, titleForLevel, type Stats } from '@/lib/gamification-types';

/**
 * Pill compacta para la TopBar: muestra nivel + barra XP + título.
 * Click → /perfil
 *
 * Refresca cada 30s mientras la app está abierta. También se actualiza con
 * el evento `storage` que dispara gamification-client en otras pestañas.
 */
export function XPBar() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [bumping, setBumping] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const s = await fetchStats();
      if (!cancelled && s) setStats(s);
    };
    load();
    const id = setInterval(load, 30000);
    // Re-fetch inmediato cuando llega un evento de gamificación
    const onAny = () => {
      load();
      setBumping(true);
      setTimeout(() => setBumping(false), 700);
    };
    window.addEventListener('ytcp:level-up', onAny);
    window.addEventListener('ytcp:achievement-unlocked', onAny);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('ytcp:level-up', onAny);
      window.removeEventListener('ytcp:achievement-unlocked', onAny);
    };
  }, []);

  if (!stats) return null;
  const lv = deriveLevel(stats.xp);
  const title = titleForLevel(lv.level);

  return (
    <Link
      href="/perfil"
      className="group flex items-center gap-2 rounded-md border border-border bg-bg/60 px-2.5 py-1 text-xs transition hover:border-accent/60"
      title={`Nivel ${lv.level} · ${title} · ${lv.intoLevel}/${lv.needed} XP al nivel ${lv.level + 1}`}
    >
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-500/40 to-amber-700/40 text-[10px] font-bold text-amber-200 ${
          bumping ? 'animate-xp-bump' : ''
        }`}
      >
        {lv.level}
      </span>
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] uppercase tracking-wider text-muted group-hover:text-white">
          {title}
        </span>
        <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-400 to-amber-200 transition-[width] duration-700 ease-out"
            style={{ width: `${lv.percent}%` }}
          />
        </div>
      </div>
      {stats.streak.current >= 2 && (
        <span className="ml-1 text-[10px] text-orange-300" title={`Racha actual: ${stats.streak.current} días`}>
          🔥{stats.streak.current}
        </span>
      )}
    </Link>
  );
}
