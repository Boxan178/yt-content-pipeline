# TELEGRAM-APPROVALS-PLAN.md

> Capa de **aprobaciones interactivas vía Telegram** sobre yt-content-pipeline.
> Fecha: 2026-05-31. Estado: **VALIDADO por Pablo — en implementación (MVP).**
> Autor: Claude (Opus 4.8). Sale de la exploración cerrada en el sandbox de J.A.R.V.I.S.

> **Decisiones del MVP cerradas por Pablo (2026-05-31):**
> 1. **Bot DEDICADO para la app** (`~/.claude/secrets/ytcp-approvals-bot.json`). Durante la prueba se descubrió que el **plugin de Telegram de Claude Code** corre un proceso `bun` (PID vivo) haciendo `getUpdates` sobre el MISMO `@jarvis_pnavas_bot` que usa `notify.ts`: dos consumidores de `getUpdates` no coexisten, así que el plugin se comía los callbacks de los botones. Solución elegida: la app usa su propio bot para las aprobaciones (entrada+salida); `@jarvis_pnavas_bot` se queda para el plugin y para los avisos salientes de `notify.ts`. El código cae al bot J.A.R.V.I.S. si el dedicado no está configurado (con la contención conocida).
> 2. **Punto del MVP: aprobar el TÍTULO** (texto). Miniatura (`sendPhoto`) queda como fast-follow inmediato.
> 3. **Incluir notas** vía `force_reply` (rechazar con motivo) en el MVP.

## 0. Las dos decisiones ya cerradas (no se re-preguntan)

1. **Un solo bot (J.A.R.V.I.S.), varias voces.** El bot prefija con la skill que pide la decisión ("🎬 SARA: ¿apruebas este título?"). La voz sale de `job.skill` / `job.label`, que ya viajan en cada job.
2. **Primer paso: aprobaciones interactivas** (gate real bloqueante). NO notificaciones decorativas, NO grupos temáticos, NO disparar agentes desde el móvil — eso es backlog posterior.

---

## 1. TL;DR — qué propongo

**Gate elegido: opción (b) — pipeline partido en fases con gates, reforzado con un "artefacto de solicitud de decisión" persistido en disco.** El "wait" lo hace la **app**, no el agente. Cuando un agente llega a un punto de decisión, **termina su turno** dejando la pregunta planteada; el proceso `claude -p` muere (coste cero mientras se espera, que pueden ser horas); y la app **re-lanza** un job nuevo con la decisión inyectada en el prompt cuando Pablo responde.

**Telegram entrante: poller `getUpdates` desde un nuevo poller de Electron**, calcado de los tres que ya existen (`startNotionPoller`, `startAutoPublishPoller`, `startQueuePoller`). NO webhook (requiere endpoint público HTTPS; la app es local + Tailscale). El poller pega cada ~3 s a una ruta Next nueva `/api/telegram/poll`, que hace `getUpdates`, enruta el `callback_query` del botón a la solicitud pendiente, edita el mensaje y reanuda el flujo.

**Modelo de la solicitud de decisión:** un `ApprovalRequest` JSON persistido en `~/.yt-content-pipeline/approvals.json` (mismo patrón que `queue.json` y `scheduled-uploads.json`), enganchado al substrato que **ya existe**: los agentes escriben `**Estado:** ⏳ PENDIENTE ELECCIÓN DE PABLO` en `packaging.md`, y `/api/decisions` ya sabe resolverlo reescribiendo el ancla. La respuesta de Telegram llama a ese mismo `/api/decisions`, así que **el panel "Decisiones de Pablo" de la app y Telegram quedan siempre en sync**.

Por qué (b) y no (a) ni (c): un job `claude -p` es **detached y no interactivo** — no puede "esperar input por stdin". Tanto (a) "el agente sondea una fila" como (c) "una tool MCP que bloquea" obligan a **mantener vivo el proceso claude** mientras espera, quemando el `timeoutMs` (máx 60 min) y un slot de la suscripción Pro para no hacer nada. Si Pablo responde a la mañana siguiente, ese modelo es inviable. (b) no mantiene ningún proceso: la espera es "no hay job corriendo + existe un `ApprovalRequest` pendiente en disco". Justificación completa en §4.

---

## 2. Lo que ya existe (confirmado leyendo el código, no redescubierto de cero)

