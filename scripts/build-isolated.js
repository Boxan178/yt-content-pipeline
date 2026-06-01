// Ejecuta un comando de build con el `.claude/` del proyecto AISLADO.
//
// PROBLEMA (confirmado con _trace-readlink.js): el plugin de tracing de Next (NFT)
// trata `path.join(JARVIS_ROOT, '.claude', 'skills', ...)` de lib/lab/bootstrap-runner.ts
// como el glob `**/.claude/skills`, que matchea el `.claude/` REAL del proyecto.
// Entonces NFT lo emite recursivo: sigue el symlink `.claude/skills` → NAS (Y:,
// lento/cuelga) y entra en `.claude/worktrees/*/` (copias viejas de channels.ts con
// literales `H:/YOUTUBE/...` → `readlink` EISDIR sobre carpetas tipo `idea.md`).
// Resultado: `next build` peta con "EISDIR: illegal operation on a directory, readlink".
//
// SOLUCIÓN (robusta, independiente de cómo evalúe NFT/Terser): apartar físicamente
// el symlink `skills` y la carpeta `worktrees` mientras compila, y restaurarlos
// SIEMPRE al terminar (éxito, fallo o Ctrl-C). El build NO usa skills ni worktrees
// — solo los necesita el runtime (claude spawneado los resuelve por su cuenta).
//
// Uso: node scripts/build-isolated.js <comando...>
//   p.ej. node scripts/build-isolated.js npm run build:raw
// Si no se pasa comando, por defecto corre `npm run build:raw`.
// Diagnóstico opcional: YTCP_BUILD_TRACE=1 inyecta _trace-readlink.js (registra
// quién hace readlink sobre H:/ o Y:/ en readlink-trace.log).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CLAUDE = path.join(ROOT, '.claude');
const STASH = path.join(ROOT, '..', '_ytcp_build_stash'); // fuera del tracing root
const ITEMS = ['skills', 'worktrees'];
const moved = [];

const CMD = process.argv.slice(2).join(' ') || 'npm run build:raw';

function lexists(p) { try { fs.lstatSync(p); return true; } catch { return false; } }

function stash() {
  if (!fs.existsSync(STASH)) fs.mkdirSync(STASH, { recursive: true });
  for (const it of ITEMS) {
    const src = path.join(CLAUDE, it);
    if (!lexists(src)) { console.log(`[isolate] .claude/${it} no existe, salto`); continue; }
    const dst = path.join(STASH, it);
    try {
      if (lexists(dst)) fs.rmSync(dst, { recursive: true, force: true });
      fs.renameSync(src, dst); // rename de un symlink mueve el LINK, no su destino (NAS intacto)
      moved.push([src, dst]);
      console.log(`[isolate] APARTADO .claude/${it}`);
    } catch (e) {
      console.error(`[isolate] no pude apartar .claude/${it} (¿en uso?): ${e.message}`);
    }
  }
}

let restored = false;
function restore() {
  if (restored) return; restored = true;
  for (const [src, dst] of moved) {
    try {
      if (lexists(dst)) fs.renameSync(dst, src);
      console.log(`[isolate] restaurado .claude/${path.basename(src)}`);
    } catch (e) {
      console.error(`[isolate] !! RESTORE FALLÓ ${src}: ${e.message} (está en ${dst})`);
    }
  }
  try { if (fs.existsSync(STASH) && fs.readdirSync(STASH).length === 0) fs.rmdirSync(STASH); } catch {}
}

process.on('exit', restore);
process.on('SIGINT', () => { restore(); process.exit(130); });
process.on('SIGTERM', () => { restore(); process.exit(143); });

const env = { ...process.env };
// Preload SIEMPRE: neutraliza la traversía de NFT a H:/ y Y: (ENOENT) → el build
// no peta con EISDIR ni cuelga siguiendo el symlink de skills al NAS, sea cual sea
// el literal que NFT acabe folando. Build-only (no afecta al runtime).
const preloads = [path.join(ROOT, 'scripts', 'nft-skip-external-drives.js')];
// Diagnóstico opcional: registra quién hace readlink sobre H:/ o Y: (YTCP_BUILD_TRACE=1).
if (process.env.YTCP_BUILD_TRACE === '1') {
  preloads.push(path.join(ROOT, '_trace-readlink.js'));
}
env.NODE_OPTIONS =
  (env.NODE_OPTIONS ? env.NODE_OPTIONS + ' ' : '') +
  preloads.map((p) => '--require ' + p.replace(/\\/g, '/')).join(' ');

let code = 0;
try {
  stash();
  console.log(`[isolate] === build empieza (con .claude aislado): ${CMD} ===`);
  execSync(CMD, { cwd: ROOT, stdio: 'inherit', env });
} catch (e) {
  code = e.status || 1;
  console.error(`[isolate] build falló (exit ${code})`);
} finally {
  restore();
}
process.exit(code);
