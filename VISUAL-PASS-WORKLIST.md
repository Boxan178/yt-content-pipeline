# VISUAL PASS — Worklist (aplicar cuando el job termine) · 2026-06-02

> Plan de ejecución para la pasada visual nocturna autorizada por Pablo (aplicar
> SIN preguntar). Combina los 30 bugs visuales del registro (BUGS-VISUALES-2026-06-01.md)
> + ~45 net-new de la 2ª pasada. Agrupado POR ARCHIVO para aplicar de un tirón.
>
> Categorías: **[SAFE]** mecánico/bajo riesgo · **[CARE]** requiere cuidado (z-index,
> layout) · **[DEFER]** demasiado estructural/subjetivo para hacer a ciegas → se deja
> nota, no se aplica sin que Pablo lo vea.
>
> Verificación tras aplicar: `npx tsc --noEmit` (verde). NO arrancar dev server / NO
> matar node mientras haya jobs vivos.

## globals.css
- [SAFE] Añadir `.pill-err`, `.pill-timeout`, `.pill-blocked` con MISMAS métricas que `.pill-active`/`.pill-away` (font 11px, padding/gap iguales) para unificar tamaños de pill de estado.
- [SAFE] `prose-tg a` color `#d4af37` → token accent `#c9a96a` (coherencia gold).

## components/Sidebar.tsx
- [CARE] El logo "YT" tiene `nav-active` HARDCODEADO → siempre dorado con glow, compite con el item activo real. Darle estilo neutro propio (glass o gold estático SIN el glow/borde de selección).

## components/VideoCard.tsx
- [SAFE] Badge recop `? hist` → fallback neutro `📚 recop` cuando `compilationSources` es undefined.
- [CARE] `{!isWorking && video.scheduledUpload && …}` oculta el badge "programado/subiendo" cuando hay job → permitir coexistir (esquinas distintas) o no ocultar `uploading`.
- [SAFE] Placeholder "sin miniatura": `text-muted` sobre `bg` casi invisible → `text-zinc-500` + icono imagen.
- [SAFE] Chip "+N" jobs: `text-[9px]` → `text-[10px]` + `title` con labels de los jobs extra.
- [SAFE] `tracking-wider` → `tracking-label` en badges uppercase.

## components/VideoDetailModal.tsx
- [CARE] `absolute inset-0` → `fixed inset-0` (z alto sobre dock/topbar) + scroll-lock del body al montar.
- [SAFE] Header imprime `video.state` crudo (`pending_locution`) → mapear a etiqueta ES (diccionario compartido con el kanban).
- [CARE] Umbral "Subir": card dice incompleto <100% pero modal habilita a ≥80% → unificar lenguaje/umbral; mostrar `reason` visible cuando deshabilitado (no solo `title`).
- [CARE] Toast del modal (`fixed bottom-6 left-1/2`) vs toast de página (`right-6`) → unificar anclaje o suprimir uno.

## components/ProgressBar.tsx
- [SAFE] Hitos pendientes `text-muted/60` (ilegible) → `text-zinc-500`.

## components/ShortsGrid.tsx
- [CARE] Card legacy (`rounded-lg border-purple-500/20 bg-bg/60`, heading `tracking-wider text-muted`) → alinear a glass: `glass rounded-2xl`, heading `text-[11px] tracking-label text-zinc-500`.

## components/ChecklistItemRow.tsx
- [SAFE] `startError` `<p>` sin wrap → `break-words`.

## components/ClaudeRunButton.tsx
- [SAFE] variant `subtle` = `border-border bg-bg` (opaco sobre glass) → `border-white/10 bg-white/5 hover:bg-white/10`.
- [CARE] Botones emoji `📋 ✕ ↻` → SVG coherentes (SOLO si existen iconos reutilizables; si no, alinear tamaño/baseline). Si requiere crear iconos → DEFER.

## components/PabloDecisionsPanel.tsx
- [SAFE] `{n} pendientes` → singular/plural.
- [SAFE] `★ {recommendation}` y label largos → `break-words`.
- [SAFE] key `${section}:${anchor}` → anteponer índice.
- [SAFE] Diferenciar wording vs Checklist ("N decisiones" en vez de "N pendientes").

