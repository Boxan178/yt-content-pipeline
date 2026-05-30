# TESTING LOG — sesión autónoma 2026-05-30

> Testing + estabilización mientras Pablo está fuera. Rama
> `test/estabilizacion-2026-05-30` (checkpoint `d19e5b4`, main intacto).
> Objetivo: dejar una versión estable para producir contenido en serie.

---

## ✅ OAuth de YouTube — RESUELTO (era el único bloqueo)

> Resuelto el 2026-05-30 con Pablo. **Subida real confirmada** (video_id
> `G3Z8DzP2Fzo`, unlisted en Moderni Stoici — recordar borrarlo de Studio).
> Cadena de 3 fallos: token caducado (7 días, modo Testing) → `client_secret`
> invalidado al tocar Google Cloud → primera re-auth agarró el canal equivocado
> (Daily Dog). Fix final: `client_secret` fresco descargado + `refresh_token` del
> canal **correcto** (Moderni Stoici, `UCpDsZiNeI-Pi4gqQGqq8JYg`) + **app OAuth
> publicada a Producción** → el token ya NO caduca. Mejora pendiente sugerida:
> que la app verifique `channel_id` esperado vs autorizado antes de subir (evita
> subir al canal equivocado en silencio).

**Historia original (por si reaparece):** el token OAuth de `moderni-stoici` estaba
CADUCADO/REVOCADO. Al probar una subida real, `upload.py` falló con:

```
google.auth.exceptions.RefreshError: invalid_grant: Token has been expired or revoked.
```

**Consecuencia:** por muy bien que funcione todo el pipeline, **NINGÚN vídeo se
subirá** (ni auto-publish ni subida manual) hasta que **re-autorices el canal** en
el engine `youtube-uploader` (re-correr su flow OAuth para `moderni-stoici`). Es lo
PRIMERO a arreglar antes de producir en serie. El código de subida funciona — lo
que falla es la credencial.

> Mejora aplicada para que esto no vuelva a pasar en silencio: ahora una subida
> **automática** que falla te **avisa por Telegram** (antes solo avisaba en éxito).

---

## Respuesta a la pregunta de capacidad (volumen)

- **Cola serial (`tickQueue`)**: **1 vídeo a la vez, de principio a fin**. Con
  `loopUntilComplete` (default SARA), no suelta el vídeo hasta 100% (6 hitos) o
  `<<<VIDEO_DONE>>>`, o bloqueo (`<<<VIDEO_BLOCKED>>>`, 2 turnos sin avance, o
  `maxAttempts`=6). Un vídeo bloqueado/fallido NO frena la cola.
- **Botones "Iniciar pipeline" sueltos** (`/api/claude/jobs`, `startJob`): **sin
  límite** de concurrencia en código. Probado: 2 SARA opus concurrentes sin
  problema (moderni + sleep). Límite real = cuota Claude (plan Max: holgado) +
  CPU/RAM. Sano: **2-4 en paralelo**; la cola para producir en serie sin vigilar.
- **Timeouts/turno**: SARA 30 min, LUIS 45 min, otros 10 min.

---

## ✅ Verificaciones (lo que SÍ funciona)

1. **Máquina de estados de la cola — 9/9 PASS** (`scripts/test-queue-statemachine.ps1`,
   nuevo). Fixtures controlados, sin spawnear SARA real: VIDEO_DONE→done,
   VIDEO_BLOCKED→blocked+motivo, progreso 100%→done, estancamiento (2 turnos)→
   blocked, maxAttempts→blocked, skill de un paso (LUIS)→done, cancelado, sin
   jobId→failed, job perdido→failed. **La lógica nunca probada en producción es
   correcta.**
2. **SARA real Moderni Stoici** (vía cola): spawn OK, **auth Pro OK (sin 401)**,
   skills accesibles (`Skill: sara` cargó), orquestación real (ls/Read/Grep/Bash
   sobre la carpeta), paths UTF-8 (`Ó`, `—`) correctos. Motor validado.
3. **SARA real sleep story** (`the-sleeping-stoic`, vía `/api/claude/jobs`,
   concurrente): spawn OK, trabaja sobre la carpeta. Concurrencia 2× SARA OK.
