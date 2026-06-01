# CALENDARIO DE CONTENIDOS — `/calendar`

> Vista editorial de pájaro de todo el contenido: lo programado, lo planificado
> y los huecos contra la cadencia objetivo de cada canal.
>
> **Estado:** Fases 1, 2 y 3 implementadas. Typecheck (app + electron) en verde.
> Verificado funcionalmente salvo el *happy-path* del arranque de pipeline
> (bloqueado por un bug preexistente ajeno a este módulo — ver §6). **Sin
> commitear** a fecha 2026-06-01; pensado para entrar en el commit conjunto con
> el resto del WIP de `main`.

---

## 1. Qué es y para qué

`/calendar` es la cuarta gran vista de la app (junto a Canales, Cola y Subidas).
Responde a "¿qué sale y cuándo, en todos los canales a la vez?" y deja **operar**
desde ahí: planificar, programar y arrancar producción.

Tres capas, de menos a más acción:

1. **Ver** (Fase 1) — calendario mensual con todo lo que tiene fecha de
   publicación.
2. **Planificar** (Fase 2) — colocar ideas/vídeos en fechas (drag-drop) antes de
   producirlos; programar un vídeo listo reusando el flujo de subida.
3. **Operar contra un objetivo** (Fase 3) — cadencia por canal, detección de
   huecos, arranque de pipeline desde un hueco y avisos proactivos.

---

## 2. Las tres fases

### Fase 1 — MVP (vista mes, lectura)
- Página `/calendar` con rejilla mensual (semana empieza en lunes).
- Cada subida de `scheduled-uploads.json` se pinta en su **fecha de publicación
  efectiva** = `publishAt ?? scheduledFor`, coloreada por canal.
- Navegación de mes (←/Hoy/→), filtro/leyenda por canal, panel de detalle al
  hacer clic, refresco cada 30 s.
- Entrada "Calendario" en el sidebar (2ª posición, tras Canales).

### Fase 2 — Plan editorial (drag-drop)
- Store nuevo `content-calendar.json` con items **planificados** (huecos/ideas en
  una fecha, antes de existir el vídeo). Se pintan con **borde discontinuo** vs.
  las subidas reales (sólidas).
- Botón **`+`** al pasar el ratón sobre un día → modal (canal + título + fecha).
- **Backlog lateral arrastrable**: ideas del banco (`lib/lab/ideas.ts`) + vídeos
  en `_LISTOS PARA SUBIR` con render y sin subida ya encolada.
- Drag-drop HTML5 nativo:
  - **idea → día**: crea un planificado (queda en el plan, sin producir).
  - **vídeo listo → día**: redirige a `/upload?...&date=ISO` → reusa el flujo
    publish-at existente (Pablo revisa y confirma; **no sube a ciegas**).
  - **planificado → otro día**: `PATCH` de su fecha.

### Fase 3 — Integración con el pipeline
- **Cadencia objetivo por canal** — store `channel-cadence.json`: N vídeos/semana
  + días preferidos (L-D) + activa/inactiva + hora sugerida. Editor en el panel
  "Cadencia y huecos".
- **Detección de huecos** — `lib/calendar-gaps.ts` cruza cadencia × ocupación
  (subidas + planificados) semana a semana → déficit (`missing`) y **días-hueco
  concretos** (capados a `missing`, excluyendo días ya pasados). Panel "Próximos
  huecos" con botón "+día" que abre el modal de planificar en esa fecha exacta.
- **Arrancar pipeline desde un planificado** — botón "▶ Arrancar pipeline" en el
  detalle. Reusa `startPipelineForIdea` (`lib/idea-pipeline.ts`), el **mismo
  motor** que el botón del kanban de ideas. Por defecto en modo cola (`queue`).
- **Avisos de huecos** — `notifyContentGaps` (Telegram + push) con dedupe diario;
  5º poller en Electron cada 6 h.

---

## 3. Arquitectura