## components/DecisionModal.tsx
- [CARE] Sin scroll-lock ni click-outside ni Escape → añadir los tres.
- [SAFE] `<span className="flex-1">{opt}</span>` y `{itemText}` → `break-words`.
- [SAFE] `datetime-local` → `[color-scheme:dark]`.

## components/WorkingModeToggle.tsx
- [SAFE] Optimista sin revertir en `!r.ok` → await + revert + estado `busy` (deshabilitar durante POST).

## components/AvatarBadge.tsx
- [SAFE] Resetear `imgOk=false` en `useEffect([lv?.level])` (o key por nivel) para no mostrar sprite viejo.

## components/ChatDock.tsx
- [CARE] SSR abre el dock (open=true) y colapsa al hidratar → flag `hydrated` / placeholder de ancho fijo pre-hidratación.
- [CARE] Tokens legacy (`bg-panel`, `border-border`, `bg-bg`) → `.glass`/`.chat-sliver` + pestaña y controles a estilo glass. (Conservador: swap de tokens, NO rediseño de layout.)

## components/LevelUpToast.tsx
- [CARE] `fixed inset-x-0 items-center` (centrado en todo el viewport, ignora dock) + tarjetas sin `max-w` → `max-w-md` + acotar a la columna central.

## components/NotionPollerSection.tsx + NotionPollerBadge.tsx
- [SAFE] Unificar verde "ok": `bg-green-500` (section) vs `bg-emerald-500` (badge) → emerald en ambos.

## app/notifications/page.tsx
- [SAFE] Hora absoluta `toLocaleString` → `relTime` + `title` con la absoluta.

## app/queue/page.tsx
- [SAFE] Flechas reordenar visibles aunque el server rechace (vecino no pending) → calcular movilidad por vecino pending.
- [HIGH] Pills de estado: `failed`/`timeout`/`blocked` inline 10px vs `pill-away/active` 12px → usar las nuevas clases de globals.css.
- [HIGH] running: punto `bg-cyan-400` dentro de `pill-away` (sky) → punto `bg-sky-400`/`bg-current`.

## app/jobs/page.tsx + app/jobs/[jobId]/page.tsx
- [HIGH] Mismo problema de pills (tamaño + dos azules) → unificar con clases nuevas.

## app/page.tsx (home)
- [CARE] Progress placeholder hardcodeado 2/6 (dato falso) → ocultar barra hasta tener counts reales, o mostrar algo neutro.

## components/calendar/MonthGrid.tsx
- [SAFE] Sin celdas de relleno finales → `trailing = (7 - ((firstDayOffset+daysInMonth)%7))%7`.
- [SAFE] Drag-over flicker → chips `pointer-events-none` durante drag (o comparar relatedTarget).
- [CARE] `+N más` no interactivo y los items ocultos son inalcanzables → hacer la celda scrollable (max-h + overflow-y-auto) para no esconder ninguno (popover completo = DEFER).
- [SAFE] WEEKDAYS `['Lun','Mar','Mié'…]` vs cadence `['L','M','X'…]` → compartir constante de labels.

## app/calendar/page.tsx
- [CARE] `DetailPanel` inline puede quedar fuera de viewport → `scrollIntoView` al abrir.
- [SAFE] Checkbox cadencia + number input sin `accent-*` → `accent-[#c9a96a]` (gold).
- [SAFE] CadenceRow "Guardar" deshabilitado solo `opacity-40` → `disabled:cursor-not-allowed`.
- [CARE] PlanModal sin Escape ni focus trap → añadir keydown Escape + focus management.
- [SAFE] Backlog: hover inconsistente entre idea-card y video-card → unificar + glyph de arrastre.
- [SAFE] DetailPanel link YouTube solo `status==='done'` → mostrar si hay `youtubeVideoId` (label distinto si scheduled).

## components/lab/ChannelDraftCard.tsx
- [SAFE] `n <= currentStep` (marca actual como hecho) → `n < currentStep` (alinear con WizardProgress) + color magenta.
- [SAFE] `archived` usa `pill-soon` igual que `draft` → estilo distinto (opacidad baja / zinc) para archivado.