4. **Endpoints kanban** (`/api/channels/.../videos`): moderni (18 vídeos) y
   the-sleeping-stoic (10) cargan; progreso se computa; brutos compartidos
   detectados (`brutosVisuales:true`).
5. **Camino de subida** (`/api/uploads` → `tickScheduler` → `upload.py`): encola,
   lanza el proceso, y **maneja el fallo correctamente** (status=failed + motivo).
   El engine + venv + `channels.json` (moderni autorizado) existen. Solo falla la
   credencial (ver arriba).
6. **Auto-publish NO dispara** con `YTCP_AUTOPUBLISH_ENABLED=0` (marked:0 antes y
   después). Kill-switch confirmado.

---

## 🔧 Bugs arreglados (commiteados en esta rama)

1. **`electron/main.ts` — cola sin poller de fondo (causa del backlog congelado).**
   La cola es lazy: solo avanza al llamar `/api/queue`. Sin ninguna página de cola
   abierta (p.ej. mirando el kanban) o con la app cerrada, el loop NO re-lanza SARA
   entre turnos → vídeo a medias. **Fix:** `startQueuePoller()` cada 30s (como los
   pollers de Notion/auto-publish), con kill-switch `YTCP_QUEUE_POLLER_ENABLED=0`.
   ⚠️ Solo corre con Electron abierto; para 100% headless/web haría falta un ticker
   server-side (instrumentation.ts) — documentado como mejora futura.
2. **`lib/extract-metadata.ts` — regex `\Z` (no existe en JS).** Cuando
   `## Descripción` era la última sección, el match fallaba → **vídeo subido SIN
   descripción**. **Fix:** `(?![\s\S])` (fin de cadena real). Probado con Node:
   antes `null`, ahora captura la descripción completa.
3. **`lib/upload-schedule.ts` — `tickScheduler` sin mutex → doble subida a YouTube.**
   3 disparadores concurrentes (poller 60s + GET kanban + GET /api/uploads) podían
   lanzar `upload.py` 2× para el mismo vídeo. **Fix:** mutex module-level (como
   job-queue) + persistir `uploading` justo tras lanzar (anti-relaunch por crash).
4. **`lib/upload-schedule.ts` `hasUploadForFolder` — dedupe sin NFC.** El dominio
   tiene `Ó`/`—`; misma carpeta en distinta forma Unicode → dedupe falla → 2ª
   subida. **Fix:** `.normalize('NFC')` en ambos lados.
5. **`lib/job-queue.ts` `findChannelForFolder` — sin NFC + sin separador final.**
   **Fix:** NFC + match con `/` final (evita falsos prefijos y formas Unicode).
6. **`app/api/decisions/route.ts` — regex de checkbox sin NFC.** La decisión de
   Pablo podía no aplicarse (añadía sección duplicada en vez de marcar el checkbox).
   **Fix:** `.normalize('NFC')` en `md` + `itemText` + `statusAnchor`.
7. **`app/api/working-summary/route.ts` — mapeo cola→canal sin NFC.** **Fix:** NFC +
   separador final.
8. **`lib/notify.ts` + `lib/upload-schedule.ts` — subidas auto fallaban en silencio.**
   **Fix:** `notifyUploadFailed()` → aviso Telegram/push cuando una subida
   **automática** falla (solo auto; las manuales se ven en la UI).

Typecheck app + electron: **exit 0** tras todos los fixes.

---

## ⚠️ Hallazgos documentados (NO arreglados — necesitan tu criterio)

- **Detección de guion de sleep stories (MEDIO).** `progress.ts` `sleepStoryHasScript`
  solo cuenta el guion si la carpeta empieza por `story-`, pero las carpetas reales
  de the-sleeping-stoic se llaman por título ("Epictetus at Midnight — …") y los
  `outputDir` del `tts-jobs-en.json` son `story-11-marcus-tablet`, etc. → **mismatch
  total**. Para estos sleep stories el hito "guion" solo cuenta vía `packaging.md
  ≥2KB`; si el guion vive en otro sitio, el loop nunca llega al 100% por progreso y
  depende del marcador `<<<VIDEO_DONE>>>` de SARA. **¿Dónde aterriza el guion de los
  sleep stories nuevos?** Si no es packaging.md, hay que ajustar la detección. No lo
  toqué a ciegas para no romper el camino `story-` que sí funciona.