| Pieza | Archivo | Qué aporta al gate |
|---|---|---|
| **Telegram saliente** | `lib/notify.ts` | `sendTelegram(html)` → POST directo a la Bot API del bot J.A.R.V.I.S. Carga el secreto de `~/.claude/secrets/jarvis-bot.json` `{token, chat_id}`. **Reutilizo el cargador de secreto y el patrón fetch puro** — sin grammy/telegraf. |
| **Jobs `claude -p`** | `lib/claude-jobs.ts` | `startJob()` spawnea detached, persiste en `<videoFolder>/.claude-jobs/<id>.json` + `.log`. Purga `ANTHROPIC_API_KEY/AUTH_TOKEN/BASE_URL` del hijo (suscripción Pro). `approval` hoy es **cosmético**. |
| **Convención de marcadores** | `lib/job-queue.ts` → `detectMarkers()` | SARA ya emite `<<<VIDEO_DONE>>>` / `<<<VIDEO_BLOCKED:…>>>` en su salida y la app los parsea vía `extractAssistantText(readFileSync(logPath))`. **Es exactamente el mecanismo "el agente le señala algo a la app".** |
| **Re-lanzado turno a turno** | `lib/job-queue.ts` → `tickQueue()` / `relaunchSara()` | La cola ya re-lanza SARA sobre el mismo vídeo hasta completar/bloquear. **Es ya un gate-por-fases en espíritu.** Estados: `pending/running/done/failed/cancelled/blocked`. Mutex `ticking`. |
| **Espera-y-dispara** | `lib/upload-schedule.ts` → `tickScheduler()` | Patrón "la app espera (scheduledFor) y luego lanza". Mutex `schedulerTicking`. |
| **Decisiones de Pablo (substrato)** | `lib/parse-pablo-decisions.ts`, `app/api/decisions/route.ts`, `components/PabloDecisionsPanel.tsx`, `DecisionModal.tsx` | Los agentes escriben `PENDIENTE ELECCIÓN DE PABLO` en `packaging.md`; el panel lo muestra; `/api/decisions` lo resuelve (reescribe ancla → `✅ ELEGIDO: …` + histórico en `_PACKAGING/decisions/`). **Aquí enchufo Telegram.** |
| **Pollers de background** | `electron/main.ts` | 3 pollers `setInterval` → `fetch(baseUrl + '/api/…')`. Idempotentes, mutex server-side. **Añado un cuarto idéntico para Telegram entrante.** |
| **Paths / seguridad** | `lib/config.ts` | `normalizeAllowedPath()`, `JARVIS_ROOT`, whitelist. Lo reuso para validar carpetas. |

Estado del bot (sonda read-only `getWebhookInfo`/`getMe` hecha hoy): bot **`@jarvis_pnavas_bot`** (id `8700756970`), **sin webhook puesto**, `pending_update_count=0`. Hoy es **solo-salida** desde este repo (no hay ningún `getUpdates`/`callback_query`/webhook en el código). → `getUpdates` está libre **salvo** que otro proceso fuera del repo consuma el mismo token (ver §7, riesgo nº1).

---

## 3. El problema central: ¿cómo pausa y espera un job detached?

`claude -p` se lanza así (`lib/claude-jobs.ts`):

```
spawn(node, [cli.js, '-p', '--output-format','stream-json','--verbose','--model',…, PROMPT],
      { detached:false, stdio:['ignore', logfd, logfd], windowsHide:true })
```

- **stdin = ignore** (`/dev/null`). No hay canal para "mandarle la respuesta de Pablo" a mitad de ejecución.
- Es **un run agéntico de una sola tirada**: arranca, trabaja, termina. No hay sesión interactiva a la que conectar un bot (por eso el **plugin oficial de Telegram de Claude Code NO sirve aquí** — conecta un bot a una sesión interactiva).
- Tiene `timeoutMs` (máx **60 min**). Un agente "dormido" esperando input se come ese presupuesto sin hacer nada.

Conclusión: **el agente no debe esperar. Debe plantear la pregunta y morir. La app espera y lo resucita con la respuesta.**

---

## 4. Evaluación de las tres opciones (a/b/c)

### (a) Polling de una fila de decisión por el propio agente
El agente escribe la solicitud y **sondea** (bucle bash leyendo un archivo / fila Supabase) hasta que llega la respuesta, entonces continúa.
- ❌ **Mantiene vivo el proceso `claude -p`** mientras espera → quema `timeoutMs` (muere a los ≤60 min aunque Pablo no haya contestado) y ocupa un slot Pro sin trabajar.
- ❌ Si Pablo responde a las 8 h, imposible.
- ❌ Frágil: un bucle de sondeo dentro del agente depende de que el agente "se porte bien" turno a turno.
- ✅ Lo único bueno (el **artefacto de solicitud** persistido) me lo quedo y lo uso en (b).

