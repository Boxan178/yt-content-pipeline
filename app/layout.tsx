import type { Metadata } from 'next';
import './globals.css';
import { ChatDock } from '@/components/ChatDock';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { UpdateToast } from '@/components/UpdateToast';
import { LevelUpToast } from '@/components/LevelUpToast';
import { DevBanner } from '@/components/DevBanner';

export const metadata: Metadata = {
  title: 'YouTube Content Pipeline',
  description: 'Ventana de supervisión + riendas sobre el proceso de producción de YouTube.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="flex h-screen w-screen flex-col overflow-hidden">
        {/* Banner amarillo si estamos en modo desarrollo */}
        <DevBanner />

        <div className="flex min-h-0 flex-1">
        {/* Sidebar izquierda — navegación */}
        <Sidebar />

        {/* Columna central: TopBar + contenido scrollable */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <TopBar />
          <div className="relative flex-1 overflow-auto">
            {children}
          </div>
        </div>

        {/* Chat derecho persistente (sustituye a la terminal xterm vieja) */}
        <ChatDock />
        </div>

        {/* Toast de actualización disponible (renderiza solo si llega evento Electron) */}
        <UpdateToast />

        {/* Toast de subir de nivel / desbloquear logro (con confetti) */}
        <LevelUpToast />
      </body>
    </html>
  );
}