- **`lib/idea-pipeline.ts` — sin guard atómico contra doble arranque (ALTO/edge).**
  Dos POST `start-pipeline` concurrentes (doble click) podrían lanzar 2 SARA sobre
  la misma carpeta. La cola (`start-queue`) NO tiene este problema (itera en un solo
  request). Fix recomendado: marcar la idea `in-production` antes de scaffolear.
- **`lib/upload-schedule.ts` `moveToReady` — fallos silenciosos (MEDIO).** Si `dst`
  existe o `rename` falla (carpeta en uso), traga el error sin avisar → el vídeo
  queda descolocado y no te enteras. Recomendado: loguear/avisar.
- **`scripts/verify_locucion.py` — `stream.duration` truthy (BAJO).** Un `duration=0`
  válido se evalúa falsy → falso "INCOMPLETA". Fix: comparar `is not None`.
- **`lib/notify.ts` `escapeHtml` no escapa `"` (BAJO).** Hoy seguro (el ID de vídeo
  es regex-safe), pero defensa en profundidad si se interpola un título en un `href`.

(Informe completo del sub-agente de revisión en el historial de la sesión.)

---

## Pendiente / próximos pasos

- **Re-autorizar OAuth de YouTube** (bloqueante para subir — ver arriba).
- Observar un relaunch de loop con SARA real (probado por fixtures + composición;
  pendiente de verlo en vivo al acabar un turno).
- Restaurar el backlog real de la cola (backup en
  `~/.yt-content-pipeline/queue.backup-2026-05-30.json`) tras el testing.
- `npm run build` completo (typecheck ya pasa; build se corre al parar el dev server).
- Limpiar artefactos de test: `H:/YOUTUBE/_YTCP_TEST` (lo borra el script), item
  fallido en `scheduled-uploads.json`, `.upload-jobs/` del vídeo de prueba, y borrar
  el vídeo de prueba `[TEST ytcp - BORRAR]` de YouTube Studio cuando el OAuth funcione.

---

## Actualización — producción en marcha + validaciones finales

- **Pipeline de sleep stories VALIDADO** (la mayor preocupación de Pablo): el turno de SARA
  sobre "Marcus Aurelius' Meditations" produjo de verdad — `guion.md` **251 KB** (guion de 2h)
  + `descripcion-seo.md` + prompt de miniatura IRIS + texto fuente (Meditations, George Long).
  Produce end-to-end igual que moderni.
- **Fix `progress.ts` (guion*.md) validado empíricamente**: esa sleep story NO tiene
  `packaging.md`, pero marca `scriptWritten:true` correctamente por la detección de `guion.md`.
  Sin el fix saldría `false` pese a tener 251KB de guion → el loop nunca la completaría. (9º fix.)
- **Brutos siempre marcado para canales con biblioteca**: confirmado correcto. moderni +
  the-sleeping-stoic → biblioteca poblada → `brutos=true` siempre. drowsy/sleepy → biblioteca
  vacía aún → false (correcto, son el "caso aparte"). Sin cambios necesarios.
- **Producción autónoma montada**: moderni "9 Guards" (maxAttempts=6, ya en fase audio/TTS) +
  una sleep story en la cola, drenando en serie con un driver que simula el poller de Electron.
  TTS (Algrow) y montaje (LUIS) autorizados por Pablo. Recordatorio: las subidas fallan hasta
  re-autorizar el OAuth de YouTube.
- **LUIS / repetición de clips en vídeos de 2h**: es comportamiento de la skill de LUIS
  (`Y:\…\.claude\skills`, `render_project.py`), no de esta app. Confirmar ahí. Para canales con
  biblioteca compartida, NO se generan brutos nuevos (se usan los de la biblioteca).
- **`verify_locucion.py` duración**: NO es bug (el camino primario usa `is not None`; el fallback
  con `duration=0` devuelve 0.0 igual). Descartado.
- **`idea-pipeline.ts` doble-arranque**: NO es riesgo real — la sección crítica es síncrona en
  un único proceso Node (sin `await` entre el check y el `updateIdea`). Descartado.