## components/lab/StyleEngineJobView.tsx + components/lab/ResearchPanel.tsx
- [SAFE] `<span className="pill-active"><span dot/>done</span>` doble punto → span inline-flex manual con un solo punto (o quitar el dot interno).

## components/lab/WizardStepLayout.tsx
- [CARE] "Siguiente" `<Link href="#" onClick>` → `<button onClick>` o `e.preventDefault()` (evitar salto de hash).
- [SAFE] Deshabilitar durante navegación (flag transitorio).

## components/lab/FirstVideoTimeline.tsx
- [SAFE] Círculos magenta 1-6 idénticos a badges de paso del wizard (parece 6º paso) → numerales neutros/zinc o forma distinta.

## components/lab/IdeasPanel.tsx + components/lab/ResearchPanel.tsx
- [SAFE] Empty states bare `<p>` → placeholder glass ligero (icono + línea) como el home de Lab.

## app/lab/drafts/[draftId]/DraftWizard.tsx
- [SAFE] `<pre>` de resumen B7 / stdout sin `break-words` → añadir (overflow horizontal con tokens largos).

## app/automator/components/ProductionView.tsx
- [SAFE] `"GenAlPro"` → `"GenAIPro"` (×2).
- [SAFE] `{estimatedCredits} credits` → `toLocaleString("es-ES")`; sufijo `€` condicionado a `estimatedEur != null` (evitar `€null`).
- [SAFE] "Proveedor de video"/"Modelo de video" → "vídeo".

## app/automator/components/FormatsHelper.tsx
- [SAFE] `Promt:` → `Prompt:`.
- [SAFE] `<pre>` con newline inicial → pegar `{s.body}` a la etiqueta o `.trim()`; header sticky `z-10`.

## app/automator/components/SceneCard.tsx
- [SAFE] Botón retry/regenerate sin `disabled={isRunning}` → pasarlo.
- [SAFE] `Scene {n}` → `Escena {n}`.

## app/automator/components/StageCard.tsx
- [SAFE] label `video: "Video"` → `"Vídeo"`.
- [CARE] Stages visuales completadas sin preview → `<img src={downloadUrl}>` con `onError` al icono. (Opcional; si parece arriesgado a ciegas → DEFER.)

## app/automator/components/ProviderModal.tsx
- [CARE] Sin scroll-lock/Escape → añadir.
- [DEFER] Radios de proveedor no-op (solo KIE enabled) → nota; no tocar.

## app/automator/components/JobsPanel.tsx
- [SAFE] StatCard `text-3xl` sin `nums` → añadir `nums` (tabular) + `text-2xl`.

## app/automator/page-client.tsx
- [SAFE] Dos "⚙ Configurar" idénticos → "Configurar imagen" / "Configurar vídeo".
- [CARE] Chip "Drive" verde-OK hardcodeado → neutro (sin color de éxito) o estado real.

## app/automator/historial/page-client.tsx + proyectos/page-client.tsx
- [SAFE] Barra de progreso ProjectCard `width:100%` fija (dato falso) → quitar o calcular real.
- [DEFER] Las dos páginas son casi idénticas (mismo endpoint, ProjectCard duplicada) → unificar = decisión estructural; nota.