### (b) Pipeline partido en fases con gates ✅ **ELEGIDA**
Cada fase es un job. La app solo lanza la fase siguiente cuando llega la aprobación. El "wait" lo hace la app.
- ✅ **Cero proceso mantenido**: esperar = "no hay job + hay `ApprovalRequest` pendiente". Coste 0 durante horas/días.
- ✅ **Sobrevive a reinicio de Electron**: la solicitud es un archivo en disco; el poller la re-evalúa al arrancar.
- ✅ **Encaja con lo que ya hay**: marcadores (`<<<…>>>`), re-lanzado turno a turno (`tickQueue`/`relaunchSara`), pollers de Electron, `/api/decisions`. Reaprovecho, no invento.
- ✅ Respeta las prohibiciones del CLAUDE.md (no toco el spawn, no `shell:true`, no `detached:true`, no API key, no paths hardcoded).
- ⚠️ El agente tiene que **terminar limpio** en el gate (no intentar seguir más allá). Se controla desde el prompt que compone la app (`lib/prompts.ts`, en ESTE repo — no hace falta editar las skills de J.A.R.V.I.S.).

### (c) Tool/MCP "pedir decisión" que bloquea hasta respuesta
El agente invoca una tool que hace long-poll hasta la respuesta.
- ❌ Mismo defecto raíz que (a): **bloquea el proceso claude** → incompatible con timeout de 60 min y con esperas de horas.
- ❌ Más infra: un server MCP que construir, registrar en la config del claude spawneado y mantener vivo.
- ✅ Sería el mejor DX **si los jobs fueran interactivos** — no lo son.

**Veredicto:** (b), tomando de (a) el artefacto de solicitud persistido. Es la única que no mantiene un proceso caro parado esperando a un humano.

---

## 5. Arquitectura del gate elegido

### 5.1 Flujo de mensajes (saliente + entrante)

```
                    PUNTO DE DECISIÓN (título / miniatura / guion)
                                  │
   Agente (claude -p) ───────────┤  escribe la pregunta y TERMINA su turno:
                                  │   · packaging.md: "**Estado:** ⏳ PENDIENTE ELECCIÓN DE PABLO"
                                  │     (substrato que YA usan SARA/MARCOS/NORA), y/o
                                  │   · marcador en su log: <<<DECISION_REQUEST {json} >>>
                                  ▼
   ┌─────────────── /api/telegram/approvals/tick (idempotente, mutex) ───────────────┐
   │ detecta solicitudes nuevas (vía parsePabloDecisions + marcador del log)          │
   │ crea ApprovalRequest{ id, token, videoFolder, skill/voz, kind, question, …}      │
   │ → SALIENTE: notify.ts sendApproval():                                            │
   │     sendMessage / sendPhoto con inline_keyboard  [✅ Aprobar] [❌ Rechazar] [📝]  │
   │     prefijo de voz: "🎬 SARA pregunta:"   (de job.skill/label)                   │
   │   guarda telegram message_id + chat_id en el request; status=sent                │
   └─────────────────────────────────────────────────────────────────────────────────┘
                                  │
            Pablo, desde el MÓVIL (Tailscale/4G — da igual, va a los
            servidores de Telegram, no a la app) pulsa  ✅ / ❌ / 📝
                                  │
   ┌──────── Electron: startTelegramPoller (cada ~3s) → POST /api/telegram/poll ──────┐
   │ getUpdates(offset, allowed_updates=[callback_query,message])                     │
   │ valida from.id == chat_id configurado (ignora a cualquier otro)                  │
   │ matchea callback_data "<token>:<choice>" con un ApprovalRequest pendiente        │
   │ → answerCallbackQuery (quita el "reloj")  +  editMessageText ("✅ Aprobado")      │
   │ → POST /api/decisions  (reescribe ancla packaging.md → ✅ ELEGIDO + histórico)    │
   │ → REANUDA: re-lanza el job gated con la decisión inyectada en el prompt          │
   │ persiste el nuevo offset                                                         │
   └─────────────────────────────────────────────────────────────────────────────────┘
                                  │
   Agente (claude -p, turno nuevo) continúa ya desbloqueado ───────────────────────►
```

### 5.2 ¿Dónde vive el listener entrante?

**Nuevo poller de Electron `startTelegramPoller()` en `electron/main.ts`**, gemelo de los tres existentes:
- Cada ~3 s hace `fetch(baseUrl + '/api/telegram/poll', {method:'POST'})`. (3 s para que una aprobación se note casi al instante; el `getUpdates` puede usar long-poll `timeout` para no malgastar.)
- Toda la lógica vive **server-side en Next** (la ruta), donde están `notify.ts`, `claude-jobs.ts`, `config.ts`. El poller de Electron es un disparador tonto, como los otros.
- `stop` en `window-all-closed` y `before-quit`, igual que los demás.
- Kill-switch por env (`YTCP_TELEGRAM_POLLER_ENABLED=0`), patrón idéntico al queue-poller.

