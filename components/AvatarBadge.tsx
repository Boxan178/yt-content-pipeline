'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchStats } from '@/lib/gamification-client';
import { deriveLevel, titleForLevel, type Stats } from '@/lib/gamification-types';

/**
 * Pill compacta al pie de la sidebar: avatar (foto si existe en
 * ~/.yt-content-pipeline/avatar.jpg, iniciales si no) + nivel + título.
 * Click → /perfil.
 */
export function AvatarBadge() {
  const [stats, setStats] = useState<Stats | null>(null);
  // Asumimos imagen rota por defecto. Solo cuando onLoad confirma, mostramos
  // el <img>. Así NUNCA aparece el alt text como texto roto en pantalla.
  const [imgOk, setImgOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const s = await fetchStats();
      if (!cancelled && s) setStats(s);
    };
    load();
    const id = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const lv = stats ? deriveLevel(stats.xp) : null;
  const title = lv ? titleForLevel(lv.level) : '';

  return (
    <Link
      href="/perfil"
      className="group flex h-12 w-12 items-center justify-center"
      title={lv ? `Nivel ${lv.level} · ${title}` : 'Mi perfil'}
    >
      <div className="avatar-glow relative h-10 w-10 overflow-hidden rounded-full bg-gradient-to-br from-amber-700/70 to-amber-900 transition group-hover:[box-shadow:0_0_18px_-2px_rgba(201,169,106,0.55)]">
        {/* Iniciales SIEMPRE de fondo. Si la imagen carga OK, se monta encima. */}
        <span className="flex h-full w-full items-center justify-center text-sm font-bold text-amber-200">
          P
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={lv ? `/api/avatar?level=${lv.level}` : '/api/avatar'}
          alt=""
          onLoad={() => setImgOk(true)}
          onError={() => setImgOk(false)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
            imgOk ? 'opacity-100' : 'opacity-0'
          }`}
          // pixelated rendering por si el archivo es sprite pixel-art
          style={{ imageRendering: 'pixelated' }}
        />
        {lv && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-bg bg-amber-500 text-[9px] font-bold text-zinc-900 shadow">
            {lv.level}
          </span>
        )}
      </div>
    </Link>
  );
}
