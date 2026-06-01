# Plan v0.7.2 — Changeset maestro

> Recopilación 2026-06-01. Base: `beta/v0.7.0` @ v0.7.1 (ya incluye los 6 fixes de
> auditoría + filtro de calendario). Objetivo de v0.7.2: programación por calendario
> + blindar la producción autónoma (que la QA NUNCA se salte) + el fix de tags.

## A) Ya implementado esta sesión (SIN commitear)

- **Programación NATIVA por calendario** (`publishAt` calendar-aware). Si un vídeo
  terminado está en el plan editorial con fecha futura → se sube como público
  PROGRAMADO (YouTube lo publica solo a esa hora); si no, oculto. Aviso "📅 Programado".
  - Archivos: `lib/auto-publish.ts` (núcleo), `lib/notify.ts` (aviso programado),
    `lib/upload-schedule.ts` (publishAt al aviso + mover ready), `app/api/calendar/route.ts`
    (dedup planned↔upload), `CALENDARIO-CONTENIDOS.md §9` (doc).
  - Estado: typecheck verde, 17/17 tests (`_test-schedule.js`), tz validada. Kill-switch
    `YTCP_CALENDAR_SCHEDULE_ENABLED=0`.

## B) Pendiente de implementar

### 🔴 CRÍTICO — causó el incidente de hoy (QA saltada)
1. **cola↔render: no relanzar render mientras hay uno en curso** — `lib/job-queue.ts`.
   El relanzado de la cola spawnea un 2º render mientras el 1º sigue detached →
   renders duplicados → hubo que matar el pipeline → se saltó la QA post-render
   (AMELIA/chapters/Marcus Hale) y se subió un vídeo sin revisar.
   **Fix**: antes de relanzar LUIS, detectar render en curso (proceso `render_project.py`
   vivo, o `RENDER/*.mp4` modificado hace < N min) y ESPERAR en vez de duplicar.

2. **tags-trim en el path de subida** — `lib/upload-schedule.ts` (`launchUpload`).
   YouTube rechaza (`invalidTags`) si el total efectivo de tags supera ~500 chars
   (los tags con espacios cuentan +2 por comillas). Hoy la subida con 25 tags falló;
   la AUTO-subida fallaría igual. **Fix**: recortar tags por relevancia hasta <450
   efectivos antes de pasar `--tags`. (Lógica ya probada en `_publish-epictetus.js`.)

### 🟡 COSTURA (de PRUEBA-FUEGO-2026-06-01.md)
3. **parsePabloDecisions: ampliar detección** — `lib/parse-pablo-decisions.ts`.
   Detectar los formatos reales de SARA: heading `## Decisión pendiente`, checkbox
   `(Pablo)`, `Pendiente validación visual de Pablo`. (GAP1 + GAP3 miniatura)
4. **dedupe clear-on-reject** — `lib/approvals.ts` (`detectAndSend`). Excluir
   answered+rejected del set `existing` → la re-propuesta tras rechazo se envía. (GAP2)
5. **cola↔resume** — `lib/approvals.ts` / `lib/job-queue.ts`. La resolución por
   Telegram debe reanudar la cola (`awaiting-decision`→`pending`), no spawnear SARA
   suelto en paralelo a `loopUntilComplete`. (GAP4)

### 🔵 SKILL (en J.A.R.V.I.S., NO en este repo)
6. **scene-gen skip en canal estoico** — `Y:\04_DEV\J.A.R.V.I.S\.claude\skills\sara\SKILL.md`.
   Detectar `sharedBrutosLibrary` → saltar IRIS scenes + CIRO videos → directo a LUIS
   render con los brutos compartidos. (GAP5) Editar en J.A.R.V.I.S. (no por el symlink).

## C) Limpieza pre-commit
- Scripts throwaway `_*.js` / `_*.py` / `_*.txt`: añadir a `.gitignore` o borrar.
  - Conservar como herramientas útiles: `_notify.js`, `_yt-check.py`, `_publish-epictetus.js`, `_readlog.js`, `_launch-job.js`.
  - Borrar one-offs: `_block-item1.js`, `_reset-item1.js`, `_mini-approval.js`, `_tg-test.js`, `_tg-photo.js`, `_wait-job-done.js`, `_watch-loop.js`, `_verify-seo.js`, `_test-schedule.js`, `_prodwatch.js`, `_fix-records.js`, `_sara-postprod-prompt.txt`.
- `CAMBIOS-2026-06-01-calendario-filtros.md`: revisar si commitear con el calendario.

## D) Release
- bump `0.7.1` → `0.7.2` en package.json.
- commits temáticos (feat calendar-schedule / fix cola-render / fix tags / fix approvals…).
- tag `v0.7.2` + push → CI (release.yml) build + publish → auto-update.

## Notas
- Lección del incidente: la causa raíz de la QA saltada fue el gap #1 (cola↔render).
  Arreglarlo elimina la necesidad de matar el pipeline.
- El vídeo de hoy (Epictetus, `LpNdgjaO8Zg`) se rehízo con QA completa y quedó
  programado para 18:15 — fuera de este changeset (ya resuelto en vivo).
