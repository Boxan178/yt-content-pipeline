'use client';

import { NotificationBell } from './NotificationBell';
import { XPBar } from './XPBar';
import { WorkingModeToggle } from './WorkingModeToggle';

/**
 * Barra superior: toggle "En el PC/Fuera" + barra XP + nivel + campanita.
 * Vive arriba del contenido scrollable, dentro de la columna central.
 */
export function TopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-end gap-3 border-b border-border bg-panel/40 px-4">
      <WorkingModeToggle />
      <XPBar />
      <NotificationBell />
    </header>
  );
}
