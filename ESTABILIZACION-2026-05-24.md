# ESTABILIZACIÓN — auditoría yt-content-pipeline v0.4.0

> Fecha: 2026-05-24
> Estado del repo: working tree limpio, último commit `af66753` (v0.4.0), main.
> Modo: análisis. **NO** se han aplicado fixes en esta sesión.
> Versión publicada: v0.4.0 (instalada via auto-update desde v0.3.1).

---

## TL;DR

La base está más sana de lo que el CLAUDE.md sugiere:

- **Typechecks**: app + electron, ambos exit 0 sin warnings.
- **Bug crítico anterior** (spawn `claude -p` colgado) **resuelto**. `lib/claude-jobs.ts` usa `node.exe + cli.js` directo, `detached: false`, `windowsHide: true`, prompt por argv, `stdio: ['ignore', fd, fd]`. Funciona en producción.
- **Auto-update validado** end-to-end (v0.2.0 → v0.3.1 → v0.4.0).

Lo que sí hay que limpiar:

1. **Tres archivos durmientes son ya código muerto** (`RenderPanel.tsx` se importa pero no se renderiza; `/api/claude/run` no lo llama nadie; `lib/render.ts` solo es usado por las rutas durmientes). Borrar reduce ~600 líneas y elimina un endpoint con `shell: true` que rompería si alguien lo llamara.
2. **Tres race conditions latentes** sin lock en los tickers lazy (`tickScheduler`, `tickQueue`, `readJob`). En la práctica el polling cada 60s las hace improbables, pero existen.
3. **Hardcoding masivo** de `Y:/04_DEV/J.A.R.V.I.S` (12 sitios). Si Pablo mueve la bóveda, todo rompe.
4. **kie-bridge** Python no se distribuye con el .exe — Visual Lab y NORA fallan silenciosos sin Y: montado.

Severidad agregada: la app es estable. Las mejoras son higiénicas y a futuro, no urgentes.

---

## 1. Estado de la base

| Check | Resultado | Notas |
|---|---|---|
| `npx tsc --noEmit` (app) | ✅ exit 0, 0 warnings | Limpio |
| `npx tsc -p electron/tsconfig.json --noEmit` | ✅ exit 0, 0 warnings | Limpio |
| TODOs/FIXMEs/HACK en código | ✅ 0 reales | Las 3 ocurrencias del grep son palabras (`TODOS los seleccionados`, `TODAS las filas…`), no markers |
| `npm run build` | ⚠️ Pasa pero con `UnhandledSchemeError` warnings | Errores `ENOENT` al copiar tracing files de skills `Y:/04_DEV/J.A.R.V.I.S/.claude/skills/ciceron/_dormido-v3` y `context-migrator` durante `writeStandaloneDirectory`. Build acaba correcto pero el log se ensucia. |

> El warning de tracing se produce porque Next intenta seguir referencias dentro de strings que apuntan a paths Y:/. El `next.config.mjs` ya tiene `outputFileTracingExcludes` pero no cubre todos los casos. Bajo prioridad porque no rompe nada.

---

## 2. Código durmiente / zombi (ELIMINABLE)

CLAUDE.md decía: "No borrar archivos durmientes sin antes confirmar que el flujo nuevo funciona en producción". v0.4.0 lleva semanas funcionando. Confirmado.

### 2.1 Flujo de render antiguo — DEAD CODE

| Archivo | Líneas | Estado | Evidencia |
|---|---|---|---|
| `components/RenderPanel.tsx` | 215 | **import zombi** | Solo aparece en línea 8 de `VideoDetailModal.tsx` como `import`. No se renderiza en ningún JSX. |
| `lib/render.ts` | 146 | **solo lo usan las rutas durmientes** | Importado únicamente por `app/api/channels/[c]/videos/[v]/render/{route,status,cancel}/route.ts`. |
| `app/api/channels/[c]/videos/[v]/render/route.ts` | ? | **ruta huérfana** | Reemplazada por `lib/claude-jobs.ts` + skill LUIS. |
| `app/api/channels/[c]/videos/[v]/render/status/route.ts` | ? | **ruta huérfana** | Idem. |
| `app/api/channels/[c]/videos/[v]/render/cancel/route.ts` | ? | **ruta huérfana** | Idem. |

**Acción propuesta** (futura): eliminar los 5 archivos + quitar el `import { RenderPanel }` de `VideoDetailModal.tsx`. Cero impacto funcional. ~600 LOC fuera. Cleanup en una commit.

