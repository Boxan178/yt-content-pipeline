# ESTADO 2026-05-31 (noche) — Retomar mañana

> Sesión muy larga de estabilización nocturna. Producción **PARADA** a propósito.
> Objetivo de mañana: **acabar la app en condiciones** (no producir todavía).

---

## TL;DR

- ✅ **El build de producción YA FUNCIONA** (`npm run build` exit 0, 0 EISDIR). El `.exe` v0.7.0 se puede empaquetar.
- ✅ **9 Guards subido** a YouTube oculto (`xDgBKIufK1o`).
- ✅ 3 bugs arreglados: NFT/build, hidratación cliente, extracción de metadata.
- 🔴 **El fix de MCP de los jobs (claude-jobs.ts) ROMPIÓ el spawn** — los `claude -p` mueren al instante sin producir nada. HAY QUE ARREGLARLO o revertirlo (ver abajo).
- ⏸️ Producción parada: server + ticker + jobs todos matados. La cola tiene 7 MS pendientes (resumible).
- 📦 Todo SIN COMMITEAR en `main` (34 archivos). Conviene rama + commits mañana.

---

## ✅ Hecho esta noche (y funciona)

1. **Build NFT arreglado** — combinación de:
   - `lib/config.ts`: `externalDrive()` con fallback VACÍO (Pablo) + rama `typeof window` (fix hidratación). En BUILD el drive es `''` → NFT no traza H:/Y:. En RUNTIME viene de env `YTCP_DRIVE_H/Y`.
   - `scripts/build-isolated.js` (Pablo): aparta `.claude/skills` + `worktrees` durante el build + preload `nft-skip-external-drives.js`.
   - `lib/channels.ts`: rootPaths vía `H_YOUTUBE` (no literales).
   - `tsconfig.json`: excluye `.claude`.
   - `package.json`: `build` → `build-isolated.js npm run build:raw`; `dev:next` setea `YTCP_DRIVE_H=H YTCP_DRIVE_Y=Y`.
2. **Fix hidratación** (`lib/config.ts`): el fallback vacío rompía el cliente (`/YOUTUBE` vs `H:/YOUTUBE`). La rama `typeof window` devuelve la letra literal en el bundle de cliente.
3. **Fix extracción metadata** (`lib/extract-metadata.ts` + `lib/auto-publish.ts`): título `✅ ELEGIDO` (no solo 🏆) + leer `seo-package.md` (descripción+tags) + normalizar CRLF. Validado: 9 Guards subió con título+descripción+25 tags.
4. **9 Guards subido** (`xDgBKIufK1o`, oculto). Pablo debe borrar el test viejo `G3Z8DzP2Fzo`.
5. **Infra de producción validada**: server standalone compilado = ESTABLE (sin la flakiness del dev server, que era sopa de procesos por mis restarts). Cola + auto-publish + supervivencia detached funcionan.

---

## 🔴 ROTO — arreglar primero mañana

**El fix de MCP de `lib/claude-jobs.ts` rompió el spawn de los jobs.**

- **Problema original** (bien diagnosticado): los `claude -p` arrancan con ~20 MCP servers → los HTTP (algrow) se quedan `pending` → `generate_tts` (locución) falla → los vídeos se atascan en el guion. **Algrow está sano** (`health_check` OK en mi sesión).
- **Fix intentado**: `buildJobsMcpConfig()` lee algrow de `~/.claude.json`, escribe `~/.yt-content-pipeline/jobs-mcp.json`, y el spawn pasa `--strict-mcp-config --mcp-config <path>`.
- **Verificado aislado**: `'prompt' | claude -p --strict-mcp-config --mcp-config <cfg> --model sonnet` → algrow conecta en 14s, `health_check` responde. ✓
- **PERO en la app**: los jobs mueren al instante (log de 9.7KB = solo el header, cero output de claude, ni evento `init`).
- **Hipótesis de la diferencia**: la app usa `claude -p --output-format stream-json --verbose --model X --strict-mcp-config --mcp-config <path> <PROMPT-COMO-ARG>` con cwd en el NAS (Y:). El test aislado usó prompt por STDIN, sin stream-json, cwd local. Algo de esa combinación hace que claude salga sin producir nada.

**Opciones mañana:**
- (a) Reproducir la invocación EXACTA de la app a mano (con `--output-format stream-json` + prompt-as-arg) y ver el error real de claude → ajustar.
- (b) Si urge un baseline que funcione: revertir el push de `--strict-mcp-config` en `claude-jobs.ts` (vuelven a llegar a packaging+guion, aunque la locución seguirá fallando por el MCP pending). Requiere **rebuild** (el spawn va compilado en el standalone).
- (c) Probar pasar el prompt por STDIN en `claude-jobs.ts` en vez de como arg (como el test que SÍ funcionó).

---

## 📋 Pendiente (acabar la app en condiciones)

1. **Arreglar el spawn con MCP** (lo de arriba) → que la locución funcione sola.
2. **Empaquetar el `.exe` v0.7.0** (`npm run dist` ahora termina) + auto-update silencioso.
3. **Commit/curar** los 34 archivos (rama + commits limpios). Mezclan: mis fixes de esta noche + WIP previo (calendar, telegram, approvals, decisions, working-mode) + ediciones de Pablo.
4. supabase/vidiq en los jobs spawneados (tracking Luna Media OS + SEO) son connectors OAuth → no conectan headless. Decidir si hacen falta y cómo.
5. Sleep stories: la "Meditations" que Pablo quería está `done`; las otras 9 ideas las saqué de la cola (sus `idea.md` persisten en disco para re-encolar).

---

## 🔧 Cómo retomar la PRODUCCIÓN (cuando toque)

1. Tras cualquier cambio de código: `npm run build` (build-isolated, ~5 min, funciona).
2. Arrancar el server compilado **detached** (sobrevive la sesión):
   `$env:YTCP_DRIVE_H='H'; $env:YTCP_DRIVE_Y='Y'; $env:PORT='3001'; node .next/standalone/server.js`
   (o el `.exe` empaquetado, que ya trae server + pollers).
3. Driver de la cola: los pollers están en electron/main.ts (solo en el `.exe`). Para el server standalone suelto hace falta un **ticker** que pegue cada ~45s a `/api/queue` y `POST /api/auto-publish/tick`.
4. La cola (`~/.yt-content-pipeline/queue.json`) tiene **7 MS pendientes**.
5. **NUNCA** correr `npm run build` con `YTCP_DRIVE_H` seteado en el env (NFT trazaría H:/Y: → EISDIR). El build necesita el fallback vacío.

## ⚠️ Lecciones (no repetir)

- **Flakiness del dev server = sopa de procesos** por restarts. Mantener UN solo `next dev`. El server compilado no flakea.
- El dev `--turbo` y el webpack dev tienen el bug de `app-paths-manifest.json` ENOENT bajo carga. El standalone compilado no.
- Reescribir `queue.json` desde PowerShell: **leer con `[IO.File]::ReadAllText(p,[Text.Encoding]::UTF8)`** (Get-Content sin -Encoding UTF8 mancilla la Ó y los em-dash → paths rotos).
