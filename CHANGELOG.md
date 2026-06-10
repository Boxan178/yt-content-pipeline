# CHANGELOG — yt-content-pipeline

Registro **único** de versiones de la app de escritorio. Fuente de verdad para no dispersarnos: cada vez que se publica una release nueva, se añade aquí su entrada.

- **Versión vigente (Latest):** `v0.7.9` — publicada 2026-06-10.
- **Versión "oficial-escritorio" histórica intocable:** `v0.6.0` (referida así en `CLAUDE.md` / `ACCESO-WEB.md`).
- **Distribución:** GitHub Releases (`Boxan178/yt-content-pipeline`, repo público) → installer NSIS + portable + `latest.yml`. Proceso en `RELEASE.md`.
- **Auto-update:** la app comprueba **solo al arrancar** y cada 4h. Para forzar la pastilla (UpdateToast): cerrar y reabrir la app instalada. El portable NO se autoactualiza. Kill-switch: arrancar con `YTCP_UPDATER_ENABLED=0`.

Convención de columnas: ✅ = release publicada en GitHub · 🏷️ = solo tag/commit (sin binarios publicados).

---

## v0.7.9 — 2026-06-10 ✅ (Latest)
Sesión "la app no puede volver a subir un duplicado". Causa raíz del susto de hoy: Pablo movió a `_LISTOS PARA SUBIR` un vídeo que YA estaba en YouTube y el auto-publish lo re-subió (quedó privado, cancelado a mano).
- **Guard anti-resubida contra YouTube** (`lib/auto-publish.ts`): antes de encolar, compara el título extraído Y el nombre de carpeta (normalizados) contra el cache real del canal (`youtube-schedule.json`, RSS + Data API). Si ya existe → escribe el marker `.auto-published.json` (no se reintenta nunca) + aviso por Telegram con instrucciones para forzar si fuera deliberado. Cache vacío → no bloquea.
- **Contención en datos** (operación manual de hoy, sin código): los 24 vídeos de `_ARCHIVO` + el publicado que seguía en producción quedaron marcados con `.auto-published.json` — moverlos de columna ya no puede dispararles una subida.
- **Tags basura del frontmatter** (`lib/extract-metadata.ts`): `extractMetadata` y `extractSeoDescription` ahora quitan el frontmatter YAML antes de parsear — la línea `tags: [youtube, seo, …]` de la vault se colaba como tags de YouTube (subida real de hoy con tags `"[youtube"`, `"long-form]"`).
- Consolida en git el código fuente de v0.7.7 + v0.7.8 (publicadas desde working tree sin commitear).

## v0.7.8 — 2026-06-08 ✅
Sesión "arregla TODO lo que pueda causar problemas" — cierra la familia de bugs vault↔H: que rompía gates y SEO.
- **Sync vault → `_PACKAGING/` (no destructivo)** — nuevo `lib/vault-sync.ts` + resolver compartido `lib/vault-resolve.ts` (casa carpeta de H: con la de la vault por `slug` → `pipeline_item_id` → match por título). Garantiza que `_PACKAGING/` tenga packaging.md + titulos.md + descripcion-seo.md aunque el pipeline solo escribiera en la vault. Es la **cura de raíz** de:
  - **Gate de título que llegaba con 1 sola opción** (o no llegaba): las 8 opciones de MARCOS viven en la vault; ahora se sincronizan a H: y el gate las parsea. Fallback extra en `approvals.ts`: si aún hay <2 opciones, lee `_PACKAGING/titulos.md` directo. (Caso real: vídeo de los 90 días subido sin que Pablo eligiera título de verdad.)
  - **Gate de miniatura que no disparaba** cuando el `packaging.md` solo estaba en la vault (caso real: vídeo de la arena).
- **`getVaultSeo` robusto** — usa el resolver compartido y lee el título de frontmatter `video:` **o** `title:` (era inconsistente entre vídeos). Cableado el sync también en auto-publish.
- **Cadencia 2 vídeos/día** — `ChannelCadence.slots: ["10:00","17:30"]` (HH:MM, soporta minutos); `nextFreeSlotForChannel` y `computeGaps` ahora colocan/cuentan por franja, no por día (antes solo cabía 1/día). Moderni Stoici pasa a 14/semana en 2 franjas.

## v0.7.7 — 2026-06-08 ✅
- **Columna "Pendiente de revisar" en el kanban**: `PENDIENTE DE REVISAR/` (donde LUÍS deja los renders terminados a la espera de revisión) era un `ignoreFolder` → los vídeos que LUÍS terminaba **desaparecían del tablero**. Ahora es un estado visible (`review` en `lib/channels.ts`), entre "Cola de render" y "Listos para subir", con drag-drop. Aplicado a Moderni/Moderno Estoico + los 3 canales sleep.
- **Auto-publish: fin de las subidas con metadata basura**. Tres fallos encadenados arreglados:
  - El título podía salir como el **nombre de la miniatura** (`B-REACT-...-v1.png`) si el gate contaminaba el "✅ ELEGIDO". `extractMetadata` ahora descarta valores que parecen un filename y cae a "Working title" (`lib/extract-metadata.ts`).
  - El SEO real (título final + descripción + tags) vive en la **vault** (`youtube-os/.../videos/<slug>/descripcion-seo.md`), no siempre en `_PACKAGING/`. Nuevo `lib/vault-seo.ts` resuelve la carpeta de la vault por `pipeline_item_id` y recupera el SEO cuando falta en `_PACKAGING`.
  - **Red de seguridad**: la auto-publicación ya **no programa público un vídeo sin descripción SEO** — avisa por Telegram (throttle 6h) y reintenta hasta que el SEO aparece. Antes subía con descripción vacía.
