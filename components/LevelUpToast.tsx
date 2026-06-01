'use client';

import { useEffect, useState } from 'react';

interface LevelUpPayload {
  newLevel: number;
  title?: string;
}
interface AchievementPayload {
  id: string;
  title: string;
  description: string;
  icon: string;
  xpReward: number;
}

type ToastItem =
  | { kind: 'level'; data: LevelUpPayload; key: string }
  | { kind: 'ach'; data: AchievementPayload; key: string };

const TOAST_MS = 4500;

/**
 * Toast centrado arriba que aparece al subir nivel o desbloquear logro.
 * Escucha CustomEvents que dispara `gamification-client.ts`.
 * Dispara confetti con canvas-confetti (dynamic import).
 */
export function LevelUpToast() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function fireConfetti(opts: { palette?: string[] } = {}) {
      // Dynamic import porque canvas-confetti no es SSR-safe
      import('canvas-confetti').then((mod) => {
        const confetti = mod.default;
        const colors = opts.palette ?? ['#fbbf24', '#f59e0b', '#fde68a', '#ffffff'];
        const end = Date.now() + 1200;
        const frame = () => {
          confetti({
            particleCount: 8,
            angle: 60,
            spread: 60,
            origin: { x: 0, y: 0.7 },
            colors,
            scalar: 1.1,
          });
          confetti({
            particleCount: 8,
            angle: 120,
            spread: 60,
            origin: { x: 1, y: 0.7 },
            colors,
            scalar: 1.1,
          });
          if (Date.now() < end) requestAnimationFrame(frame);
        };
        frame();
      }).catch(() => {});
    }

    function onLevelUp(e: Event) {
      const detail = (e as CustomEvent<LevelUpPayload>).detail;
      const key = `lvl-${detail.newLevel}-${Date.now()}`;
      setItems((prev) => [...prev, { kind: 'level', data: detail, key }]);
      fireConfetti({ palette: ['#fbbf24', '#f59e0b', '#fde68a', '#ffffff', '#dbeafe'] });
      setTimeout(() => {
        setItems((prev) => prev.filter((it) => it.key !== key));
      }, TOAST_MS);
    }
    function onAchievement(e: Event) {
      const detail = (e as CustomEvent<AchievementPayload>).detail;
      const key = `ach-${detail.id}-${Date.now()}`;
      setItems((prev) => [...prev, { kind: 'ach', data: detail, key }]);
      fireConfetti({ palette: ['#10b981', '#34d399', '#a7f3d0', '#ffffff'] });
      setTimeout(() => {
        setItems((prev) => prev.filter((it) => it.key !== key));
      }, TOAST_MS);
    }

    window.addEventListener('ytcp:level-up', onLevelUp);
    window.addEventListener('ytcp:achievement-unlocked', onAchievement);
    return () => {
      window.removeEventListener('ytcp:level-up', onLevelUp);
      window.removeEventListener('ytcp:achievement-unlocked', onAchievement);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex flex-col items-center gap-2 pl-20 pr-[max(5rem,30vw)]">
      {items.map((it) => (
        <div
          key={it.key}
          className="pointer-events-auto animate-toast-in flex max-w-md items-center gap-4 rounded-2xl border border-zinc-700/60 bg-gradient-to-br from-zinc-900/95 to-zinc-950/95 px-5 py-3 shadow-2xl backdrop-blur"
        >
          {it.kind === 'level' ? (
            <>
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-2xl font-bold text-zinc-900 shadow-inner">
                {it.data.newLevel}
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] uppercase tracking-widest text-amber-300/80">
                  ¡Subiste de nivel!
                </span>
                <span className="text-lg font-bold text-white">Nivel {it.data.newLevel}</span>
                {it.data.title && (
                  <span className="text-xs text-zinc-400">{it.data.title}</span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400/60 to-emerald-700/40 text-3xl shadow-inner">
                {it.data.icon}
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] uppercase tracking-widest text-emerald-300/80">
                  Logro desbloqueado
                </span>
                <span className="text-base font-bold text-white">{it.data.title}</span>
                <span className="text-xs text-zinc-400">{it.data.description}</span>
                <span className="text-[10px] text-amber-300/70">+{it.data.xpReward} XP</span>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
