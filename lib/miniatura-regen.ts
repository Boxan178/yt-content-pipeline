/**
 * Regeneración de miniatura con concepto DISTINTO.
 *
 * Se usa en dos sitios:
 *  - `POST /api/pipeline/regen-miniatura` (disparo manual: reutilización / limpieza).
 *  - `lib/approvals.ts` cuando Pablo RECHAZA un gate de miniatura (para no re-mandarle
 *    la misma imagen: el pre-edit genérico la reusaba porque NORA la ve en la carpeta).
 *
 * Pasos: aparta las imágenes actuales de MINIATURAS/ a _PACKAGING/_miniaturas-descartadas/
 * (sin borrarlas), limpia .selected-thumb, y lanza NORA+IRIS con una instrucción explícita
 * de concepto NUEVO/DIFERENTE (+ el feedback textual de Pablo si lo hubo).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startJob } from './claude-jobs';
import { buildNoraIris, type VideoContext } from './prompts';

/**
 * Neutraliza el brief de concepto de miniatura en packaging.md. SIN esto, NORA lee el
 * "### Concepto elegido: ..." anterior y regenera el MISMO concepto (con otra imagen) —
 * confirmado en vivo: tras rechazar REST|RISE, NORA volvió a generar REST|RISE porque el
 * brief seguía en el packaging. Reemplazamos toda la sección "## Miniatura" por una
 * directiva de "proponer concepto NUEVO" + el nombre del concepto descartado como prohibido.
 */
function neutralizePackagingMiniatura(folder: string, reason: 'reuse' | 'rejected'): string | null {
  try {
    const pkgPath = path.join(folder, '_PACKAGING', 'packaging.md');
    if (!existsSync(pkgPath)) return null;
    let md = readFileSync(pkgPath, 'utf-8');
    const conceptMatch = md.match(/###\s*Concepto elegido:\s*([^\n(]+)/i);
    const oldConcept = conceptMatch ? conceptMatch[1].trim() : null;
    const why = reason === 'reuse' ? 'era una REUTILIZACIÓN de otro vídeo' : 'RECHAZADO por Pablo';
    const directive =
      `## Miniatura (NORA + IRIS)\n\n` +
      `> ⚠️ CONCEPTO ANTERIOR DESCARTADO (${why}). El brief previo ya NO vale.\n` +
      `> NORA: propón un concepto **COMPLETAMENTE NUEVO y distinto** para ESTE vídeo. Mira las imágenes en\n` +
      `> \`_PACKAGING/_miniaturas-descartadas/\` para ver EXACTAMENTE lo que **NO** hay que repetir.\n` +
      `> PROHIBIDO reusar concepto, composición, encuadre o copy de lo descartado` +
      `${oldConcept ? ` (en concreto, NADA del concepto «${oldConcept}»)` : ''}. Empieza de cero.\n\n` +
      `**Estado:** ⏳ PENDIENTE ELECCIÓN DE PABLO\n\n---\n`;
    const re = /##\s*Miniatura[\s\S]*?(?=\n##\s|$)/;
    if (!re.test(md)) return oldConcept;
    md = md.replace(re, directive);
    writeFileSync(pkgPath, md, 'utf-8');
    return oldConcept;
  } catch {
    return null;
  }
}

export interface RegenMiniaturaOpts {
  channel?: string;
  reason?: 'reuse' | 'rejected';
  notes?: string;
}

export interface RegenMiniaturaResult {
  ok: boolean;
  jobId?: string;
  moved?: number;
  error?: string;
}

function extraInstruction(title: string, reason: 'reuse' | 'rejected', notes?: string): string {
  const fb = notes && notes.trim()
    ? `\n\nFEEDBACK TEXTUAL DE PABLO sobre lo descartado: «${notes.trim()}». Tenlo MUY en cuenta y orienta el concepto nuevo según eso.`
    : '';
  if (reason === 'reuse') {
    return `

⚠️ MOTIVO DE ESTA REGENERACIÓN: la miniatura anterior era una REUTILIZACIÓN ERRÓNEA de la de OTRO vídeo (el MISMO fichero byte a byte). NECESITO una miniatura COMPLETAMENTE NUEVA y ÚNICA, con concepto visual propio y específico del contenido de "${title}". PROHIBIDO reusar concepto, composición o copy de cualquier miniatura previa. Las anteriores están en _PACKAGING/_miniaturas-descartadas/ SOLO como referencia de lo que NO hay que repetir.${fb}`;
  }
  return `

⚠️ MOTIVO DE ESTA REGENERACIÓN: Pablo RECHAZÓ la(s) miniatura(s) anterior(es) de este vídeo —y, si ya van varias, REPETIDAMENTE—. NO quiere otra variación de lo mismo: quiere algo RADICALMENTE DISTINTO.

EXIGENCIA: un concepto visual COMPLETAMENTE DIFERENTE para "${title}" — otro enfoque, otra composición, otro gancho emocional. Si lo anterior era un busto/retrato de mármol, prueba algo más narrativo, simbólico o de escena (o al revés). PROHIBIDO reusar concepto, composición, encuadre o copy de las anteriores. Las descartadas están en _PACKAGING/_miniaturas-descartadas/ SOLO como referencia de lo que NO le gusta. No iteres sobre ellas: empieza de cero y sorpréndele.${fb}`;
}

export function regenerateMiniatura(videoFolder: string, opts: RegenMiniaturaOpts = {}): RegenMiniaturaResult {
  try {
    const folder = path.normalize(videoFolder);
    const name = path.basename(folder);
    const slug = opts.channel || 'moderni-stoici';
    const reason = opts.reason || 'rejected';

    // 1. Apartar las imágenes actuales a backup + limpiar selección.
    const miniDir = path.join(folder, '_PACKAGING', 'MINIATURAS');
    let moved = 0;
    if (existsSync(miniDir)) {
      const backup = path.join(folder, '_PACKAGING', '_miniaturas-descartadas');
      mkdirSync(backup, { recursive: true });
      for (const f of readdirSync(miniDir)) {
        if (!/\.(png|jpe?g|webp)$/i.test(f)) continue;
        try {
          let dest = path.join(backup, f);
          if (existsSync(dest)) dest = path.join(backup, `${Date.now()}_${f}`);
          renameSync(path.join(miniDir, f), dest);
          moved++;
        } catch {
          // si falla un move, seguimos con el resto
        }
      }
      try {
        const sel = path.join(miniDir, '.selected-thumb');
        if (existsSync(sel)) unlinkSync(sel);
      } catch {
        // best-effort
      }
    } else {
      mkdirSync(miniDir, { recursive: true });
    }

    // 1b. Neutralizar el brief de concepto en packaging.md — CLAVE: sin esto NORA lee el
    // "### Concepto elegido" anterior y regenera el MISMO concepto con otra imagen.
    neutralizePackagingMiniatura(folder, reason);

    // 2. Lanzar NORA+IRIS con instrucción de concepto distinto + feedback.
    const v: VideoContext = { channel: slug, title: name, state: 'production', folderPath: folder };
    const built = buildNoraIris(v);
    const job = startJob({
      skill: 'nora-iris',
      label: `NORA+IRIS regen ${reason === 'reuse' ? 'ÚNICA' : 'DISTINTA'} — ${name.slice(0, 32)}`,
      prompt: built.prompt + extraInstruction(name, reason, opts.notes),
      cwd: built.cwd,
      timeoutMs: built.timeoutMs,
      videoFolder: folder.replace(/\\/g, '/'),
      model: built.model,
    });
    return { ok: true, jobId: job.jobId, moved };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
