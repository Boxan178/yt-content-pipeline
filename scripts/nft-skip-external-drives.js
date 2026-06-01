// Preload SOLO-BUILD: hace que cualquier acceso de filesystem a las unidades
// externas H:/ y Y:/ se comporte como "no existe" (ENOENT) durante `next build`.
//
// POR QUÉ: el tracing de Next (@vercel/nft) resuelve literales de path a H:/Y:
// (de lib/channels.ts, lib/prompts.ts, etc., por más que intentemos hacerlos
// build-invisibles vía env — NFT/Terser acaban folando algún fallback literal),
// los trata como directorio-asset y los RECORRE. En H:/YOUTUBE hay carpetas de
// nombre raro (p.ej. una carpeta `idea.md`) sobre las que `readlink` lanza EISDIR
// (bug de NFT en Windows) → `next build` PETA. Y seguir el symlink `.claude/skills`
// al NAS (Y:) cuelga.
//
// FIX robusto e independiente de cómo evalúe NFT: interceptamos stat/lstat/
// readlink/realpath y, para paths en H:/ o Y:, devolvemos ENOENT. NFT concluye
// que el path no existe → NO lo recorre, NO lo copia y NO peta. El build solo
// trabaja sobre C: (el proyecto), así que NINGÚN acceso legítimo toca H:/ ni Y:
// durante la compilación: solo se neutraliza la traversía errónea de NFT.
//
// Es BUILD-ONLY (se inyecta vía NODE_OPTIONS=--require desde scripts/build-isolated.js).
// En runtime la app NO carga este preload, así que H:/ e Y: funcionan normales.
const fs = require('fs');

function isExternal(p) {
  try {
    return /^[HY]:[\\/]/i.test(String(p));
  } catch {
    return false;
  }
}

function enoent(p, syscall) {
  const e = new Error(`ENOENT: no such file or directory, ${syscall} '${p}' [nft-skip-external]`);
  e.code = 'ENOENT';
  e.errno = -4058;
  e.syscall = syscall;
  e.path = String(p);
  return e;
}

// ── Sync ────────────────────────────────────────────────────────────────────
for (const m of ['lstatSync', 'statSync', 'readlinkSync', 'realpathSync']) {
  const orig = fs[m];
  if (typeof orig === 'function') {
    fs[m] = function (p, ...a) {
      if (isExternal(p)) throw enoent(p, m);
      return orig.call(this, p, ...a);
    };
  }
}
if (fs.realpathSync && typeof fs.realpathSync.native === 'function') {
  const orig = fs.realpathSync.native;
  fs.realpathSync.native = function (p, ...a) {
    if (isExternal(p)) throw enoent(p, 'realpath');
    return orig.call(this, p, ...a);
  };
}

// ── Async (callback) ─────────────────────────────────────────────────────────
for (const m of ['lstat', 'stat', 'readlink', 'realpath']) {
  const orig = fs[m];
  if (typeof orig === 'function') {
    fs[m] = function (p, ...a) {
      if (isExternal(p)) {
        const cb = a[a.length - 1];
        if (typeof cb === 'function') {
          process.nextTick(() => cb(enoent(p, m)));
          return;
        }
      }
      return orig.call(this, p, ...a);
    };
  }
}

// ── Promises ─────────────────────────────────────────────────────────────────
if (fs.promises) {
  for (const m of ['lstat', 'stat', 'readlink', 'realpath']) {
    const orig = fs.promises[m];
    if (typeof orig === 'function') {
      fs.promises[m] = function (p, ...a) {
        if (isExternal(p)) return Promise.reject(enoent(p, m));
        return orig.call(this, p, ...a);
      };
    }
  }
}