**Por qué NO un proceso aparte tipo `worker/worker.py`:** ese worker es un loop específico de Supabase `thumbnail_jobs`+kie-bridge, se arranca a mano y no siempre corre. El poller de Electron es el mecanismo "siempre-vivo-con-la-app" ya establecido, mantiene la lógica en TS junto al resto, y no añade un proceso nuevo que cuidar. **Por qué NO webhook:** exige URL pública HTTPS; la app es local + Tailscale; `getUpdates` funciona detrás de NAT sin exponer nada.

> Limitación heredada (documentada en el queue-poller): esto **solo corre con Electron abierto**. Para headless 100% haría falta un ticker server-side (`instrumentation.ts`). Aceptable: Pablo tiene la app abierta en su PC.

### 5.3 Modelo de la "solicitud de decisión"

Estado global en `~/.yt-content-pipeline/approvals.json` (mismo patrón que `queue.json`/`scheduled-uploads.json`; el poller encuentra las pendientes sin escanear todas las carpetas de vídeo):

```ts
type ApprovalStatus = 'open' | 'sent' | 'answered' | 'expired' | 'failed';
type ApprovalChoice = 'approved' | 'rejected';

interface ApprovalRequest {
  id: string;                 // uuid
  token: string;              // 8 hex — va en callback_data (límite 64 bytes de Telegram)
  createdAt: string;
  // — a qué pertenece —
  videoFolder: string;        // normalizeAllowedPath
  channel?: string;
  videoTitle?: string;
  // — la voz —
  skill: string;              // 'sara' | 'marcos' | 'nora' | … → emoji+nombre
  label: string;
  // — la pregunta —
  kind: 'approve_reject';     // MVP. Backlog: 'choice' | 'thumbnail_pick' | 'free_text'
  question: string;           // "¿Apruebas este título?"
  payload?: { title?: string; options?: string[] };
  imagePath?: string;         // si hay foto (miniatura) → sendPhoto
  // — enganche al substrato packaging.md —
  statusAnchor?: string;      // línea exacta "PENDIENTE ELECCIÓN DE PABLO" a resolver vía /api/decisions
  // — gobierno del re-lanzado —
  gatedJobId?: string;        // job que planteó la pregunta (para reconstruir el resume)
  resumeSkill?: string;       // skill a re-lanzar al responder
  // — Telegram —
  chatId?: string | number;
  messageId?: number;         // para editar el mensaje al responder
  // — resolución —
  status: ApprovalStatus;
  answer?: { choice: ApprovalChoice; notes?: string; answeredAt: string };
}
```

**Cómo se levanta una solicitud (dos vías, no excluyentes):**

- **Vía A — bridge cero-touch sobre `packaging.md` (recomendada para el MVP):** los agentes **ya** escriben `PENDIENTE ELECCIÓN DE PABLO`. El tick usa `parsePabloDecisions()` (ya existe) para detectarlas y crear el `ApprovalRequest`. **No hay que tocar ninguna skill de J.A.R.V.I.S.** El `statusAnchor` permite resolver vía `/api/decisions` y que el panel de la app se limpie solo.
- **Vía B — marcador explícito en el log:** para gates duros donde controlamos el prompt (lo inyecta la app desde `lib/prompts.ts`, en este repo), el agente emite `<<<DECISION_REQUEST {json} >>>` y termina. El tick lo parsea con `extractAssistantText` (idéntico a `detectMarkers`). Da control determinista del punto exacto de pausa.

El MVP usa **Vía A** (real, end-to-end, sin editar skills). La Vía B queda diseñada para gates que requieran pausa quirúrgica.

### 5.4 La voz del agente (prefijo)

Mapa `skill → emoji+nombre` en un helper nuevo (`lib/agent-voices.ts`), fallback a `job.label`:

```
sara→🎬 SARA · marcos/youtube-titles→✍️ MARCOS · nora→🎨 NORA · iris→🖼️ IRIS
elena→🔍 ELENA · amelia→✅ AMELIA · luis→🎞️ LUÍS · marcus-hale→👤 MARCUS
marco-aurelio→🏛️ MARCO AURELIO · mario→📈 MARIO
```

Mensaje saliente típico:
```
🎬 SARA pregunta · Moderni Stoici
"The Shipwreck That Created Stoicism"
¿Apruebas este título?
[ ✅ Aprobar ]   [ ❌ Rechazar ]   [ 📝 Notas ]
```

### 5.5 Reanudar el flujo

