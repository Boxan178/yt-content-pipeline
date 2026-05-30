# PLAN próxima sesión — 2026-05-29

> **NO implementado aún (a propósito).** Pablo dejó el pipeline corriendo con ~17 vídeos
> en 2 canales (toda la tarde/noche). Estas dos features se implementan en la **siguiente
> sesión**, cuando no haya producción en curso que se pueda romper. Documento de plan, no
> de ejecución.

Contexto de lo ya hecho hoy (sin commitear): columna **Ideas** + Explorar (MARIO) + Iniciar
pipeline individual + **Empezar cola** (con selección), fix auth de jobs `claude -p`
(`lib/claude-jobs.ts` ya no hereda `ANTHROPIC_API_KEY/BASE_URL`), fix bug "Encolar lote"
(excluía mal; ahora fuera archivados/subidos), 3 canales sleep stories
(`the-sleeping-stoic` operativo con brutos de Moderni Stoici; `drowsy-tales` /
`the-sleepy-historian` pendientes de biblioteca de brutos).

---

## Feature 1 — La cola termina cada vídeo de principio a fin antes de empezar el siguiente

### Problema actual
`startPipelineForIdea(mode:'queue')` (en `lib/idea-pipeline.ts`) hace, por cada idea:
scaffold de carpeta + `idea.md` + `enqueue()` de UN job SARA. La cola (`lib/job-queue.ts`,
`tickQueue`) corre **1 item a la vez** y, cuando ese job de SARA termina (un único turno
`claude -p`, timeout 30 min), **avanza al siguiente** sin comprobar si el vídeo quedó
realmente terminado. Como un solo turno de SARA NO alcanza a completar un vídeo entero
(packaging + guion + TTS + visual + render de LUIS ~25 min + SEO), el vídeo queda **a
medias** y la cola pasa al siguiente → 17 vídeos medio hechos. Además se scaffolean las 17
carpetas de golpe, reforzando la sensación de "todo empezado, nada acabado".

### Comportamiento deseado (Pablo)
"Vídeo por vídeo hasta el final": coger un vídeo y **no soltarlo hasta que esté en
'listo para subir' o realmente bloqueado**. Prefiere quitarse 4-5 completos en una tarde a
empezar 17 y dejarlos a medias. Estrictamente serial (1 vídeo a la vez).

### Implementación propuesta
1. **Loop por vídeo dentro de la cola.** En vez de "1 job → siguiente", el item de cola se
   considera terminado SOLO cuando el vídeo llega a completo o bloqueado:
   - Tras cada turno de SARA, recomputar progreso con `computeProgress(folderPath)`
     (`lib/progress.ts`). Si `percent < 100` y NO hay bloqueo declarado → **re-lanzar SARA
     sobre el mismo vídeo** (otro turno), hasta un máximo (p.ej. 6 turnos o X horas).
   - Solo cuando `percent === 100` (o el vídeo pasó a `ready`) o SARA declaró bloqueo →
     marcar el item `done`/`blocked` y **entonces** avanzar al siguiente.
2. **Marcador de bloqueo en el prompt.** Extender `buildSaraFromIdea` / `LOOP_INSTRUCTION`
   (en `lib/prompts.ts`) para que SARA cierre su turno con una línea explícita:
   `<<<DONE>>>` (vídeo listo), `<<<CONTINUE>>>` (falta trabajo, relánzame) o
   `<<<BLOCKED: motivo>>>` (necesita decisión de Pablo → dejar el vídeo y saltar al
   siguiente). Parsear esa línea del log (reusar `extractAssistantText` de
   `lib/lab/parse-engine-output.ts`).
3. **Avance de cola por vídeo, no por turno.** Modificar `tickQueue` (`lib/job-queue.ts`)
   para soportar el modo "loop hasta completar": un item lleva `attempts`, `maxAttempts`,
   y al terminar un job decide re-lanzar el mismo `videoFolder` o avanzar. Mantener el
   aislamiento de fallos ya existente (un vídeo bloqueado/fallido NO frena la cola).
4. **No scaffolear las 17 de golpe (opcional).** Valorar scaffolear cada idea justo cuando
   le toca el turno en la cola, para que el kanban no muestre 17 carpetas vacías a la vez.
   (Decisión menor; el loop de completitud es lo importante.)

