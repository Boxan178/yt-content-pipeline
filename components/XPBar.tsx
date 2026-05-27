'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchStats } from '@/lib/gamification-client';
import { deriveLevel, titleForLevel, type Stats } from '@/lib/gamification-types';

/**
 * Pill horizontal para la TopBar: muestra título + nivel + barra XP + XP/needed.
 * Click → /perfil
 *
 * Refresh visual 2026-05-27: convertida en una sola "liquid pill" de 256×36
 * con .xp-fill (gradient gold dorado) dentro de glass background. Mantiene
 * tabular-nums para que los dígitos no salten al refrescar.
 *
 * Refresca cada 30s. También se actualiza con eventos de gamificación.
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
      className={`group relative block h-9 w-64 overflow-hidden rounded-full transition ${bumping ? 'animate-xp-bump' : ''}`}
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.10)',
      }}
      title={`Nivel ${lv.level} · ${title} · ${lv.intoLevel}/${lv.needed} XP al nivel ${lv.level + 1}`}
    >
      {/* Fill gold liquid */}
      <div
        className="xp-fill absolute inset-y-0 left-0 transition-[width] duration-700 ease-out"
        style={{ width: `${lv.percent}%` }}
      />
      {/* Label centrada */}
      <div className="nums relative flex h-full items-center justify-center px-3 text-[12px] font-medium text-white">
        <span className="opacity-95">
          {title} ({lv.level}) · {lv.intoLevel}/{lv.needed} XP
        </span>
        {stats.streak.current >= 2 && (
          <span
            className="absolute right-2.5 flex items-center gap-0.5 text-[11px] font-semibold text-orange-300"
            title={`Racha actual: ${stats.streak.current} días`}
            style={{ filter: 'drop-shadow(0 0 4px rgba(251,146,60,0.55))' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.5 0 3-1.2 3-3.5 0-2-1-3-1.5-3.5-.5 1-1 1.5-1.5 1.5-.5 0-.5-1.5 0-3.5C7.5 8 5 11 5 14a7 7 0 0 0 14 0c0-2.5-1.5-5-3-6.5-.5 1-1 1.5-1.5 1.5-1.5 0-1.5-3-1.5-5-3 1.5-5 4.5-5 7" />
            </svg>
            {stats.streak.current}
          </span>
        )}
      </div>
    </Link>
  );
}
