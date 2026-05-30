import type { Metadata } from 'next';
import { Inter, Sora, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ChatDock } from '@/components/ChatDock';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { LevelUpToast } from '@/components/LevelUpToast';
import { DevBanner } from '@/components/DevBanner';

// Apple-grade typography stack (refresh 2026-05-27):
//   - Inter: body / UI / forms (font-sans default)
//   - Sora:  display headers + KPI numbers (font-display)
//   - JetBrains Mono: paths, file lists, code (font-mono)
// next/font inyecta las variables CSS y descarga las fonts en build —
// performance superior a <link rel="stylesheet"> de Google Fonts.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});
const sora = Sora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sora',
  display: 'swap',
});
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
  display: 'swap',
});

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
    <html lang="es" className={`${inter.variable} ${sora.variable} ${jetbrains.variable}`}>
      <body className="flex h-screen w-screen flex-col overflow-hidden font-sans">
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

        {/* Toast de subir de nivel / desbloquear logro (con confetti) */}
        <LevelUpToast />
      </body>
    </html>
  );
}
