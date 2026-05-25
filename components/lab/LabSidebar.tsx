'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface LabNavItem {
  href: string;
  icon: string;
  label: string;
  isActive: (p: string) => boolean;
}

const LAB_NAV: LabNavItem[] = [
  {
    href: '/lab',
    icon: '📁',
    label: 'Canales borrador',
    isActive: (p) => p === '/lab' || p.startsWith('/lab/drafts') || p.startsWith('/lab/new-channel'),
  },
  {
    href: '/lab/ideas',
    icon: '💡',
    label: 'Ideas',
    isActive: (p) => p.startsWith('/lab/ideas'),
  },
  {
    href: '/lab/research',
    icon: '🔬',
    label: 'Investigaciones',
    isActive: (p) => p.startsWith('/lab/research'),
  },
];

export function LabSidebar() {
  const pathname = usePathname() ?? '/';

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col gap-1 border-r border-border bg-panel/40 p-3">
      <div className="mb-2 flex items-center gap-2 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        <span>🧪</span>
        <span>Lab</span>
      </div>
      {LAB_NAV.map((item) => {
        const active = item.isActive(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
              active
                ? 'border-accent/60 bg-accent/10 text-accent'
                : 'border-transparent text-zinc-300 hover:border-border hover:bg-bg hover:text-white'
            }`}
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}

      <div className="mt-auto rounded-md border border-dashed border-amber-700/40 bg-amber-900/10 p-2 text-[10px] leading-tight text-amber-300/80">
        Solo visible en modo dev.
        <br />
        En el .exe instalado, el lab no aparece en sidebar.
      </div>
    </aside>
  );
}