### 2.2 `/api/claude/run` — ENDPOINT HUÉRFANO + ANTI-PATRÓN

`app/api/claude/run/route.ts` (151 líneas) usa el patrón viejo prohibido por CLAUDE.md:

```ts
const child = spawn('claude', ['-p'], {
  cwd, shell: true, windowsHide: true, ...  // ← shell:true rompe stdin en Windows
});
child.stdin.write(body.prompt, 'utf-8');     // ← prompt por stdin
child.stdin.end();
```

CLAUDE.md explícitamente lo desaconseja:
- "No re-introducir `shell: true` en `lib/claude-jobs.ts`: rompe stdin propagation. Ya descartado."
- "No usar `claude.cmd` directo con shell:false: Node 18+ devuelve EINVAL."

Esto significa que **si alguien hiciera POST /api/claude/run**, se colgaría exactamente como el bug original. Búsqueda exhaustiva en componentes: nadie lo llama. Es endpoint zombi.

**Acción propuesta** (futura): eliminar el archivo. Las skills se invocan ya vía `lib/claude-jobs.ts startJob()` desde los handlers de `claude/jobs/*`.

### 2.3 Duplicación leve: `isPidAlive` y `killPid`

Mismas funciones implementadas en:
- `lib/render.ts:72-79` (`isPidAlive`)
- `lib/render.ts:131-145` (`killPid`)
- `lib/claude-jobs.ts:86-93` (`isPidAlive`)
- `lib/claude-jobs.ts:95-108` (`killPid`)

Cuando se borre `lib/render.ts` queda solo la copia de `claude-jobs.ts`. Sin acción extra.

---

## 3. Bugs y smells por severidad

### 3.1 CRÍTICOS (rompen funcionalidad si se gatillan)

Ninguno detectado. La app está estable.

### 3.2 MEDIOS (rompen bajo concurrencia o cambio de entorno)

#### M-1. Race conditions sin lock en tickers lazy

`tickScheduler()` (`lib/upload-schedule.ts:185-256`), `tickQueue()` (`lib/job-queue.ts:147-220`) y `readJob()` (`lib/claude-jobs.ts:233-263`) ejecutan **read JSON → mutate → writeFileSync** sin lock.

Si dos requests concurrentes (polling cliente, dos llamadas API simultáneas) llegan al mismo tiempo:
- Pueden ver el mismo item `pending` y lanzar **dos jobs claude duplicados**.
- O ver el mismo job 'running' con PID muerto y escribir 'done' dos veces (idempotente).

En la práctica el polling cliente cada 60s + lazy ticks hacen muy improbable el clash. Pero el riesgo existe y crecerá si Pablo añade SSE/realtime.

**Mitigación propuesta** (futura, no urgente):
- Single-flight pattern: variable módulo `let inProgress = false` antes de mutar.
- O un lockfile sync breve en disco (`fs.openSync(lockPath, 'wx')` antes de write, unlink después).
- O mover toda la lógica de schedule/queue a un único worker process en `electron/main.ts` y servir vía IPC.

#### M-2. `kie-bridge` no se distribuye con el .exe

`Y:/04_DEV/J.A.R.V.I.S/lab/kie-bridge/kie.py` se invoca desde:
- `app/api/visual/generate/route.ts` (Visual Lab)
- Skill NORA+IRIS (vía prompt → claude → kie.py)

Si el .exe corre en una máquina sin Y: montado o sin Python/venv del kie-bridge, **falla silenciosa**. La UI muestra error genérico pero sin pista de qué pasa.

**Mitigación propuesta** (futura):
- Verificación al arrancar Electron: si `Y:/04_DEV/J.A.R.V.I.S/lab/kie-bridge/kie.py` no existe, mostrar toast persistente "Visual Lab no disponible: kie-bridge no encontrado".
- O empaquetar kie-bridge dentro del .exe (más esfuerzo, requiere Python embedded).

#### M-3. Hardcoding de `Y:/04_DEV/J.A.R.V.I.S` en 12 sitios

Inventario completo:

