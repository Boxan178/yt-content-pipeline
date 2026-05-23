// Borra .next/ y dist-electron/ antes de un build limpio.
// Sin esto, builds incrementales corruptos disparan "PageNotFoundError:
// Cannot find module for page: /api/..." porque Next ve manifests de un
// build anterior interrumpido sin los .js correspondientes.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = [
  path.join(ROOT, '.next'),
  path.join(ROOT, 'dist-electron'),
];

for (const t of TARGETS) {
  if (!fs.existsSync(t)) {
    console.log(`[clean] ${path.relative(ROOT, t)} ya está limpio`);
    continue;
  }
  try {
    // rmSync con recursive+force funciona desde Node 14.14, suficiente para Node 20+
    fs.rmSync(t, { recursive: true, force: true });
    console.log(`[clean] removed ${path.relative(ROOT, t)}`);
  } catch (e) {
    console.error(`[clean] error eliminando ${t}: ${e.message}`);
    process.exit(1);
  }
}

console.log('[clean] OK — listo para build limpio');
