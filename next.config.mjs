import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone genera `.next/standalone/server.js` + node_modules mínimo. Es lo
  // que arrancamos como subprocess desde Electron en producción (ver
  // electron/main.ts). Funciona con route handlers dinámicos (a diferencia de
  // `output: 'export'` que es incompatible con `force-dynamic`).
  output: 'standalone',
  // Anti-NFT (Node File Tracer): paths como 'Y:/04_DEV/J.A.R.V.I.S/.claude/skills/...'
  // y 'H:/YOUTUBE/_RECURSOS/.../*.mp4' aparecían como dependencias y NFT
  // intentaba leerlos durante el build, fallando con EISDIR/ENOENT en archivos
  // raros (vídeos de cursos con doble punto en nombre, etc).
  //
  // Defensa en dos capas:
  //   1) `outputFileTracingRoot = __dirname` para que NFT NO salga del cwd del
  //      proyecto. Cualquier path absoluto a H:/ o Y:/ queda fuera de scope y
  //      no se intenta trazar.
  //   2) `outputFileTracingExcludes` por si NFT igual mira referencias —
  //      patrones agresivos con varias formas de escribir el path.
  experimental: {
    outputFileTracingRoot: __dirname,
    outputFileTracingExcludes: {
      '*': [
        // Drives externos referenciados como strings de runtime, no como deps
        '**/Y:/**',
        '**/H:/**',
        'Y:/**/*',
        'H:/**/*',
        // Ruta específica de la bóveda y assets — defensa explícita
        '**/Y:/04_DEV/J.A.R.V.I.S/**',
        '**/H:/YOUTUBE/**',
        '**/H:/YOUTUBE/_RECURSOS/**',
        // Variantes con backslash por si NFT normaliza distinto en Windows
        '**\\Y:\\**',
        '**\\H:\\**',
        // Cualquier .mp4 / .mov / .mkv / .pdf que NFT detecte
        '**/*.mp4',
        '**/*.mov',
        '**/*.mkv',
      ],
    },
  },
  images: {
    unoptimized: true,
  },
  // Anti-EISDIR: webpack a veces hace `readlink` sobre archivos `.mp4`/`.pdf`
  // que encuentra recorriendo dirs hermanos (`H:/YOUTUBE/_RECURSOS/...`).
  // Forzamos a webpack a tratar esas extensiones como assets externos sin
  // procesarlos — así no intenta hacer module resolution sobre ellos.
  webpack: (config) => {
    // 1) IgnorePlugin para cualquier import que parezca ser un asset multimedia
    //    desde H:/ o Y:/ — no debería existir pero por defensa.
    const webpack = config.plugins?.find?.((p) => p?.constructor?.name === 'webpack')
      ?? null;
    // 2) Regla: archivos multimedia se manejan como recursos asset, sin parser.
    config.module.rules.push({
      test: /\.(mp4|mov|mkv|webm|avi|m4a|wav|pdf|psd|ai|prproj|aep)$/i,
      type: 'asset/resource',
      generator: { emit: false },
    });
    // 3) Excluir dirs externos de la búsqueda de módulos.
    config.resolve = config.resolve || {};
    config.resolve.symlinks = false;
    return config;
  },
};

export default nextConfig;