| Archivo | Línea | Uso |
|---|---|---|
| `lib/checklist-resolver.ts` | 23 | `JARVIS_ROOT` const |
| `lib/channels.ts` | 58, 76, 97 | `scriptsRoot` por canal |
| `lib/progress.ts` | 47-48 | Paths a `tts-jobs-{es,en}.json` |
| `lib/render.ts` | 5 | `RENDER_SCRIPT` (zombi, se borrará) |
| `lib/prompts.ts` | 11, 90, 211, 212, 274, 312, 343 | `JARVIS_ROOT` + prompts hardcoded con paths |
| `components/ClaudeRunButton.tsx` | 322 | `cwd` default para `claude -p` |
| `app/api/decisions/route.ts` | 18 | Whitelist de paths permitidos |
| `app/api/claude/run/route.ts` | 9, 15-16 | `DEFAULT_CWD` (zombi) |
| `app/api/claude/jobs/*` | varios | Whitelists de CWD |
| `next.config.mjs` | 9 | Comentario |

Si Pablo mueve la bóveda o cambia el drive letter, todo rompe simultáneamente.

**Mitigación propuesta** (futura):
- Crear `lib/config.ts` con `JARVIS_ROOT`, `H_YOUTUBE_ROOT`, `KIE_BRIDGE_PATH`, `PYTHON_EXE` exportados como const.
- Leer overrides de `~/.yt-content-pipeline/config.json` si existe.
- Reemplazar las 12 ocurrencias por imports.

Esfuerzo: M (medio día). Beneficio: portabilidad y un sitio único que tocar.

#### M-4. Performance del endpoint caliente `/api/channels/[c]/videos`

`GET /api/channels/[channel]/videos` se llama cada 60s (polling cliente). Por cada vídeo en el canal hace:

1. `stat()` del folder
2. `readdir()` de las entradas
3. `safeReaddir()` de `RENDER/`, `_PACKAGING/MINIATURAS/`, `01_BRUTOS/_LOCUCION/`, `01_BRUTOS/_VÍDEO/`
4. `stat()` de cada archivo en RENDER + MINIATURAS
5. `computeProgress()` → 4-6 stats adicionales + posiblemente `readFile()` de `tts-jobs-{es,en}.json` desde Y:/
6. `listActiveJobsForFolder()` → lee `.claude-jobs/*.json` (parsea cada uno)
7. `readFile()` de `compilation.json` si existe

Para 50 vídeos × 3 canales activos: ~50 × (4 stats + 4 readdirs + N × stats archivo) cada 60s. H:/ es SSD local así que no afecta. Pero `progress.ts:47-48` lee el JSON de tts-jobs desde Y:/ (NAS) cada vez que hay vídeos con prefijo `story-`. **Este es el cuello potencial real**.

**Mitigación propuesta** (futura, baja prioridad):
- Cachear el JSON tts-jobs en memoria con TTL 30s.
- O mover la metadata "has script" a un archivo local por vídeo.

### 3.3 BAJOS (cosméticos / dead code)

#### B-1. `require('./claude-jobs')` dinámico redundante

`lib/upload-schedule.ts:122-124` y `lib/job-queue.ts:236` hacen:

```ts
const { cancelJob } = require('./claude-jobs') as typeof import('./claude-jobs');
```

Cuando arriba ya importan estáticamente `{ startJob, readJob, jobsDirFor }` del mismo módulo. El require dinámico era un workaround para un ciclo que ya no existe. Limpieza fácil.

#### B-2. `setInterval` del auto-updater nunca se limpia

`electron/main.ts:172-174`:

```ts
setInterval(() => {
  autoUpdater.checkForUpdates().catch(() => {});
}, 4 * 60 * 60 * 1000);
```

Sin `clearInterval` al `before-quit`. Leak teórico pequeño. Irrelevante en uso real (la app vive horas, no días).

#### B-3. UI "MODO DESARROLLO" sin tema visible cuando se cambia dev/prod

`electron/main.ts:217` pasa `--ytcp-dev=1` por argv al renderer. El banner amarillo se pinta condicional. Funciona. No es bug.

#### B-4. Gamification stats sin lock

`~/.yt-content-pipeline/stats.json` se lee/escribe en cliente con dedup en localStorage. Si dos transiciones llegan a la vez (improbable, mismo tab), última escritura gana. Una posible XP se pierde. No es bug crítico.

---

## 4. Lo que el sub-agente de fusión ya entregó (Sección 5 del contexto de migración)

Resumen para tener todo en un sitio. Detalle completo en el contexto migrado del chat anterior.

### Luna Media OS (`Y:/04_DEV/J.A.R.V.I.S/lab/youtube-dashboard/`)

Web Next.js 14 + Supabase Auth, en producción Vercel desde abril 2026. 7 canales YouTube faceless.