Al responder, el poller:
1. Marca `ApprovalRequest.answer` + `status=answered`.
2. `answerCallbackQuery` + `editMessageText` → "✅ Aprobado por Pablo · 21:34" (quita botones, evita doble-tap).
3. `POST /api/decisions` con `{folder, statusAnchor, decision}` → packaging.md pasa a `✅ ELEGIDO` + histórico; el panel de la app se limpia.
4. **Re-lanza** el siguiente turno (`startJob`/cola) con la decisión inyectada en el prompt:
   - Aprobado → "Pablo aprobó el título. Continúa con el siguiente paso."
   - Rechazado (+ notas) → "Pablo rechazó: «…». Propón una alternativa y vuelve a preguntar."
   La voz/skill se conservan.

**Notas (📝):** los inline buttons no capturan texto libre. Patrón estándar: "📝 Notas" responde con un `force_reply` ("Escribe tus notas para SARA…") y el **siguiente mensaje** de Pablo (un `message` con `reply_to_message`) lo captura el mismo poller y se adjunta como `answer.notes`. En el MVP esto es opcional (ver §10): el núcleo es ✅/❌.

---

## 6. Restricciones del repo respetadas

- ✅ **Suscripción Pro siempre**: el re-lanzado usa `startJob()`, que ya purga `ANTHROPIC_API_KEY/AUTH_TOKEN/BASE_URL`. No toco eso.
- ✅ **No toco el spawn**: nada de `shell:true` ni `detached:true`. Reuso `startJob` tal cual.
- ✅ **No toco el split layout** (`app/layout.tsx`).
- ✅ **No hardcodeo paths**: `lib/config.ts` (`normalizeAllowedPath`, `JARVIS_ROOT`). El secreto del bot por el cargador de `notify.ts`.
- ✅ **No edito skills desde aquí**: el MVP (Vía A) funciona con lo que las skills ya escriben. Si hace falta instrucción de gate, se añade desde `lib/prompts.ts` (este repo), no en `Y:\…\.claude\skills`.
- ✅ **Sin librería de Telegram**: fetch puro a la Bot API, como `notify.ts`.
- ✅ **No fusiono `progress-types.ts` con `progress.ts`**; módulos nuevos respetan browser-safe vs server-only (`'server-only'` donde toque).

---

## 7. Riesgos y mitigaciones

1. **🔴 Exclusividad de `getUpdates` (riesgo nº1).** Telegram permite **un solo consumidor** de updates por bot (webhook XOR getUpdates; dos `getUpdates` se roban updates y dan `409 Conflict`). Hoy no hay webhook y el repo es solo-salida → libre. **PERO** si algo fuera del repo (p. ej. Mission Control en el VPS) consume el **mismo** token `@jarvis_pnavas_bot`, chocaríamos. **Mitigación:** confirmar con Pablo (§11 Q1). Si está ocupado → **token de bot dedicado para ytcp** (`~/.claude/secrets/jarvis-bot.json` admite override; o un `ytcp-approvals-bot.json`). El diseño es idéntico con otro token.
2. **Seguridad / prompt-injection desde Telegram.** El poller **solo** honra `callback_data` que matchee un `ApprovalRequest` pendiente **y** `from.id == chat_id` configurado. Ignora cualquier otro remitente y **nunca** interpreta texto libre como comando (el texto solo se adjunta como `notes` a una solicitud concreta vía force-reply). Disparar agentes desde el móvil es backlog, fuera de este MVP.
3. **Idempotencia / offset.** El poller persiste el `update_id` offset en disco y usa mutex module-level (como `tickQueue`/`tickScheduler`). Reinicio de Electron = retoma offset, no re-procesa.
4. **Doble-tap / carrera.** Al responder se edita el mensaje quitando botones y el request pasa a `answered`; un segundo callback sobre un request ya resuelto se ignora (con `answerCallbackQuery` "ya resuelto").
5. **Límite 64 bytes de `callback_data`.** Por eso `token` corto (8 hex) en vez del uuid entero.
6. **Solo con Electron abierto** (heredado del queue-poller). Documentado; aceptable para el uso de Pablo.
7. **Caducidad.** Una solicitud sin responder en X (config, p. ej. 7 días) pasa a `expired` para no acumular ruido.

---

## 8. Archivos (alcance del cambio)

**Nuevos**
- `lib/agent-voices.ts` — mapa skill→emoji+nombre (browser-safe).
- `lib/approvals.ts` (`server-only`) — modelo `ApprovalRequest`, CRUD sobre `approvals.json`, detección (parsePabloDecisions + marcador), reanudación, offset.
- `app/api/telegram/approvals/tick/route.ts` — detecta solicitudes nuevas y las manda a Telegram (idempotente, mutex). Lo dispara el auto-publish poller o uno propio.
- `app/api/telegram/poll/route.ts` — `getUpdates` + enruta callbacks + reanuda. Idempotente, mutex, valida chat_id.
- `app/api/approvals/route.ts` *(opcional)* — GET pendientes / POST responder, para paridad in-app y debug.

