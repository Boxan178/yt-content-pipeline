// Mutación de la decisión de Pablo sobre _PACKAGING/packaging.md, extraída de
// app/api/decisions/route.ts para poder reutilizarla SIN auto-HTTP desde la capa
// de aprobaciones por Telegram (lib/approvals.ts). El endpoint /api/decisions y
// el listener de Telegram llaman a la MISMA función → packaging.md + histórico +
// panel "Decisiones de Pablo" quedan siempre en sync, sea cual sea el origen.
//
// Comportamiento idéntico al que tenía el handler inline (NFC en ambos lados,
// caso ancla de texto libre vs caso checkbox markdown, fallback a sección
// "Decisiones" al final, histórico en _PACKAGING/decisions/<ts>.md).

import 'server-only';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface ApplyDecisionInput {
  /** videoFolder ya normalizado/validado por el caller (normalizeAllowedPath). */
  folder: string;
  /** Texto del item / etiqueta de la decisión. */
  itemText: string;
  /** Respuesta de Pablo. */
  decision: string;
  /** Explicación opcional (va al histórico). */
  rationale?: string;
  /** Línea EXACTA "PENDIENTE ELECCIÓN DE PABLO" a sustituir por "✅ ELEGIDO: …". */
  statusAnchor?: string;
}

export interface ApplyDecisionResult {
  packagingUpdated: boolean;
  historyPath: string;
}

/** Error con código para que el caller mapee a un status HTTP. */
export class DecisionError extends Error {
  code: 'NO_PACKAGING';
  constructor(code: 'NO_PACKAGING', message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Marca la decisión en packaging.md + escribe el histórico. Lanza DecisionError
 * 'NO_PACKAGING' si no existe el packaging.md.
 */
export async function applyDecision(input: ApplyDecisionInput): Promise<ApplyDecisionResult> {
  const { folder } = input;
  const packagingPath = path.join(folder, '_PACKAGING', 'packaging.md');
  if (!existsSync(packagingPath)) {
    throw new DecisionError('NO_PACKAGING', 'packaging.md no existe');
  }

  // normalize('NFC') en ambos lados: el packaging.md del disco y el itemText del
  // cliente pueden venir en formas Unicode distintas (acentos/em-dash). Sin esto
  // el regex no matchea y la decisión se añade duplicada al final en vez de marcar
  // el checkbox/ancla existente.
  let md = (await readFile(packagingPath, 'utf-8')).normalize('NFC');
  const itemText = input.itemText.normalize('NFC');
  const itemEscaped = itemText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^(\\s*)-\\s*\\[\\s*\\]\\s+${itemEscaped}\\s*$`, 'm');
  const ts = new Date();
  const tsHuman = ts.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

  let updated = false;

  // Caso A — decisión "PENDIENTE ELECCIÓN DE PABLO" como texto libre: sustituimos
  // la línea de Estado por el resultado para que deje de aparecer como pendiente.
  if (input.statusAnchor?.trim()) {
    const anchor = input.statusAnchor.trim().normalize('NFC');
    const anchorEscaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const anchorRe = new RegExp(`^(\\s*)${anchorEscaped}\\s*$`, 'm');
    if (anchorRe.test(md)) {
      md = md.replace(anchorRe, (_m, indent: string) => {
        updated = true;
        return `${indent}**Estado:** ✅ ELEGIDO: ${input.decision} _(${tsHuman})_`;
      });
    }
  }

  // Caso B — checkbox markdown `- [ ] <texto>` → `- [x] …`.
  if (!updated && re.test(md)) {
    md = md.replace(re, (_match, indent: string) => {
      updated = true;
      return `${indent}- [x] ${itemText}\n${indent}  → DECISIÓN: ${input.decision} _(${tsHuman})_`;
    });
  }

  if (!updated) {
    // No encontrado: añadir entrada en sección "Decisiones" al final
    md = md.trimEnd() + `\n\n## Decisiones\n\n- ${itemText}\n  → DECISIÓN: ${input.decision} _(${tsHuman})_\n`;
  }

  await writeFile(packagingPath, md, 'utf-8');

  // Histórico en disco
  const decisionsDir = path.join(folder, '_PACKAGING', 'decisions');
  if (!existsSync(decisionsDir)) await mkdir(decisionsDir, { recursive: true });
  const filename = `${ts.toISOString().replace(/[:.]/g, '-').slice(0, 19)}.md`;
  const histPath = path.join(decisionsDir, filename);
  const hist = `# Decisión · ${tsHuman}\n\n**Item**: ${input.itemText}\n\n**Decisión**: ${input.decision}\n${input.rationale ? `\n**Razón**: ${input.rationale}\n` : ''}`;
  await writeFile(histPath, hist, 'utf-8');

  return { packagingUpdated: updated, historyPath: histPath.replace(/\\/g, '/') };
}
