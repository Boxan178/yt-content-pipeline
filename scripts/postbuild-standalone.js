// Tras `next build` con `output: 'standalone'`, Next deja:
//   .next/standalone/server.js
//   .next/standalone/node_modules/   (deps mínimas de runtime)
//   .next/standalone/.next/server/   (chunks server)
//   .next/static/                    ← QUEDA FUERA del standalone
//   public/                          ← QUEDA FUERA del standalone
//
// El server.js arranca esperando que `.next/static` y `public` vivan dentro de
// su propio cwd (`.next/standalone`). Si no los copiamos, los assets dan 404.
//
// Este script copia ambos al lugar correcto para que el bundle quede
// autocontenido y electron-builder solo tenga que empaquetar
// `.next/standalone/` entero como extraResource.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const STANDALONE = path.join(ROOT, '.next', 'standalone');
const STATIC_SRC = path.join(ROOT, '.next', 'static');
const STATIC_DST = path.join(STANDALONE, '.next', 'static');
const PUBLIC_SRC = path.join(ROOT, 'public');
const PUBLIC_DST = path.join(STANDALONE, 'public');

function copyRecursive(src, dst) {
  if (!fs.existsSync(src)) {
    console.warn(`[postbuild] skip: ${src} no existe`);
    return;
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  // fs.cpSync existe desde Node 16.7, suficiente para Node 20+ que pide Electron 33.
  fs.cpSync(src, dst, { recursive: true, force: true });
  console.log(`[postbuild] copied ${path.relative(ROOT, src)} → ${path.relative(ROOT, dst)}`);
}

if (!fs.existsSync(STANDALONE)) {
  console.error('[postbuild] .next/standalone no existe. ¿Olvidaste `next build` con `output: "standalone"` en next.config.mjs?');
  process.exit(1);
}

copyRecursive(STATIC_SRC, STATIC_DST);
copyRecursive(PUBLIC_SRC, PUBLIC_DST);

console.log('[postbuild] standalone listo en .next/standalone/');