**Tocados**
- `lib/notify.ts` — añadir helpers low-level Bot API: `sendApproval()` (sendMessage/sendPhoto + inline_keyboard), `telegramGetUpdates()`, `telegramAnswerCallback()`, `telegramEditMessage()`. Reusa el cargador de secreto existente.
- `electron/main.ts` — `startTelegramPoller()` + stop en los dos teardown (gemelo de los 3 pollers).
- `lib/job-queue.ts` *(si el MVP pasa por la cola)* — estado `awaiting-decision` para pausar en vez de "stall", y reanudar al responder. *(Para el MVP puedo re-lanzar directo sin tocar la cola; lo decido con Pablo.)*
- `lib/prompts.ts` *(solo si se usa Vía B / gate explícito)* — apéndice de instrucción de gate.

Typecheck app + electron deben quedar en exit 0 (como exige la auditoría).

---

## 9. Modelo de datos en disco (resumen)

```
~/.yt-content-pipeline/
├── approvals.json            # { version:1, offset:number, items: ApprovalRequest[] }
├── queue.json                # (existe)
└── scheduled-uploads.json    # (existe)

<videoFolder>/_PACKAGING/
├── packaging.md              # "PENDIENTE ELECCIÓN DE PABLO" ↔ "✅ ELEGIDO" (existe)
└── decisions/<ts>.md         # histórico (existe, lo escribe /api/decisions)
```

---

## 10. MVP — un punto de decisión real end-to-end

**Objetivo:** aprobar **el título** (o la miniatura — a elegir, §11 Q2) de un vídeo real, por Telegram, con botones, que **pause y reanude** el flujo de verdad, con la voz del agente en el prefijo.

Camino recomendado (Vía A, título, cero edición de skills):
1. Un vídeo con `packaging.md` que contenga la sección de títulos + `**Estado:** ⏳ PENDIENTE ELECCIÓN DE PABLO` (lo que SARA/MARCOS ya producen).
2. `tick` lo detecta (`parsePabloDecisions`) → crea `ApprovalRequest` → Telegram: "✍️ MARCOS pregunta · «título» · ¿Apruebas? [✅][❌]".
3. Pablo pulsa ✅ desde el móvil.
4. `/api/telegram/poll` lo recoge → edita el mensaje → `POST /api/decisions` (packaging.md → `✅ ELEGIDO`, panel se limpia) → re-lanza el siguiente turno con "título aprobado, continúa".
5. (✅ aceptación) El vídeo avanza; (❌) se re-lanza al proponente para nueva opción.

**Criterio de hecho:** decisión real resuelta desde el móvil; packaging.md + panel actualizados; flujo reanudado; voz correcta en el prefijo; sin API key; typecheck limpio.

---

## 11. Preguntas para Pablo (antes de implementar)

1. **Bot dedicado o compartido:** ¿algo fuera de este repo (p. ej. Mission Control en el VPS) ya consume los updates entrantes de `@jarvis_pnavas_bot`? Si sí → token dedicado para ytcp. (Riesgo nº1.)
2. **Punto del MVP:** ¿**título** (texto, lo más simple) o **miniatura** (requiere `sendPhoto`, más visual)?
3. **Notas (📝):** ¿el MVP incluye "rechazar con notas" (force-reply) o lo dejamos como fast-follow y el MVP es solo ✅/❌?

---

## 12. Backlog posterior (NO en este MVP)

- Decisiones `choice` (varias opciones como botones), `thumbnail_pick` (galería), fecha de publicación.
- Notas force-reply pulidas; editar/repreguntar.
- Disparar agentes/skills desde el móvil (con su capa de seguridad).
- Notificaciones decorativas y grupos temáticos.
- Ticker server-side (`instrumentation.ts`) para operación headless sin Electron.
- Multi-canal / varios destinatarios.

---

## 13. ESTADO FINAL + CHANGELOG DE LA SESIÓN (2026-05-31 → 2026-06-01)

Todo lo de abajo está **implementado y validado end-to-end** sobre el bot dedicado `@yt_content_pipeline_bot`, respondiendo desde el móvil, corriendo la app con Electron (`npm run dev`). `npx tsc --noEmit` (app) y `tsc -p electron/tsconfig.json` → **exit 0**. `npm run build` → **✓ verde**. **Sin commitear.**

### 13.1 Qué se entregó

