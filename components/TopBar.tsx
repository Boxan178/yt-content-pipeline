'use client';

import { useEffect, useState } from 'react';
import { fetchStats } from '@/lib/gamification-client';
import { deriveLevel, titleForLevel, type Stats } from '@/lib/gamification-types';
import { NotificationBell } from './NotificationBell';
import { XPBar } from './XPBar';
import { WorkingModeToggle } from './WorkingModeToggle';

/**
 * Barra superior — Liquid Glass refresh 2026-05-27.
 *
 * Wrapper sticky con surface .glass (rounded-3xl 28px) que contiene a la
 * izquierda el greeting "Hola, <título Jedi> (nivel N)" y a la derecha el
 * stack de controles: WorkingModeToggle + XPBar + NotificationBell.
 *
 * Vive arriba del contenido scrollable dentro de la columna central.
 */
export function TopBar() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const s = await fetchStats();
      if (!cancelled && s) setStats(s);
    };
    load();
    const id = setInterval(load, 60_000);
    const onAny = () => load();
    window.addEventListener('ytcp:level-up', onAny);
    window.addEventListener('ytcp:achievement-unlocked', onAny);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('ytcp:level-up', onAny);
      window.removeEventListener('ytcp:achievement-unlocked', onAny);
    };
  }, []);

  const lv = stats ? deriveLevel(stats.xp) : null;
  const title = lv ? titleForLevel(lv.level) : 'Padawan';

  return (
    <header className="sticky top-0 z-10 px-6 pb-3 pt-4">
      <div className="glass flex items-center justify-between gap-6 rounded-[28px] px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-display text-white">
            Hola, {title}
          </h1>
          {lv && (
            <span className="font-display text-base font-medium tracking-display text-accent">
              (nivel {lv.level})
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <WorkingModeToggle />
          <XPBar />
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}
