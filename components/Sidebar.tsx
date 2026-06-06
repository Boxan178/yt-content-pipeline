'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { countUnread, onChange } from '@/lib/notifications';
import { AvatarBadge } from './AvatarBadge';
import { NotionPollerBadge } from './NotionPollerBadge';

/**
 * SF Symbols-style line icons — monocromos, stroke 1.5, currentColor.
 * Sustituyen a los emojis 3D nativos (inconsistentes entre sets) por una
 * familia coherente que respeta el tracking Apple-grade del resto de la UI.
 * Refresh visual: 2026-05-27.
 */
const ICONS = {
  channels: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="14" rx="2.5" />
      <path d="M8 21h8M12 18v3" />
    </svg>
  ),
  calendar: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
      <path d="M7.5 13h.01M12 13h.01M16.5 13h.01M7.5 16.5h.01M12 16.5h.01" />
    </svg>
  ),
  automator: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M7 3v18M17 3v18M3 7.5h18M3 12h18M3 16.5h18" />
    </svg>
  ),
  queue: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6.5l1.5 1.5L8.5 5M4 12.5l1.5 1.5L8.5 11M4 18.5l1.5 1.5L8.5 17M13 7h7M13 13h7M13 19h7" />
    </svg>
  ),
  visualLab: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22a10 10 0 1 1 10-10c0 2.5-2 4.5-4.5 4.5H15a2 2 0 0 0-2 2 2 2 0 0 1-2 2 1 1 0 0 0-1 1 1.5 1.5 0 0 1-1.5 1.5z" />
      <circle cx="7.5" cy="10.5" r="1" />
      <circle cx="12" cy="7" r="1" />
      <circle cx="16.5" cy="10.5" r="1" />
    </svg>
  ),
  scheduled: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  ),
  jobs: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  chats: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9 8.5 8.5 0 0 1 8.5 8.5z" />
    </svg>
  ),
  perfil: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="9" r="6" />
      <path d="M8.5 13.5L7 22l5-3 5 3-1.5-8.5" />
    </svg>
  ),
  bell: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  lab: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6M10 3v8L4.5 19.5A2 2 0 0 0 6 22h12a2 2 0 0 0 1.5-2.5L14 11V3" />
      <path d="M7 15h10" />
    </svg>
  ),
} satisfies Record<string, ReactNode>;

interface NavItem {
  href: string;
  icon: ReactNode;
  label: string;
  isActive: (pathname: string) => boolean;
}

const NAV: NavItem[] = [
  { href: '/', icon: ICONS.channels, label: 'Canales', isActive: (p) => p === '/' || p.startsWith('/channels') },
  { href: '/calendar', icon: ICONS.calendar, label: 'Calendario', isActive: (p) => p.startsWith('/calendar') },
  { href: '/automator', icon: ICONS.automator, label: 'Automator', isActive: (p) => p.startsWith('/automator') },
  { href: '/queue', icon: ICONS.queue, label: 'Cola', isActive: (p) => p.startsWith('/queue') },
  { href: '/visual-lab', icon: ICONS.visualLab, label: 'Visual Lab', isActive: (p) => p.startsWith('/visual-lab') },
  { href: '/scheduled', icon: ICONS.scheduled, label: 'Subidas programadas', isActive: (p) => p.startsWith('/scheduled') },
  { href: '/jobs', icon: ICONS.jobs, label: 'Jobs activos', isActive: (p) => p.startsWith('/jobs') },
  { href: '/chats', icon: ICONS.chats, label: 'Historial de chats', isActive: (p) => p.startsWith('/chats') },
  { href: '/perfil', icon: ICONS.perfil, label: 'Perfil — Templo Jedi', isActive: (p) => p.startsWith('/perfil') },
  { href: '/notifications', icon: ICONS.bell, label: 'Notificaciones', isActive: (p) => p.startsWith('/notifications') },
  { href: '/configuracion', icon: ICONS.settings, label: 'Configuración', isActive: (p) => p.startsWith('/configuracion') },
];

export function Sidebar() {
  const pathname = usePathname() ?? '/';
  const [unread, setUnread] = useState(0);
  const [isDev, setIsDev] = useState(false);

  useEffect(() => {
    const refresh = () => setUnread(countUnread());
    refresh();
    return onChange(refresh);
  }, []);

  // LAB: visible en modo dev. Dos vías de detección:
  //   - Electron (.exe instalado o `electron .`): `window.electronAPI?.isDev`
  //     lo expone el preload con el flag `--ytcp-dev=1`.
  //   - Navegador puro corriendo `next dev` (Pablo en localhost:3002, etc.):
  //     no hay electronAPI, pero `process.env.NODE_ENV === 'development'`
  //     queda inyectado por Next al bundle. Si es dev, mostramos el Lab.
  // En el `.exe` empaquetado (`app.isPackaged === true`), electronAPI.isDev
  // será `false` y NODE_ENV será 'production' → Lab oculto. Comportamiento
  // correcto: el `.exe` instalado no expone features experimentales.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const electronDev = window.electronAPI?.isDev === true;
      const nextDev = process.env.NODE_ENV === 'development';
      setIsDev(electronDev || nextDev);
    }
  }, []);

  const labActive = pathname.startsWith('/lab');

  return (
    <aside
      className="flex h-screen w-16 shrink-0 flex-col items-center py-4"
      style={{ backgroundColor: '#0d0f15', borderRight: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Logo / título compacto — squircle con tinte gold ESTÁTICO de marca.
          NO usa nav-active (borde gold fuerte + glow) para no competir con el
          item de navegación realmente seleccionado: borde neutro, sin glow. */}
      <Link
        href="/"
        className="mb-5 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-[rgba(201,169,106,0.10)] font-display text-sm font-bold tracking-tight text-[#e8d4a8] transition hover:bg-[rgba(201,169,106,0.16)]"
        title="YouTube Content Pipeline"
      >
        YT
      </Link>

      <nav className="flex flex-1 flex-col items-center gap-1.5">
        {NAV.map((item) => {
          const active = item.isActive(pathname);
          const isBell = item.href === '/notifications';
          const isConfig = item.href === '/configuracion';
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-2xl ${
                active ? 'nav-active' : 'nav-item text-zinc-400 hover:text-white'
              }`}
            >
              {item.icon}
              {isBell && unread > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white"
                  style={{ boxShadow: '0 0 8px rgba(239,68,68,0.5)' }}
                >
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
              {isConfig && <NotionPollerBadge />}
              {/* Tooltip al hover */}
              <span className="pointer-events-none absolute left-12 z-50 hidden whitespace-nowrap rounded-lg border border-white/10 bg-black/80 px-2 py-1 text-[11px] text-white shadow-lg backdrop-blur-md group-hover:block">
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* LAB — solo en dev, magenta, separado por divider */}
        {isDev && (
          <>
            <div className="my-2 h-px w-6" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <Link
              href="/lab"
              title="Lab (solo modo dev)"
              className={`group relative flex h-10 w-10 items-center justify-center rounded-2xl ${
                labActive ? 'nav-lab-active' : 'nav-item text-fuchsia-300/80 hover:text-fuchsia-200'
              }`}
            >
              {ICONS.lab}
              <span className="pointer-events-none absolute left-12 z-50 hidden whitespace-nowrap rounded-lg border border-white/10 bg-black/80 px-2 py-1 text-[11px] text-white shadow-lg backdrop-blur-md group-hover:block">
                Lab (solo modo dev)
              </span>
            </Link>
          </>
        )}
      </nav>

      {/* Footer: avatar Jedi (con glow gold permanente) */}
      <AvatarBadge />
    </aside>
  );
}