**Para portar a ytcp:**
- `lib/supabase/{client,server}.ts` (S, si vamos a Supabase)
- `lib/types.ts` schema (S)
- `components/PipelineBoard.tsx` (M)
- `components/FormatTracker.tsx` (M)
- `components/CalendarView.tsx` (M) — **alto valor**, ytcp no tiene calendario editorial
- `components/ChannelsManager.tsx` (M, si multi-canal con BD)

**Schema relevante**: `channels`, `formats`, `videos`, `pipeline_items`, `pipeline_item_titles`, `pipeline_item_thumbnail_prompts`.

### Mission Control Dashboard (`Y:/04_DEV/J.A.R.V.I.S/lab/mission-control-web/`)

Web Next.js 16 + worker Python. Orquesta CEO + 16 agentes. Producción Vercel desde mayo 2026.

**Para portar a ytcp:**
- Sistema 12 temas: `lib/theme.ts` + bloques de `globals.css` (M, **alto ROI visual**)
- Command Palette ⌘K: `components/ui/CommandPalette.tsx` + `CommandPaletteHost.tsx` + `hooks/useKeyboard.ts` (M)
- Hooks utilitarios: `useDebounce`, `useClickOutside`, `useCopyToClipboard`, `cn()`, `relativeTime()` (S, copy directo)

**Bloqueantes técnicos**: MC usa Next 16 + React 19 + Tailwind 4. ytcp en 14 + 18 + 3. Server actions y `@theme` no compilan tal cual.

**Para IGNORAR**: worker Python (arquitectura incompatible), Council mode (no implementado en MC), HomeDashboard/TeamGrid (modelo de agentes BD no encaja con nuestras skills).

### Recomendación de fusión

**Mínima fricción**: traer el theme system + command palette de MC (2-3h) + CalendarView de Luna (medio día) sin meter Supabase todavía (mockear datos desde `scheduled-uploads.json`).

**Fusión completa con BD**: requiere decidir si ytcp adopta Supabase para canales/formatos/calendario manteniendo H:/ como fuente de verdad de assets. Decisión grande no reversible barata.

---

## 5. OAuth / login — análisis pros y contras

ytcp es single-user local. Pablo plantea OAuth como roadmap futuro. Opciones:

### Opción A — Sin auth (estado actual)
- **Pros**: cero fricción, cero código, cero superficie de ataque externa. Coincide con uso real (Pablo, su PC).
- **Contras**: si la app se expone fuera del PC (escenario lab/demo), no hay barrera. No hay forma de saber "quién hizo qué" en logs.
- **Recomendación**: mantener mientras la app no salga del PC. Es lo correcto para single-user.

### Opción B — Supabase Auth
- **Pros**: Luna Media OS ya lo usa (cero aprendizaje extra). Schema multi-user listo. Magic link / OAuth Google integrados. Free tier suficiente.
- **Contras**: cambia el modelo de datos (todo gana `user_id`). Hay que migrar `gamification`, `stats`, `seen-states` a Supabase o convivir filesystem + BD por usuario. La app Electron pasa de pura local a depender de internet para autenticar.
- **Recomendación**: solo si Pablo se plantea abrirla a colaboradores o tener web companion. Para mantener Electron local con cuenta de Google, basta esta opción.

### Opción C — Clerk
- **Pros**: instalación más rápida que NextAuth (1h aprox). UI prefabricada. OAuth + magic link de fábrica. Mejor DX que Supabase Auth.
- **Contras**: dependencia adicional ($25/mes si supera free tier). Otra BD de usuarios que sincronizar con Supabase si Luna también está dentro.
- **Recomendación**: solo si **no** vamos a usar Supabase para nada. Si Luna ya está allí, duplica.

### Opción D — NextAuth.js
- **Pros**: open source, sin coste. Soporta Supabase como adaptador → un único almacén de usuarios. Más control.
- **Contras**: setup más laborioso (medio día). Documentación dispersa. Versión 5 (auth.js) cambió API recientemente.
- **Recomendación**: viable si Pablo quiere OAuth sin atarse a Clerk y ya hay Supabase. Pero **Supabase Auth nativo es lo mismo con menos código**.

### Recomendación final OAuth

**Cortoplazo (hasta finales 2026)**: mantener Opción A. La app es local y single-user. Añadir auth ahora es coste sin beneficio claro.

**Si decides fusionar con Luna/MC**: ir directo a **Supabase Auth** (Opción B). Un solo proveedor para auth + BD + RLS. Cero código duplicado.

**Tarea concreta a futuro**: añadir guard en `electron/main.ts` que requiera un secreto local en `~/.yt-content-pipeline/auth.json` cuando se exponga vía `npm start` HTTP (no aplica para el .exe que carga vía 127.0.0.1).

