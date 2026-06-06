# CHANGELOG — yt-content-pipeline

Registro **único** de versiones de la app de escritorio. Fuente de verdad para no dispersarnos: cada vez que se publica una release nueva, se añade aquí su entrada.

- **Versión vigente (Latest):** `v0.7.5` — publicada 2026-06-06.
- **Versión "oficial-escritorio" histórica intocable:** `v0.6.0` (referida así en `CLAUDE.md` / `ACCESO-WEB.md`).
- **Distribución:** GitHub Releases (`Boxan178/yt-content-pipeline`, repo público) → installer NSIS + portable + `latest.yml`. Proceso en `RELEASE.md`.
- **Auto-update:** la app comprueba **solo al arrancar** y cada 4h. Para forzar la pastilla (UpdateToast): cerrar y reabrir la app instalada. El portable NO se autoactualiza. Kill-switch: arrancar con `YTCP_UPDATER_ENABLED=0`.

Convención de columnas: ✅ = release publicada en GitHub · 🏷️ = solo tag/commit (sin binarios publicados).

---

## v0.7.5 — 2026-06-06 ✅ (Latest)
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