### Archivos nuevos (13)
| Archivo | Rol |
|---|---|
| `lib/calendar-types.ts` | Tipos **browser-safe** (sin `node:*`): `CalendarItem`, `PlannedItem`, `ChannelCadence`, `CalendarGapWeek/Day`, `CalendarDragPayload`, `CALENDAR_STATUS_STYLE`. |
| `lib/content-calendar.ts` | Store **server-only** del plan editorial → `~/.yt-content-pipeline/content-calendar.json`. CRUD `readContentCalendar`/`addPlanned`/`updatePlanned`/`deletePlanned`/`getPlanned`. |
| `lib/channel-cadence.ts` | Store **server-only** de cadencia → `~/.yt-content-pipeline/channel-cadence.json`. `getCadence`/`upsertCadence` (con `sanitize`)/`deleteCadence`. |
| `lib/calendar-gaps.ts` | **Server-only**. `computeGaps(weeks)` / `computeGapsWithDeficit(weeks)`. |
| `components/calendar/MonthGrid.tsx` | Rejilla del mes (client) + drag-drop. Adaptado de la `CalendarView` de Luna Media OS al design system glass. |
| `app/calendar/page.tsx` | Página completa (client): mes, filtros, backlog, panel cadencia/huecos, modales. |
| `app/api/calendar/route.ts` | `GET` (fusiona uploads + planificados) · `POST` (crea planificado). |
| `app/api/calendar/[id]/route.ts` | `PATCH` / `DELETE` de un planificado. |
| `app/api/calendar/backlog/route.ts` | `GET` ideas + vídeos listos arrastrables. |
| `app/api/calendar/cadence/route.ts` | `GET` / `PUT` cadencia por canal. |
| `app/api/calendar/gaps/route.ts` | `GET ?weeks=N` déficit por canal/semana. |
| `app/api/calendar/gaps/notify/route.ts` | `POST` aviso de huecos (dedupe persistente). |
| `app/api/calendar/[id]/start-pipeline/route.ts` | `POST` arranca producción desde un planificado. |

### Ficheros compartidos tocados (aporte del calendario)
> Estos archivos están modificados también por otro WIP de `main` (telegram,
> approvals, build/NFT…). El aporte **de este módulo** es:

| Archivo | Aporte calendario |
|---|---|
| `lib/channels.ts` | `CHANNEL_COLORS` + `channelColor(slug)` (color de marca por canal; no existía). |
| `components/Sidebar.tsx` | Icono `calendar` + entrada `/calendar` (2ª posición). |
| `app/upload/page.tsx` | Soporte de query `?date=ISO` → arranca en modo "Programar" con esa fecha. |
| `electron/main.ts` | 5º poller `startGapNotifyPoller` (cada 6 h) + su stop en los dos cierres. |
| `lib/notify.ts` | `notifyContentGaps()` (aviso de huecos por Telegram + push). |

### Stores JSON nuevos (en `~/.yt-content-pipeline/`)
- `content-calendar.json` — plan editorial (Fase 2).
- `channel-cadence.json` — cadencia objetivo (Fase 3).
- `gap-notify-state.json` — dedupe de avisos (firma + timestamp).

### Endpoints
```
GET    /api/calendar                      lista fusionada (upload + planned) + canales
POST   /api/calendar                      crea item planificado
PATCH  /api/calendar/[id]                 mueve/edita planificado
DELETE /api/calendar/[id]                 borra planificado
GET    /api/calendar/backlog              ideas del banco + vídeos listos
GET    /api/calendar/cadence              cadencia por canal (+ autoPipeline)
PUT    /api/calendar/cadence              upsert cadencia de un canal
GET    /api/calendar/gaps?weeks=N         déficit por canal/semana (default 4, máx 12)
POST   /api/calendar/gaps/notify          avisa si hay déficit (dedupe ~1/día)
POST   /api/calendar/[id]/start-pipeline  arranca SARA desde un planificado
```