| Pieza | Estado | Detalle |
|---|---|---|
| **Gate de aprobaciones** (opción b) | ✅ validado | El agente plantea y muere; la app espera (coste 0) y re-lanza `claude -p` con la decisión inyectada. Suscripción **Pro** (`apiKeySource: none`). |
| **Aprobar título** ✅/❌ | ✅ | callback en ~2s → `answered` → edita el mensaje → resuelve `packaging.md` (mismo `applyDecision` que el panel "Decisiones de Pablo") → re-lanza. |
| **Rechazar con notas** 📝 | ✅ | `force_reply` captura el texto del siguiente mensaje → re-lanza con `decision=rejected` + notas (UTF-8 íntegro). |
| **Preview de miniatura** (`sendPhoto`) | ✅ | manda la imagen real con botones; al **aprobar** escribe `.selected-thumb` (la usa el motor de subida) y re-lanza. Detección auto de decisiones "Miniatura (NORA)" en packaging.md. |
| **Voz del agente** | ✅ | prefijo `🎬 SARA` / `✍️ MARCOS` / `🎨 NORA`… desde `job.skill` (`lib/agent-voices.ts`). |
| **Bot DEDICADO** `@yt_content_pipeline_bot` | ✅ | secreto en `~/.claude/secrets/ytcp-approvals-bot.json`. NUNCA cae a `@jarvis_pnavas_bot` (si no, pelearía con el plugin de Telegram de Claude Code por `getUpdates`). |
| **Toggle "En el PC / Fuera"** cableado | ✅ | persiste server-side (`working-mode.json`), avisa a Telegram al cambiar de modo. |
| **Avisos de completados** ("Fuera" = ponme al día) | ✅ | cuando estás "Fuera", Telegram te avisa de lo que acaba (jobs de cola + subidas). Con baseline anti-inundación. |
| **Fix build `.exe`** (NFT EISDIR en H:/) | ✅ verde | ver §13.4. |

### 13.2 Semántica del toggle "En el PC / Fuera" (decisión de Pablo, MIXTO)

- Las **aprobaciones van SIEMPRE por Telegram**, en ambos modos. El toggle NO las apaga.
- `'home'` = **"En el PC"**: presente. Solo recibe las decisiones por Telegram.
- `'away'` = **"Fuera del PC"**: además recibe **avisos de completados** (renders, subidas, jobs…).
- Al **cambiar de modo** → mensaje a Telegram (📲 Fuera / 💻 En el PC).
- Implementación: `lib/working-mode.ts` (estado en disco) + `app/api/working-mode/route.ts` (GET/POST + aviso) + `components/WorkingModeToggle.tsx` (sincroniza con el server, ya no solo localStorage) + `lib/completion-notify.ts` (avisos de "algo acabó", solo si `away`, gateado y con baseline) enganchado en `runTelegramPoll`.

### 13.3 ⚠️ El poller vive en ELECTRON — implicación para el `.exe`

El listener que procesa las pulsaciones (`startTelegramPoller`) corre **dentro de Electron** (`electron/main.ts`), pegando cada 3 s a `/api/telegram/poll`. Por tanto la feature SOLO funciona con la app **con Electron**:
- ✅ `npm run dev` (Next + Electron) — **valida aquí**.
- ✅ un **`.exe` NUEVO** compilado con este código.
- ❌ el `.exe` **v0.6.0** instalado (código viejo, sin nada de esto).
- ❌ `dev:next` solo (Next sin Electron) — no hay poller.

> Se intentó un poller server-side vía `instrumentation.ts` (para cubrir headless/web) pero **no late bajo `next dev --turbo`** ni se confirmó en standalone; se descartó (borrado). El de Electron es el fiable. Headless/web-only = mejora futura (script poller dedicado o `instrumentation` sin turbo).

### 13.4 Fix del build (`next build` petaba con EISDIR en H:/)

NFT (`@vercel/nft`) resolvía literales de path a H:/ e Y: (de `channels.ts`, `prompts.ts`, `bootstrap-runner.ts`), los recorría como asset y `readlink` reventaba sobre carpetas raras (`idea.md`). Fix en 3 capas:
1. `scripts/nft-skip-external-drives.js` — preload **build-only** (NODE_OPTIONS): `stat/lstat/readlink/realpath` sobre H:/ o Y: → **ENOENT** → NFT no los recorre ni peta (robusto, independiente del literal que folee).
2. `scripts/build-isolated.js` — aparta `.claude/{skills,worktrees}` durante el build (y restaura siempre) + inyecta el preload. `package.json`: `build` = `node scripts/build-isolated.js npm run build:raw` (pasos crudos en `build:raw`).
3. Runtime provee el drive real por env (el build deja fallback vacío): `dev:next` con `cross-env YTCP_DRIVE_H=H YTCP_DRIVE_Y=Y`; Electron `startNextServer` setea `YTCP_DRIVE_H/Y`; `config.ts` con rama cliente `typeof window` (browser-safe).