- **Caso real cubierto**: vídeo "90 Days of Stoic Discipline" — render OK pero la auto-subida se encoló con título=miniatura y sin SEO, y el upload se colgó al cerrar la app. Resuelto a mano (programado público hoy 17:30Z con el SEO correcto) y prevenido en código.

## v0.7.6 — 2026-06-06 ✅
- **Calendario sincronizado con el horario REAL de YouTube**: nuevo sync que lee el canal por RSS público (vídeos publicados, sin auth) + YouTube Data API (vídeos PROGRAMADOS privados, token de lectura del skill SEO). Los "huecos" dejan de ser falsos: un día con vídeo ya publicado/programado en YouTube (aunque se subiera fuera de la app) ya no cuenta como hueco. Botón "Sincronizar YouTube" + auto-sync al abrir el calendario; los vídeos del canal se pintan en la vista mes. `lib/youtube-schedule.ts`, `scripts/youtube_schedule.py`, `/api/youtube/schedule`. Solo Moderni Stoici hoy (único con token de lectura); resto preparado.
  - Nota: los PROGRAMADOS privados requieren reconectar YouTube (login del dueño) — el token de lectura caducó; mientras, los publicados se reflejan por RSS y la UI muestra "reconectar".
- **Estado del vídeo manual**: selector en el detalle del vídeo para forzar su estado (mueve la carpeta en disco vía `move-state`), además de la detección automática — para mitigar errores de clasificación.
- **Eliminada la pestaña "Sleep Stories"** (sidebar + acceso rápido + página + API) — estaba vacía y sin uso.

## v0.7.5 — 2026-06-06 ✅
- `fix(ui)`: DecisionModal vía `createPortal` — sin solape con el modal de detalle.
- `fix(audit)`: C2 auto-publish lee la descripción SEO de `_PACKAGING/` (fallback a raíz, multi-nombre) → los vídeos auto-publicados recuperan descripción + tags.
- `chore`: `vaultman` y `uncharted-history` quedan `enabled:false` (rootPath/scriptsRoot inexistentes); `_REPACKAGING` + carpeta mojibake añadidas a `ignoreFolders`.
- `wip`: refactor de resolución robusta de carpetas de vídeo por título (anti-fantasma) — nuevo `lib/video-folders.ts` + 7 rutas API + `progress.ts` + `approvals.ts` + `extract-metadata.ts`. Compila limpio, sin cambio de comportamiento en runtime.

## v0.7.4 — 2026-06-03 🏷️ (no publicada como release)
- 5 bug fixes + "programar desde idea" + toggle auto/manual del render. Quedó solo en commit; sus cambios viajan dentro de la v0.7.5.

## v0.7.3 — 2026-06-01 ✅
- Pasada visual/UX completa (~75 fixes).
- `fix(approvals)`: gates de título con opciones reales (parseo de tabla de MARCOS + fichero externo + botones "elegir").

## v0.7.2 — 2026-06-01 ✅
- Programación nativa por calendario + blindaje del pipeline autónomo.
- `fix(calendar)`: filtro de canal en el backlog + filtro por estado desplegable.

## v0.7.1 — 2026-06-01 ✅
- Fixes de auditoría: bloqueo de path traversal en handlers de vídeo, auth por token compartido en `/api/*`, `maxAttempts`, crash de `readJob`, validación de miniatura landscape 16:9.
- `security(telegram)`: fail-closed sin chat autorizado.

## v0.7.0 — 2026-06-01 ✅
- `fix(build)`: build NFT-safe sobre drives externos (`H:/`) + fix de hidratación cliente.
- `feat(updater)`: reconectar UpdateToast (beta) + pollers de Telegram/huecos.
- `feat(calendar)`: vista mes + plan editorial drag-drop + cadencia/huecos.
- `feat(telegram)`: aprobaciones interactivas + toggle "En el PC / Fuera".
- `fix(jobs)`: MCP mínimo (algrow) en jobs `claude -p` + extract metadata.
- `feat(upload)`: programación nativa de YouTube (`--publish-at`); OAuth YouTube resuelto (subida real confirmada).

## v0.6.0 — 2026-05-25 ✅ — baseline "oficial-escritorio" intocable
- Lab v1 (wizard de creación de canales).

## v0.5.0 — 2026-05-25 ✅
- Stabilization sprint.

## v0.4.0 — 2026-05-24 ✅
- MARIO, test-72h, Visual Lab, Bulk Enqueue, favicon.

## v0.3.1 — 2026-05-23 ✅
- Rename a "The Vaultman".

## v0.3.0 — 2026-05-23 ✅
- Jedi ranks, canal "The Bow Man", columna "programado", sprite avatars.

## v0.2.0 — 2026-05-23 ✅
- `fix(upload)`: `useSearchParams` envuelto en Suspense boundary.
