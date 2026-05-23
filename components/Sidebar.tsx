'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { countUnread, onChange } from '@/lib/notifications';
import { AvatarBadge } from './AvatarBadge';

interface NavItem {
  href: string;
  icon: string;
  label: string;
  isActive: (pathname: string) => boolean;
}

const NAV: NavItem[] = [
  { href: '/', icon: '📺', label: 'Canales', isActive: (p) => p === '/' || p.startsWith('/channels') },
  { href: '/sleep-stories', icon: '🌙', label: 'Sleep Stories', isActive: (p) => p.startsWith('/sleep-stories') },
  { href: '/queue', icon: '📋', label: 'Cola', isActive: (p) => p.startsWith('/queue') },
  { href: '/scheduled', icon: '📅', label: 'Subidas programadas', isActive: (p) => p.startsWith('/scheduled') },
  { href: '/jobs', icon: '⚙️', label: 'Jobs activos', isActive: (p) => p.startsWith('/jobs') },
  { href: '/chats', icon: '💬', label: 'Historial de chats', isActive: (p) => p.startsWith('/chats') },
  { href: '/perfil', icon: '🏛️', label: 'Perfil', isActive: (p) => p.startsWith('/perfil') },
  { href: '/notifications', icon: '🔔', label: 'Notificaciones', isActive: (p) => p.startsWith('/notifications') },
  { href: '/configuracion', icon: '⚙️', label: 'Configuración', isActive: (p) => p.startsWith('/configuracion') },
];

export function Sidebar() {
  const pathname = usePathname() ?? '/';
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const refresh = () => setUnread(countUnread());
    refresh();
    return onChange(refresh);
  }, []);

  return (
    <aside className="flex h-screen w-16 shrink-0 flex-col items-center border-r border-border bg-panel py-3">
      {/* Logo / título compacto */}
      <Link
        href="/"
        className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-bg text-lg font-bold text-accent transition hover:border-accent/60"
        title="YouTube Content Pipeline"
      >
        YT
      </Link>

      <nav className="flex flex-1 flex-col items-center gap-2">
        {NAV.map((item) => {
          const active = item.isActive(pathname);
          const isBell = item.href === '/notifications';
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-lg border text-lg transition ${
                active
                  ? 'border-accent/60 bg-accent/10 text-accent'
                  : 'border-transparent text-zinc-400 hover:border-border hover:bg-bg hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              {isBell && unread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
              {/* Tooltip al hover */}
              <span className="pointer-events-none absolute left-12 z-50 hidden whitespace-nowrap rounded border border-border bg-panel px-2 py-1 text-[11px] text-white shadow-lg group-hover:block">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Footer: avatar + versión */}
      <div className="mt-2 flex flex-col items-center gap-1.5">
        <AvatarBadge />
        <div className="text-[9px] text-zinc-600" title="v0.1">v0.1</div>
      </div>
    </aside>
  );
}