---

## 6. Próximos pasos recomendados (priorizados)

Esta lista no es para ejecutar todo de golpe. Es orden de ataque cuando haya tiempo:

### Sprint estabilización (1 sesión, ~3-4h)

1. **Borrar código zombi** (1h)
   - Eliminar `components/RenderPanel.tsx`, `lib/render.ts`, las 3 rutas `app/api/channels/[c]/videos/[v]/render/*`, y `app/api/claude/run/route.ts`.
   - Quitar el `import { RenderPanel }` huérfano de `VideoDetailModal.tsx`.
   - Commit: "chore: remove dormant render flow + /api/claude/run endpoint"
   - Verificar typecheck + build limpios.

2. **Centralizar paths absolutos en `lib/config.ts`** (1.5h)
   - Crear `lib/config.ts` con `JARVIS_ROOT`, `H_YOUTUBE_ROOT`, `KIE_BRIDGE_PATH`, `PYTHON_EXE`.
   - Reemplazar las 12 ocurrencias hardcodeadas.
   - Soportar override desde `~/.yt-content-pipeline/config.json` si existe.
   - Beneficio: portabilidad, un sitio único.

3. **Verificación de kie-bridge al arrancar** (30min)
   - En `electron/main.ts whenReady()`, comprobar si `KIE_BRIDGE_PATH` existe.
   - Si no, mandar evento `mainWindow.webContents.send('warn:kie-missing', ...)` al renderer.
   - Renderer muestra toast persistente "Visual Lab no disponible".

4. **Limpiar `require()` dinámicos redundantes** (15min)
   - Quitar de `lib/upload-schedule.ts:122` y `lib/job-queue.ts:236`.
   - Usar los imports estáticos del top del archivo.

### Sprint anti-race (si surge necesidad, ~2h)

5. **Single-flight en tickers lazy** (2h)
   - `tickScheduler`, `tickQueue`, `readJob`: añadir flag `inProgress` module-level + cola de espera.
   - O lockfile breve (`fs.openSync(lockPath, 'wx')`).
   - Bajo riesgo de regresión.

### Sprint fusión (decisión pendiente)

6. **Decidir alcance**: solo MC quick wins (theme + ⌘K) vs incluir CalendarView de Luna vs adoptar Supabase para canales/formatos.
7. **Implementar según decisión**.

### Higiene continua

- Releer el log de `npm run build` y limitar el `outputFileTracingExcludes` en `next.config.mjs` para silenciar los `ENOENT` de skills durmientes en Y:/.
- Revisar cada 3 meses si CLAUDE.md sigue al día con el estado real del código.

---

## 7. Apéndice: inventario lib/

| Archivo | LOC | Estado |
|---|---|---|
| `lib/channels.ts` | 119 | ✅ activo, config canales |
| `lib/checklist-resolver.ts` | ? | ✅ activo |
| `lib/claude-jobs.ts` | 349 | ✅ activo, **core de jobs** |
| `lib/decision-types.ts` | ? | ✅ activo |
| `lib/electron-api.ts` | ? | ✅ activo |
| `lib/gamification-client.ts` | ? | ✅ activo, cliente XP |
| `lib/gamification-types.ts` | ? | ✅ activo, 8 rangos Jedi |
| `lib/gamification.ts` | ? | ✅ activo, server XP |
| `lib/job-queue.ts` | 258 | ✅ activo, ⚠️ race condition latente |
| `lib/notifications.ts` | ? | ✅ activo |
| `lib/parse-checkboxes.ts` | ? | ✅ activo |
| `lib/progress-types.ts` | ? | ✅ activo (browser-safe) |
| `lib/progress.ts` | 123 | ✅ activo, ⚠️ lee Y:/ por vídeo `story-*` |
| `lib/prompts.ts` | 343+ | ✅ activo, **builders de skills** |
| `lib/render.ts` | 146 | ❌ **DURMIENTE — eliminar** |
| `lib/seen-states.ts` | 89 | ✅ activo, gamificación dedup |
| `lib/settings.ts` | ? | ✅ activo |
| `lib/stream-events.ts` | ? | ✅ activo, parser NDJSON claude |
| `lib/types.ts` | 39 | ✅ activo |
| `lib/upload-schedule.ts` | 256 | ✅ activo, ⚠️ race condition latente |

---

_Generado durante la sesión de auditoría de 2026-05-24. Working tree limpio cuando se redactó. Ningún fix aplicado: documento es solo análisis._