## app/upload/page.tsx
- [SAFE] `text-muted` (#5a5a66, bajo contraste) → `text-zinc-400`/`zinc-500`.
- [SAFE] Pantalla éxito "Programado" para subida inmediata → ramificar copy por `scheduleMode`.
- [SAFE] Selector privacidad clicable pero ignorado al programar → deshabilitar/atenuar grupo.
- [CARE] Inputs/botones legacy (`bg-bg border-border`) → alinear a `.input-base`/glass (token swap, NO rediseño completo).

## app/scheduled/page.tsx
- [CARE] Muestra `scheduledFor` (hora de subida ≈ ahora) para programados nativos → añadir `publishAt` a la interfaz y mostrarlo ("Sale público: …").
- [SAFE] Link "Ver chat →" a `/jobs/{jobId}` muerto (engine deprecado) → quitar.

## app/sleep-stories/page.tsx
- [SAFE] Pill estado sin mapear → `${STATE_PILL[s.state] ?? 'pill-soon'}` + `{STATE_LABEL[s.state] ?? s.state}`.
- [SAFE] `<img onError>` solo oculta → cambiar a placeholder (icono luna) por card.
- [SAFE] `<select>` con `style` inline de fondo → quitar (dejar que `.glass` lo aporte).

---
## ✅ RESULTADO (aplicado 2026-06-02, madrugada, autónomo)

Se aplicaron **todos los [SAFE] y [CARE]** de las secciones por archivo de arriba,
**salvo** lo listado en "Pendiente" abajo. Verificación: **`npx tsc --noEmit` verde**.
`next lint` NO está configurado en el repo (no entra en `next build`, no bloquea).
NO arranqué el dev server (tu job de voz corría) — verificación = tsc + revisión de diffs.

**Aplicado (destacado):** logo sidebar de-gloweado · pills de estado unificadas (+ clases
nuevas `.pill-err/.pill-timeout/.pill-blocked` en globals.css) + punto sky en running ·
flechas de cola solo cuando el vecino es pending · VideoDetailModal `fixed`+scroll-lock+estado
en español+motivo "Subir" visible · ProgressBar y `text-muted` de Upload a contraste legible ·
ShortsGrid a glass · "N decisiones" plural + break-words + key · DecisionModal scroll-lock/
click-outside/datetime dark · home sin barra falsa 2/6 · calendar: celda scrollable (items ya
NO se ocultan), trailing cells, weekday unificado, accent en checkbox/number, scrollIntoView,
Escape en PlanModal, link YT para programados, hover backlog unificado · Lab: doble-punto del
pill `done`, empty states glass, FirstVideoTimeline numerales neutros, "Siguiente" como botón,
ChannelDraftCard progreso `< current`+archivado distinto · automator: GenAIPro, `€null` guard +
miles, "vídeo"/"Escena", retry deshabilitado en run, chip Drive neutro, "Configurar imagen/vídeo",
StatCard `nums`, FormatsHelper · scheduled: `publishAt` real ("Sale público")+link muerto fuera ·
sleep-stories: pill fallback + placeholder img + select · notifications: relTime · AvatarBadge
reset por nivel · WorkingModeToggle revert+busy · LevelUpToast acotado (no tapa dock) · NotionPoller
verde unificado · ChatDock: fix flash de hidratación + chrome a glass.

**Pendiente / DEFER (a propósito — necesitan tu ojo o decisión, NO se tocaron a ciegas):**
- **ClaudeRunButton** `📋 ✕ ↻` → SVG: no hay componentes de icono reutilizables en el repo; no se inventaron. (pendiente trivial)
- **StageCard** preview inline de stages completadas: el content-type del endpoint de descarga no está verificado para `<img>/<video>` → riesgo a ciegas.
- **ProviderModal** radios de proveedor (no-op): solo KIE habilitado → cosmético; sin tocar.
- **Upload**: NO se hizo el rediseño glass completo ni el swap a `.input-base` (esa clase lleva focus ROJO de Automator y Upload es gold → metería rojo). Sí: contraste, copy inmediato/programado, privacidad deshabilitada al programar.
- **Historial vs Proyectos** (automator): páginas casi idénticas → unificar es decisión estructural/routing; sin tocar.
- **ChatDock**: chrome migrado a glass + flash arreglado; los tokens internos del render de mensajes (ToolBlock) se dejaron por conservadurismo.
- **ChannelDraftCard** pill `bootstrapped`: mismo doble-punto que el fix de `done`; fuera de scope, igual.
- **UpdateToast** capas de z-index: minor; sin tocar.

**Sugerido al despertar:** `npm run dev` y un vistazo a: modal de detalle (que cubra todo), /calendar (celda con muchos items + arrastrar), /jobs y /queue (pills uniformes), chat dock (sin tirón al cargar). Todo SIN commitear — en working tree de `beta/v0.7.0`.
