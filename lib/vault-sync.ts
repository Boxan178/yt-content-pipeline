// Sync VAULT → H:/_PACKAGING (no destructivo). Server-only.
//
// El pipeline de SARA escribe packaging.md (con la TABLA de títulos de MARCOS),
// titulos.md y descripcion-seo.md en la carpeta HOGAR de la vault. La app (gate de
// Telegram, auto-publish, SEO) lee de `H:/…/_PACKAGING/`. Cuando el pipeline no
// llegó a copiar a H:, el gate no dispara / sale sin opciones y la auto-subida
// pierde el SEO (casos reales 2026-06-08: vídeo de la arena sin packaging.md en H:,
// vídeo de los 90 días con el gate de título a 1 sola opción).
//
// Este sync garantiza que `_PACKAGING/` tenga esos 3 markdown. Es **no destructivo**:
// solo copia lo que FALTA en H: (nunca pisa una decisión ya aplicada por Pablo, p.ej.
// un packaging.md con "✅ ELEGIDO"). La miniatura NO se sincroniza desde la vault: el
// flujo de imagen tiene a H: `_PACKAGING/MINIATURAS/` como origen (ahí escribe IRIS).

import 'server-only';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { resolveVaultFolder } from './vault-resolve';

/** Ficheros que se reflejan vault → `_PACKAGING/` (mismo nombre). */
const SYNCED = ['packaging.md', 'titulos.md', 'descripcion-seo.md'];

export interface VaultSyncResult {
  vaultFolder: string | null;
  copied: string[];
}

/**
 * Asegura que `H:/…/<vídeo>/_PACKAGING/` tenga los markdown del pipeline copiados
 * desde la vault. Solo copia lo que falta. No lanza.
 */
export function ensureVaultPackagingSynced(channelSlug: string, videoFolder: string): VaultSyncResult {
  const copied: string[] = [];
  let vaultFolder: string | null = null;
  try {
    vaultFolder = resolveVaultFolder(channelSlug, videoFolder);
    if (!vaultFolder) return { vaultFolder: null, copied };
    const pkgDir = path.join(videoFolder, '_PACKAGING');
    if (!existsSync(pkgDir)) mkdirSync(pkgDir, { recursive: true });
    for (const fname of SYNCED) {
      const src = path.join(vaultFolder, fname);
      const dst = path.join(pkgDir, fname);
      if (existsSync(dst) || !existsSync(src)) continue; // no destructivo
      try {
        copyFileSync(src, dst);
        copied.push(fname);
      } catch {
        // un fichero problemático no aborta el resto
      }
    }
  } catch {
    // best-effort: nunca tumbar al caller
  }
  return { vaultFolder, copied };
}
