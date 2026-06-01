# Prueba de fuego autónoma — 2026-06-01

Vídeo: **The One Sentence Epictetus...** (Moderni Stoici), de su 50% → publicación, con
aprobaciones por Telegram. Pablo fuera; Claude monitoriza + relay por Telegram.

## ✅ Lo que FUNCIONA (validado en vivo)

- **Telegram notif + botones + NOTAS (force_reply)**: probado end-to-end. Pablo recibió
  la aprobación de título, **rechazó con nota** ("The one phrase to silence everyone -
  STOICISM"), y el rechazo+notas se capturó y resolvió correctamente.
- **Detección automática de decisión**: con el ancla `PENDIENTE ELECCIÓN DE PABLO`, el
  poller de la app detectó la decisión y envió la aprobación sola (~30-60s).
- **Orquestación autónoma del equipo**: SARA encadenó MARCOS (títulos) → NORA (brief
  miniatura) → IRIS+Algrow (**miniatura generada**, 16:9, score 8.5/10) → MARCO AURELIO
  (guion v1) → **ELENA (auditoría)**.
- **Control de calidad real**: ELENA **rechazó el guion v1** con 3 bloqueadores legítimos
  (cita apócrifa atribuida a Epictetus, falta CTA/Moderni Stoici, open-loop prematuro) →
  guion vuelve a v2. El sistema NO deja pasar contenido malo.
- **MCP/Algrow**: la generación de imagen (miniatura) funcionó → el fix de MCP va.

## 🔴 GAPS encontrados (pendientes de arreglar para autonomía REAL — v0.7.2)

1. **Formato de detección de decisiones (`lib/parse-pablo-decisions.ts`)** — EL GORDO.
   `parsePabloDecisions` solo dispara con una línea `PENDIENTE ELECCIÓN DE PABLO` (regex
   `/pendiente\s+(elección|decisión|selección)\s+de\s+pablo/i`). Pero SARA escribe las
   decisiones de varias formas que NO matchea:
   - `## Decisión pendiente` (heading) + cuerpo "Pablo elige título final".
   - checkbox `- [ ] Título elegido (Pablo) — ⏳ PENDIENTE`.
   - miniatura: `**Notas:** ...Pendiente validación visual de Pablo.`
   → Hoy hubo que **añadir el ancla a mano** para que la aprobación de título y la de
   miniatura se disparen. **Fix**: o ampliar el detector (heading "Decisión pendiente" +
   checkboxes `(Pablo)` + regex más laxa "pendiente … de pablo"), o (mejor a largo plazo)
   que la skill SARA escriba SIEMPRE el ancla canónica. La opción robusta: ampliar el
   detector — y que `applyDecision` ya soporta el caso checkbox, así que encaja.

2. **Dedupe no se limpia tras rechazo (`lib/approvals.ts` detectAndSend, ~L339)** — audit #5.
   El set `existing` incluye los `answered`. Tras un rechazo, SARA re-propone con el MISMO
   ancla → `dedupeKey(folder, anchor)` colisiona → el re-envío se BLOQUEA (Pablo no recibe
   la v2). **Fix**: excluir `answered + choice==='rejected'` del set `existing`.
   (Hoy se destrabó aplicando el título elegido a mano.)

3. **Miniatura: aprobación con imagen no se dispara** — mismo gap de formato (#1). La
   miniatura está generada pero "Pendiente validación visual de Pablo" no es detectable.
   El MVP soporta `sendPhoto`; falta que el detector pille el formato de NORA/IRIS.

4. **Cola ↔ resume (telegram launchResume vs loopUntilComplete)** — audit Agente3 #7.
   El re-lanzado por Telegram (`launchResume`) es UN turno; el bucle de completar lo lleva
   la cola. Si ambos activos → dos SARA a la vez. Hoy se evitó fijando el título directo
   (sin launchResume) + reactivando la cola. **Fix**: que la resolución de Telegram
   reanude la cola (estado `awaiting-decision` → `pending`) en vez de spawnear suelto.

## Veredicto provisional

La **infraestructura** (Telegram, orquestación, calidad, MCP) FUNCIONA. Lo que falla es la
**costura** entre lo que escriben las skills y lo que detecta/reanuda la app (gaps 1-4).
Con esos 4 fixes (v0.7.2) la producción autónoma desatendida debería ir limpia. Hoy se
valida shepherdeando a mano los gates.

## 🆕 GAP 5 (importante) — generación visual INNECESARIA en canales estoicos

Los canales de estoicismo (Moderni Stoici, Moderno Estoico, The Sleeping Stoic) tienen
**BIBLIOTECA DE BRUTOS COMPARTIDA** (`H:/YOUTUBE/CANALES ESTOICISMO/MODERNI STOICI/Biblioteca
de Brutos`, **149 clips, ~1.3 GB**). La skill SARA generó imágenes por escena (IRIS, 10) +
intentó generar clips de vídeo (CIRO → Algrow Sora-2 → timeout → "hazlo en Flow") →
**INNECESARIO** + bloqueó el pipeline en un paso manual de Flow que no hacía falta.

**Fix (skill SARA, en J.A.R.V.I.S. — NO en este repo):** detectar canal con
`sharedBrutosLibrary` y **SALTAR la fase visual de generación** (IRIS scenes + CIRO videos)
→ ir directo a **LUÍS render** con los brutos compartidos + audio + guion. El app ya expone
`channel.sharedBrutosLibrary` y el progreso usa `sharedBrutosAvailable`; la skill debe
consumirlo para ramificar. (Sí tiene sentido generar visual por escena en canales SIN
biblioteca: sleep-stories nuevas, lab, etc.)

Hoy se destrabó editando el packaging (marcar brutos compartidos + LUÍS listo) + reactivando
la cola → render directo.
