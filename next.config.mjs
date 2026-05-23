/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone genera `.next/standalone/server.js` + node_modules mínimo. Es lo
  // que arrancamos como subprocess desde Electron en producción (ver
  // electron/main.ts). Funciona con route handlers dinámicos (a diferencia de
  // `output: 'export'` que es incompatible con `force-dynamic`).
  output: 'standalone',
  // Anti-NFT (Node File Tracer): el código tiene strings literales como
  // 'Y:/04_DEV/J.A.R.V.I.S/.claude/skills/...' que Next interpreta como
  // dependencias a copiar al bundle standalone. Al intentar `mkdir
  // .next/standalone/Y:\...` falla con ENOENT (rutas inválidas en Windows) y
  // tira el build. En Next 14.2.x esta clave vive bajo `experimental`.
  experimental: {
    outputFileTracingExcludes: {
      '*': [
        // Drives externos referenciados como strings de runtime, no como deps
        '**/Y:/**',
        '**/H:/**',
        'Y:/**/*',
        'H:/**/*',
      ],
    },
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