### Kill-switches (env)
- `YTCP_GAP_NOTIFY_ENABLED=0` — silencia el aviso de huecos (el endpoint no manda nada).
- `YTCP_GAP_NOTIFY_POLLER_ENABLED=0` — no arranca el 5º poller en Electron.

---

## 4. Patrones del proyecto respetados

- **Browser-safe vs server-only**: tipos en `calendar-types.ts` (sin `node:*`),
  lógica de disco en `content-calendar.ts` / `channel-cadence.ts` /
  `calendar-gaps.ts` (con `import 'server-only'`). Mismo split que
  `progress-types.ts` ↔ `progress.ts`.
- **El color de canal NO es un campo del tipo `Channel`**: es un mapa aparte
  (`CHANNEL_COLORS`) + helper, para no tocar la interfaz `Channel`.
- **`GET /api/calendar` NO llama a `tickScheduler()`** a propósito: abrir el
  calendario no debe disparar subidas. El estado lo refrescan `/api/uploads` y el
  poller de auto-publish, como siempre.
- **Reuso, no duplicación**: el arranque reusa `startPipelineForIdea`; programar
  un vídeo reusa `/upload` (publish-at). No se reimplementa el spawn ni la subida.
- **Guard atómico anti-doble-arranque**: `start-pipeline` marca el planificado
  `scheduled` ANTES de scaffolear (sección síncrona en un único proceso Next) y
  **revierte a `planned` si el arranque falla**. Sólo canales con `autoPipeline`.
- **Pollers idempotentes con kill-switch**: el 5º poller sigue el patrón exacto
  de los otros cuatro (notion / auto-publish / queue / telegram).

---

## 5. Estado de verificación

| Área | Estado |
|---|---|
| `tsc` app + `tsc` electron | ✅ exit 0 |
| `GET /api/calendar` (fusión upload+planned) | ✅ con fixtures |
| `GET /api/calendar/backlog` (38 ideas reales, 0 vídeos listos) | ✅ |
| `GET /api/calendar/cadence` + `GET /gaps` (cálculo) | ✅ déficit correcto; `gapDays` excluye pasado y se capa a `missing` |
| Guards de `start-pipeline`: **404** / **403** / **409** | ✅ sin tocar cola/disco |
| UI `/calendar` (render, sidebar, panel cadencia+huecos, badge déficit) | ✅ |
| Restauración de fixtures (queue de Pablo intacta) | ✅ |

**⛔ NO verificado e2e — el *happy-path* del arranque real (spawnear SARA):**
bloqueado por un bug **preexistente y ajeno a este módulo** — el fix de MCP en
`lib/claude-jobs.ts` (sesión nocturna 2026-05-31) rompió el spawn de `claude -p`.
Ver `ESTADO-2026-05-31-NOCHE.md`. Como el arranque reusa el mismo
`startPipelineForIdea` que el botón del kanban, funcionará en cuanto se arregle
`claude-jobs.ts`; sólo quedó sin ejecutar el camino feliz.

---

## 6. Pendiente para cerrar

1. **Arreglar `lib/claude-jobs.ts`** (blocker nº1 del repo) → entonces probar el
   botón "▶ Arrancar pipeline" de verdad: que cree carpeta + encole SARA.
2. **Activar el 5º poller**: vive en `electron/main.ts`, que va compilado en el
   standalone → exige **rebuild + restart de Electron**. Se difirió porque la app
   se va a reconstruir de todos modos.
3. **Drag-drop a mano**: el arrastre HTML5 quedó montado y typecheck-limpio, pero
   Playwright no lo simula con fiabilidad — conviene una pasada manual (los
   endpoints POST/PATCH/DELETE detrás sí están verificados).

---

## 7. Cómo probar en local

```powershell
cd C:\dev\yt-content-pipeline
npm run dev:next            # :3001, headless
# o npm run dev             # con Electron (necesario para el 5º poller)
```

