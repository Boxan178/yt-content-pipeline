// Preload de diagnóstico: registra QUIÉN hace readlink sobre H:/ o Y:/ (con stack).
// Uso: NODE_OPTIONS="--require C:/dev/yt-content-pipeline/_trace-readlink.js" next build
// Si el build pasa limpio, este log queda vacío. Si peta, el stack apunta al culpable.
const fs = require('fs');
const LOG = 'C:/dev/yt-content-pipeline/readlink-trace.log';
let n = 0;
function ext(p) {
  try { return /^[HY]:[\\/]/i.test(String(p)); } catch { return false; }
}
function rec(kind, p) {
  if (!ext(p)) return;
  if (n++ > 10) return;
  try {
    fs.appendFileSync(
      LOG,
      `\n=== [${kind}] ${String(p)}\n` +
        new Error().stack.split('\n').slice(2, 20).join('\n') + '\n',
    );
  } catch {}
}
for (const m of ['readlinkSync', 'readlink', 'lstatSync']) {
  const o = fs[m];
  if (typeof o === 'function') {
    fs[m] = function (p, ...a) { rec(m, p); return o.call(this, p, ...a); };
  }
}
if (fs.promises && fs.promises.readlink) {
  const o = fs.promises.readlink;
  fs.promises.readlink = function (p, ...a) { rec('promises.readlink', p); return o.call(this, p, ...a); };
}
