'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Lab sidebar — Liquid Glass refresh 2026-05-27.
 *
 * Sidebar específico del módulo /lab. Magenta-tinted para diferenciarse del
 * sidebar principal (gold). Iconos SVG monocromos en lugar de emojis.
 * Mantiene el patrón nav-item / nav-lab-active del sistema.
 */

const ICONS = {
  drafts: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4.4a2 2 0 0 1 1.6.8l1 1.4a2 2 0 0 0 1.6.8H18.5A2.5 2.5 0 0 1 21 10.5V17a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17z" />
    </svg>
  ),
  ideas: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1.5 1.8 1.5 3V15h5v-1.5c0-1.2.7-2.2 1.5-3A6 6 0 0 0 12 3z" />
    </svg>
  ),
  research: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  lab: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 3h6M10 3v8L4.5 19.5A2 2 0 0 0 6 22h12a2 2 0 0 0 1.5-2.5L14 11V3" />
      <path d="M7 15h10" />
    </svg>
  ),
} satisfies Record<string, ReactNode>;

interface LabNavItem {
  href: string;
  icon: ReactNode;
  label: string;
  description: string;
  isActive: (p: string) => boolean;
}

const LAB_NAV: LabNavItem[] = [
  {
    href: '/lab',
    icon: ICONS.drafts,
    label: 'Canales borrador',
    description: 'Wizard, validación y bootstrap.',
    isActive: (p) =>
      p === '/lab' || p.startsWith('/lab/drafts') || p.startsWith('/lab/new-channel'),
  },
  {
    href: '/lab/ideas',
    icon: ICONS.ideas,
    label: 'Ideas',
    description: 'Banco y asignaciones.',
    isActive: (p) => p.startsWith('/lab/ideas'),
  },
  {
    href: '/lab/research',
    icon: ICONS.research,
    label: 'Investigaciones',
    description: 'Modo rápido y profundo.',
    isActive: (p) => p.startsWith('/lab/research'),
  },
];

export function LabSidebar() {
  const pathname = usePathname() ?? '/';

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col gap-3 p-4">
      {/* Header — etiqueta Lab con icono magenta */}
      <div className="glass flex items-center gap-3 rounded-2xl px-3 py-2.5">
        <span className="nav-lab-active flex h-9 w-9 items-center justify-center rounded-2xl">
          {ICONS.lab}
        </span>
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold tracking-display text-white">
            Lab
          </p>
          <p className="text-[10px] font-medium uppercase tracking-label text-fuchsia-300/80">
            zona experimental
          </p>
        </div>
      </div>

      {/* Nav items — glass cards con magenta accent en activo */}
      <nav className="flex flex-col gap-1.5">
        {LAB_NAV.map((item) => {
          const active = item.isActive(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition ${
                active
                  ? 'border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-100'
                  : 'border border-transparent text-zinc-300 hover:border-white/10 hover:bg-white/5 hover:text-white'
              }`}
              style={
                active
                  ? { boxShadow: '0 0 24px -8px rgba(217,70,239,0.35)' }
                  : undefined
              }
            >
              <span
                className={
                  active
                    ? 'text-fuchsia-300'
                    : 'text-zinc-500 group-hover:text-zinc-200'
                }
              >
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block font-display text-sm font-medium tracking-display ${
                    active ? 'text-fuchsia-100' : 'text-zinc-100'
                  }`}
                >
                  {item.label}
                </span>
                <span className="block text-[10px] text-zinc-500">
                  {item.description}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Footer — dev-mode notice */}
      <div className="mt-auto glass rounded-2xl p-3">
        <p className="mb-1 text-[10px] font-medium uppercase tracking-label text-fuchsia-300/80">
          Solo modo dev
        </p>
        <p className="text-[11px] leading-snug text-zinc-400">
          El Lab no aparece en el sidebar del .exe instalado. Aquí se prototipan
          canales nuevos antes de promoverlos a producción.
        </p>
      </div>
    </aside>
  );
}