Ver memoria [[reference_nft_build_external_drives]].

### 13.5 Inventario de archivos

**Nuevos**
- `lib/agent-voices.ts` — voz (emoji+nombre) por skill. Browser-safe.
- `lib/approvals.ts` (`server-only`) — núcleo: modelo `ApprovalRequest`, `approvals.json`, getUpdates, detección (título+miniatura), notas force-reply, resolución (vía `applyDecision`), re-lanzado, avisos de completados (llamada).
- `lib/decisions.ts` (`server-only`) — `applyDecision()` extraído de `/api/decisions` para reuso sin auto-HTTP.
- `lib/working-mode.ts` (`server-only`) — modo 'home'/'away' en disco.
- `lib/completion-notify.ts` (`server-only`) — avisos de jobs/subidas que acaban (solo 'away', baseline).
- `app/api/telegram/poll/route.ts` — tick del listener (getUpdates + enruta + detecta + completados).
- `app/api/approvals/route.ts` — GET lista / POST crea+manda (manual + tests + futura UI).
- `app/api/working-mode/route.ts` — GET/POST modo + aviso a Telegram al cambiar.
- `scripts/build-isolated.js` — build con `.claude` aislado + preload anti-NFT.
- `scripts/nft-skip-external-drives.js` — preload build-only (H:/ e Y: → ENOENT).

**Tocados**
- `lib/notify.ts` — helpers Bot API (2 bots: jarvis/approvals): `sendInlineMessage`, `sendInlinePhoto`, `sendForceReply`, `telegramGetUpdates/AnswerCallback/EditMessageText`, `getApprovalsChatId`, `sendApprovalsNotice`. `loadBotSecret` NO cae a jarvis para 'approvals'.
- `app/api/decisions/route.ts` — usa `applyDecision` (comportamiento idéntico).
- `electron/main.ts` — `startTelegramPoller` (4º poller, 3 s) + stop en teardown; `YTCP_DRIVE_H/Y` en el spawn standalone. *(OJO: este archivo también lo edita Pablo en paralelo — poller de huecos de calendario.)*
- `components/WorkingModeToggle.tsx` — sincroniza con `/api/working-mode` (server source of truth).
- `package.json` — `build:raw` + `build` por `build-isolated.js`; `dev:next` con `cross-env YTCP_DRIVE_*`.
- `lib/config.ts` — drives por env, fallback vacío en build (anti-NFT) + rama cliente. *(Editado a medias con Pablo.)*
- `next.config.mjs` — sin cambios netos (se probó `instrumentationHook`, revertido).

### 13.6 Datos en disco

```
~/.yt-content-pipeline/
├── approvals.json              # { version:1, offset, items: ApprovalRequest[] }
├── working-mode.json           # { mode: 'home'|'away', updatedAt }
├── notified-completions.json   # { ids: [...] }  (avisos de completados ya mandados)
├── queue.json / scheduled-uploads.json   # (existen; los LEE completion-notify)
~/.claude/secrets/ytcp-approvals-bot.json # { token, chat_id }  (bot dedicado)
<videoFolder>/_PACKAGING/packaging.md     # "PENDIENTE…" ↔ "✅ ELEGIDO" + decisions/<ts>.md
<videoFolder>/_PACKAGING/MINIATURAS/.selected-thumb  # miniatura elegida (al aprobar)
```

### 13.7 Cómo correr / probar

1. **Cerrar el `.exe` v0.6.0** (si no, dos apps Electron con sus pollers).
2. `npm run dev` (Next + Electron). Esperar la ventana + `✓ Ready`.
3. Toggle "En el PC/Fuera": al pulsar, llega aviso a Telegram. "Fuera" añade avisos de completados.
4. Las decisiones de título/miniatura pendientes en `packaging.md` llegan solas; respondes desde el móvil; se procesan en ~3 s (poller de Electron).
- Kill-switch del poller: `YTCP_TELEGRAM_POLLER_ENABLED=0`. Override bot: `YTCP_APPROVALS_BOT_SECRET`.

### 13.8 Pendiente / siguiente

- **Compilar `.exe` nuevo** (`npm run dist`, build verde) para tenerlo instalado sin la terminal. El v0.6.0 nunca tendrá esto.
- Poller **headless/web-only** (sin Electron) — mejora futura.
- Decisiones `choice` (varias opciones), fecha de publicación; multi-canal/destinatarios.
- Nota de contexto: la memoria `change_overnight_2026-05-31_build_mcp` apuntaba a un spawn roto en `claude-jobs.ts`; en esta sesión los jobs de reanudación **sí** produjeron salida (no afectó), pero confírmalo si retomas producción.