### Archivos
`lib/job-queue.ts` (loop/attempts + decisión avanzar), `lib/idea-pipeline.ts` (no cambiar
mucho), `lib/prompts.ts` (marcadores DONE/CONTINUE/BLOCKED), reuse `lib/progress.ts` y
`lib/lab/parse-engine-output.ts`.

### Riesgos / notas
- Timeouts: un vídeo completo puede necesitar varios turnos de 30-45 min. Definir tope de
  tiempo/reintentos por vídeo para no quedarse pegado.
- El render de LUIS es el paso largo (~25 min); el loop debe tolerarlo sin contarlo como
  "sin progreso".

---

## Feature 2 — Canales "trabajando" destacados en la página principal (`app/page.tsx`)

### Deseado (Pablo)
En la home de canales, **arriba**, mostrar los canales que están trabajando (con vídeos en
curso), igual que la tarjeta de vídeo muestra en rojo qué se está haciendo y cuánto lleva:
- **Highlight rojo** en la tarjeta del canal que tiene un job **vivo ahora mismo** (en
  directo). Como la cola es serial, normalmente 1 (máx 2-3 si se lanzan individuales).
- **Contadores por canal**: vídeos en curso / en cola dentro de ese canal (p.ej. "17 en
  total · 5 en este · 10 en otro"). Cuentan también los vídeos **en cola o a medias**,
  aunque ese canal no tenga el job vivo en ese instante.
- Ordenar los canales que trabajan **al principio**.

### Datos / fuentes a reutilizar
- **Jobs vivos por canal**: `GET /api/claude/jobs/all` (`app/api/claude/jobs/all/route.ts`)
  ya devuelve todos los jobs con `channel`, `videoTitle`, `job.status` (running primero) y
  `job.startedAt` (para el "cuánto lleva"). Filtrar `status==='running'`.
- **Cola por canal**: `readQueue()` (`lib/job-queue.ts`) → items `pending`/`running`;
  mapear `item.videoFolder` → canal por prefijo `channel.rootPath`.
- Crear un endpoint ligero `GET /api/working-summary` que agregue por canal:
  `{ liveJobs, queued, inProgressIncomplete, total, current?: {videoTitle, skill, startedAt} }`.
  (Evitar recomputar todo el kanban en la home; este endpoint debe ser barato.)

### UI
- En `app/page.tsx` (lista `CHANNELS.filter(enabled)`), añadir sección "Trabajando ahora"
  arriba + en cada tarjeta de canal con `liveJobs>0` el mismo lenguaje visual que
  `components/VideoCard.tsx` (badge rojo pulsante con label del skill + elapsed). Reusar el
  cálculo de `elapsed` de VideoCard.
- Polling ligero (la home puede pollear `/api/working-summary` cada ~10-15s).

### Corrección a lo que dijo Pablo (concurrencia)
- Hoy la cola es **estrictamente serial: 1 vídeo a la vez**. No hay setting de "2-3 a la
  vez". Los botones "Iniciar pipeline" individuales SÍ pueden lanzar jobs concurrentes
  (cada uno es independiente), así que en la práctica puede haber 1 (cola) + N (manuales)
  vivos a la vez, pero no es un límite configurable.
- Si Pablo quiere "trabajar 2-3 a la vez" de forma controlada, eso es una **feature aparte**:
  añadir un límite de concurrencia a `tickQueue` (correr hasta K jobs en paralelo en vez de
  1). OJO: esto entra en tensión con la Feature 1 ("uno hasta el final"). Decidir en la
  próxima sesión si la cola es serial-completa (Feature 1) o concurrente K (2-3). Lo natural:
  serial-completa por defecto; concurrencia como opción avanzada.

### Archivos
`app/page.tsx` (UI + sección working), nuevo `app/api/working-summary/route.ts`, reuse
`app/api/claude/jobs/all`, `lib/job-queue.ts` (readQueue), `components/VideoCard.tsx`
(lenguaje visual del badge rojo/elapsed).

---

## Orden sugerido próxima sesión
1. Confirmar que la producción de hoy terminó (no romper nada en curso).
2. Feature 1 (loop de completitud en la cola) — es la que más valor da.
3. Feature 2 (canales trabajando en la home).
4. Decidir concurrencia (serial-completa vs K=2-3).
5. Commit de TODO (lo de hoy sigue sin commitear).
