# PRUEBA 3 — Render + Auditoría + Chapters reales (preparada 2026-06-03)

> Cierre de la prueba 2: pipeline pre-edit validado e2e + 10 bugs cazados/arreglados + 3 mejoras
> (columna kanban "Cola de render", MARCOS=3 títulos, NORA mina outliers). Detalle en
> `BITACORA-PIPELINE-2026-06-02.md`.

## Objetivo
Llevar los 6 vídeos de Moderni Stoici de **"Cola de render"** a **"listos para subir"**:
renderizar → **auditar el render a fondo (lo más importante)** → cerrar la descripción con
chapters de **timestamps REALES**.

## Estado de partida (al cierre de la prueba 2)
- 6 vídeos en `_EN PRODUCCIÓN` con pre-edit COMPLETO (packaging, guion, locución, brutos, miniatura)
  → aparecen en la nueva columna **"Cola de render"** del kanban (`Ctrl+Shift+R` para verla).
- **Título + miniatura aprobados por Pablo** (los 6, verificado).
- **Descripción SEO v1** (borrador, chapters ESTIMADOS): **6/6** (4 originales + «5 Stoic Rules» y
  «Marcus Aurelius Used Meditations» generadas el 2026-06-03 vía `gen-description`).
- SIN render todavía. SIN chapters reales todavía.

## Flujo (en orden)

### 0 · Pre-flight
- Confirmar los 6: título ✓ · miniatura ✓ · `descripcion-seo.md` ✓.
- Algrow vivo: `GET /api/health/algrow`.

### 1 · RENDER (LUIS)
- Skill `luis` (`buildLuisRender`). Render vía `tools/render_project.py` (venv `C:\.venvs\auto-edit`).
- **NUNCA el MCP `mcp__premiere-pro__*`** (nuevo, sin probar, bloquea el render).
- **Uno a uno tras tu luz verde** — no en masa. El gate "luz verde para editar" quedó montado en la prueba 2.
- ~18-25 min por long-form. Vigilar el log.

### 2 · ⭐ AUDITORÍA DEL RENDER — LA PARTE MÁS IMPORTANTE (Pablo insiste)
> *"Insisto mucho en esta parte porque es la más importante. Se revisa el render, se audita, se hace
> todo lo que se tiene que hacer."* — Pablo
- **Auto-audit visual** (`/watch`, 24 frames del MP4): capa oscura, subs a 1 línea, sin asteriscos
  visibles, último frame limpio.
- **AMELIA** — audita el MP4 como producto digital del canal. Customer persona: MARCUS HALE.
- **MARCUS HALE** — review como viewer-persona ("¿me hablaría / haría clic?").
- Decisión: APTO → paso 3. Fallo técnico fixable → máx 2 reintentos de render. Fallo semántico →
  registrar y decidir con Pablo. **NO pasar a chapters/subida hasta render auditado y APTO.**

### 3 · CHAPTERS REALES (post-render, sobre la versión FINAL)
> *"Con la versión final encima de la mesa, te vuelves a ver el vídeo y divides el vídeo por
> capítulos, con los timestamps REALES."* — Pablo
- **Mecanismo listo:** `POST /api/pipeline/finalize-chapters` `{ channel, only:[<vídeo>] }` →
  `buildChaptersFinal`.
- Re-ve/transcribe el MP4 con Whisper (`youtube-seo-optimizer` / `/chapters`), sustituye los
  `CHAPTERS (ESTIMATED)` por timestamps REALES en `descripcion-seo.md`, y marca la descripción como
  **FINAL** (quita el aviso PRE-EDIT DRAFT).
- **Guard:** solo actúa si hay MP4 principal (>50 MB). Sin render → lo salta (es paso POST-render).
- Reglas YT: primer capítulo `0:00`, mínimo 3, cada uno ≥10 s.

### 4 · (Después) Programación / subida
- Gate por vídeo "cuándo publicar" (📝 fecha/hora) — montado parcial en la prueba 2.
- Pendiente: la programación NATIVA real en YouTube al subir.

## Mecanismos listos (endpoints / skills)
| Paso | Cómo |
|---|---|
| Render + audit | skill `luis` (botón del modal o cola) |
| Descripción v1 | `POST /api/pipeline/gen-description` |
| **Chapters reales** | `POST /api/pipeline/finalize-chapters` |
| Re-titular (3 opciones) | `POST /api/pipeline/retitle` |
| Regenerar miniatura distinta | `POST /api/pipeline/regen-miniatura` |
| Salud Algrow | `GET /api/health/algrow` |

## Lecciones de la prueba 2 (a NO repetir)
- **Algrow caído** puede ensuciar otro vídeo (reuso de miniatura silencioso). Verificar unicidad por hash
  (`Get-FileHash` de `_PACKAGING/MINIATURAS/*`); si `generate_image` falla → vídeo BLOQUEADO, nunca reusar.
- **Rechazo de miniatura** → ahora regenera concepto DISTINTO (3 capas arregladas: mover imagen +
  neutralizar brief packaging + NORA con feedback).
- **MARCOS** → exactamente 3 títulos (cap garantizado en el gate).
- **NORA** → mina outliers y los adapta (swipe file `agente-miniaturas/swipe-file-outliers.md` + PASO 2.5).
- **No editar `approvals.json` a mano** (lo escribe el poller cada 3s → carrera/BOM rompe JSON.parse).

_Sin commitear. Todo `tsc --noEmit` verde al cierre del 2026-06-03._