Para ver datos de ejemplo sin esperar a producción real, se pueden poblar
temporalmente los stores (y vaciarlos después — `{ "version": 1, "items": [] }`):
- `~/.yt-content-pipeline/scheduled-uploads.json` → subidas.
- `~/.yt-content-pipeline/content-calendar.json` → planificados.
- `~/.yt-content-pipeline/channel-cadence.json` → cadencia (para ver huecos).

> **OJO**: NO tocar `ideas.json` (banco real de Pablo). Al reescribir JSON con
> acentos/em-dash desde PowerShell, leer con
> `[IO.File]::ReadAllText(p,[Text.Encoding]::UTF8)` (Get-Content mancilla la Ó).

---

## 8. Referencia portada

Punto de partida: `Y:\04_DEV\J.A.R.V.I.S\lab\youtube-dashboard\components\CalendarView.tsx`
(Luna Media OS, marcado "alto valor" en `ESTABILIZACION-2026-05-24.md`). Se portó
la rejilla mes lunes-based y el coloreado por estado; adaptado de Next 16/React
19/Tailwind 4 a Next 14/React 18/Tailwind 3 y al design system glass de ytcp.

---

## 9. Fase 4 — Programación NATIVA de YouTube (publishAt) calendar-aware

> Implementado 2026-06-01. El ÚLTIMO paso (publicar) ahora depende del calendario.

**Comportamiento del detector (`lib/auto-publish.ts`):** cuando un vídeo queda
completo + idle, antes de encolar mira si está en el plan editorial:

- **En calendario, fecha FUTURA** → sube a YouTube como **público PROGRAMADO**
  (`privacyStatus=private` + `publishAt`): YouTube lo hace público SOLO a esa hora,
  sin PC encendido. Aviso informativo por Telegram ("📅 Programado para …").
- **En calendario, fecha PASADA o <10 min** (`upload.py` rechaza `publishAt<=now` y
  la subida tarda) → **red de seguridad**: NO publica a deshora; queda sin subir y
  avisa a Pablo para reprogramar (dedupe `.reschedule-pending.json`). Al darle fecha
  futura (o moverlo en /calendar), el siguiente tick lo programa.
- **NO en calendario** → **OCULTO (unlisted)**, como antes (seguro por defecto).

**Matching planificado ↔ vídeo:** primario por `videoFolder` (lo enlaza
`start-pipeline`; sobrevive a cambios de título de MARCOS); fallback por canal +
título normalizado (carpeta o título final) para planificados sin carpeta enlazada.

**Hora:** el modal usa `datetime-local` → fecha+hora exacta (local → UTC ISO). Si un
planificado fuera solo-fecha, se aplica la hora de cadencia del canal (default 12) en
local. Zona horaria validada (Europe/Madrid): un vídeo a las 17:00 sale a las 17:00.

**Autorización (decisión de Pablo, 2026-06-01):** poner un vídeo en el calendario = luz
verde para que salga público a esa hora, sin confirmación por vídeo. Los que NO están
en el calendario siguen saliendo ocultos. Kill-switch: `YTCP_CALENDAR_SCHEDULE_ENABLED=0`
→ todo a oculto (revierte al comportamiento previo).

**Plumbing reusada (ya existía + probada por /upload):** `upload.py --publish-at`
(valida fecha futura, fuerza private), `ScheduledUpload.publishAt`, `addUpload({publishAt})`.
Solo faltaba conectar el calendario en `auto-publish.ts` + el aviso "Programado".

**Archivos:** `lib/auto-publish.ts` (núcleo), `lib/notify.ts` (aviso programado),
`lib/upload-schedule.ts` (publishAt al aviso + mover ready también los programados),
`app/api/calendar/route.ts` (dedup planned↔upload por basename). Typecheck verde; test
de lógica `_test-schedule.js` 17/17 (tz + matching + overdue). **Pendiente:** validar
con el primer vídeo real programado; reply-capture del reschedule por Telegram (hoy el
aviso pide mover en /calendar o decir la fecha → se actualiza el planificado).
