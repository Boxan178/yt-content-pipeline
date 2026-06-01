# BUGS VISUALES — Registro 2026-06-01

> Auditoría visual exhaustiva de **todas** las features de la app (kanban, detalle de
> vídeo, calendario, lab, automator, aprobaciones Telegram, subidas, sleep-stories,
> shell/gamificación). Cada entrada es un defecto **visual / de UX** real, con
> evidencia y fix sugerido. **Estos NO se han tocado** — quedan registrados para que
> Pablo decida cuáles arreglar (algunos implican criterio de diseño / z-index que
> conviene ver en pantalla).
>
> Los **bugs FUNCIONALES** detectados en la misma pasada **sí se arreglaron** (29
> archivos, `tsc --noEmit` verde). Ver el resumen al final de este documento.
>
> Tema base para juzgar: dark glass-morphism (`#14161e`, accent gold `#c9a96a`,
> `color-scheme: dark`). Lab usa magenta; Automator usa rojo (ambos intencionados).
> Nº de línea = aproximado (puede haber drift); la cita de código ancla el sitio.

## Resumen por severidad

| Sev | Nº | Dónde duele más |
|-----|----|-----------------|
| 🟠 MEDIUM | 11 | Modales `absolute` en vez de `fixed`, paneles que aparecen fuera de viewport, plural roto, overflow de títulos, hora equivocada en programados |
| 🟡 LOW | 18 | Scroll-lock/escape ausentes, flicker de drag, estados vacíos/placeholders, copys, índices de progreso inconsistentes |

**Quick wins** (1 línea, 0 criterio de diseño): V-APR-1 (`1 pendientes`), V-AUT-5 (`GenAlPro`), V-SLP-1 (pill sin mapear).

---

## 1. Shell global (sidebar, topbar, chat dock, toasts)

### V-SHELL-1 · 🟠 MEDIUM · LevelUpToast se solapa con el ChatDock y no limita ancho
- **Archivo:** `components/LevelUpToast.tsx:~91`
- **Qué se ve:** el toast está `fixed inset-x-0 ... items-center` (centrado en TODO el viewport), ignorando la sidebar (64px) y el ChatDock derecho (hasta ~720px). Con el chat abierto el toast queda descentrado y su borde derecho puede meterse bajo/encima del dock. Las tarjetas no tienen `max-w-*`, así que una descripción larga de logro crea una tarjeta gigantesca.
- **Evidencia:** `<div className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex flex-col items-center gap-2 px-4">`
- **Fix:** acotar la tarjeta (`max-w-md`) y/o centrar respecto a la columna central (offset por el ancho del dock cuando está abierto).

### V-SHELL-2 · 🟡 LOW · AvatarBadge muestra el sprite del nivel anterior durante la transición
- **Archivo:** `components/AvatarBadge.tsx:~17,48-58`
- **Qué se ve:** `imgOk` solo se pone `true` en `onLoad` y `false` en `onError`; al cambiar `lv.level` el `src` cambia pero `imgOk` sigue `true`, así que se ve el avatar del nivel previo hasta que carga el nuevo (o un swap si el fallback resuelve otro sprite).
- **Evidencia:** `<img src={lv ? \`/api/avatar?level=${lv.level}\` : '/api/avatar'} ... onLoad={() => setImgOk(true)} ... className={... imgOk ? 'opacity-100' : 'opacity-0'} />` — `imgOk` no se resetea al cambiar de nivel.
- **Fix:** `useEffect(() => setImgOk(false), [lv?.level])`, o `key` el `<img>` por nivel para que React lo remonte.

### V-SHELL-3 · 🟡 LOW · ChatDock renderiza abierto en SSR y se colapsa al hidratar (layout flash)
- **Archivo:** `components/ChatDock.tsx:~56,70-80`
- **Qué se ve:** estado inicial `open=true`; el HTML del server siempre pinta el dock ancho (~520px). Al montar, `localStorage` (`ytcp:chat:open === '0'`) lo colapsa. Quien lo tiene cerrado ve el dock ancho pintarse y dar un tirón al cerrarse en cada carga.
- **Evidencia:** `const [open, setOpen] = useState<boolean>(true);` … luego `if (localStorage.getItem(STORAGE_KEY_OPEN) === '0') setOpen(false);` en un efecto de montaje.
- **Fix:** diferir el cuerpo del dock hasta leer localStorage (placeholder de ancho fijo pre-hidratación) o un flag `hydrated`.

### V-SHELL-4 · 🟡 LOW · La página /notifications usa hora absoluta; la campanita usa relativa
- **Archivo:** `app/notifications/page.tsx:~97`
- **Qué se ve:** inconsistencia: el dropdown (`NotificationBell`) muestra "hace 3 min"; la página completa muestra `toLocaleString('es-ES')`.
- **Evidencia:** `{new Date(n.createdAt).toLocaleString('es-ES')}` vs `relTime(n.createdAt)`.
- **Fix:** reutilizar `relTime` para el display principal y dejar la hora absoluta en un `title`.

---

## 2. Kanban de canales + detalle de vídeo

### V-KAN-1 · 🟠 MEDIUM · La miniatura de la card queda obsoleta hasta 60s tras elegir otra
- **Archivo:** `app/api/channels/[channel]/videos/[video]/thumbnail/route.ts:~101` + `components/VideoCard.tsx:131-137`
- **Qué se ve:** el `<img>` de la card usa la URL estable `…/thumbnail` (sin cache-buster) y la ruta sirve `Cache-Control: max-age=60`. Tras marcar otra miniatura como "elegida" en el modal, la card sigue mostrando la vieja hasta 60s.
- **Evidencia:** header `'Cache-Control': 'public, max-age=60, ...'`; card `src={video.thumbnailUrl}` sin query param.
- **Fix:** añadir `?v=${mtime|nombre}` al construir `thumbnailUrl`, o bajar el max-age de ese endpoint.

### V-KAN-2 · 🟠 MEDIUM · VideoDetailModal es `absolute` (no `fixed`): el backdrop no cubre el viewport ni sigue el scroll
- **Archivo:** `components/VideoDetailModal.tsx:~127` + `app/layout.tsx:56-61`
- **Qué se ve:** la raíz del modal es `absolute inset-0` y su ancestro posicionado es el panel `relative ... overflow-auto` del layout. El dim/blur cubre solo el panel central (sidebar, topbar y chat dock siguen visibles/clicables) y, con la página scrolleada, el modal se ancla arriba del panel en vez de al viewport.
- **Evidencia:** `className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"`.
- **Fix:** usar `fixed inset-0` con z alto (por encima de dock/topbar) y/o bloquear el scroll del body mientras está abierto.

### V-KAN-3 · 🟡 LOW · El modal de detalle no bloquea el scroll del fondo
- **Archivo:** `components/VideoDetailModal.tsx:~127` (efecto en `85-91`)
- **Qué se ve:** con el modal abierto, la rueda/trackpad scrollea el kanban de debajo (no hay scroll-lock). Combinado con V-KAN-2, el fondo se mueve tras el modal.
- **Fix:** poner `overflow:hidden` en body/contenedor de scroll al montar y restaurar al desmontar.

### V-KAN-4 · 🟡 LOW · Mensaje de error del checklist se desborda sin wrap
- **Archivo:** `components/ChecklistItemRow.tsx:~253-257`
- **Qué se ve:** `startError` va en un `<p className="text-[10px] text-red-300">` sin `break-words`; un error largo (un path, un body HTTP) se sale del ancho de la columna derecha.
- **Evidencia:** `<p className="text-[10px] text-red-300">{startError}</p>` (compárese con `ClaudeRunButton` que usa `whitespace-pre-wrap break-words`).
- **Fix:** añadir `break-words` (y opcional `whitespace-pre-wrap`).

### V-KAN-5 · 🟡 LOW · Badge de recopilación muestra `📚 recop · ? hist` si el JSON falla
- **Archivo:** `components/VideoCard.tsx:~144` + `app/api/channels/[channel]/videos/route.ts:142-150`
- **Qué se ve:** si `_PACKAGING/compilation.json` existe pero es ilegible, `isCompilation=true` pero `compilationSources` queda `undefined` → la card pinta un literal `?`.
- **Evidencia:** card `` `📚 recop · ${video.compilationSources ?? '?'} hist` ``.
- **Fix:** fallback a una etiqueta neutra (`📚 recop`) cuando no se sabe el conteo.

---

## 3. Jobs / cola

### V-JOB-1 · 🟠 MEDIUM · BulkEnqueueModal es `absolute` sin padre posicionado: el backdrop se confina a la columna centrada y scrollea
- **Archivo:** `components/BulkEnqueueModal.tsx:~191`
- **Qué se ve:** raíz `absolute inset-0 z-50 ...` dentro de `<main className="mx-auto max-w-[1600px] ...">` (estático). En viewports anchos el oscurecido se confina al `max-w-[1600px]` (los laterales quedan sin cubrir) y el overlay scrollea con la página. Los modales hermanos (`ExploreIdeasModal`, `StartIdeasQueueModal`) sí usan `fixed inset-0`.
- **Evidencia:** `<div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-6">`.
- **Fix:** cambiar `absolute` → `fixed` en la raíz (igual que los otros modales).

### V-JOB-2 · 🟡 LOW · BulkEnqueueModal no cierra al clicar fuera ni bloquea scroll (incoherente con los hermanos)
- **Archivo:** `components/BulkEnqueueModal.tsx:~191-192`
- **Qué se ve:** escucha Escape, pero el backdrop no tiene `onClick={onClose}` ni el card interno `stopPropagation`, así que clicar fuera no lo cierra (los otros dos modales sí).
- **Fix:** `onClick={onClose}` en el backdrop + `onClick={e=>e.stopPropagation()}` en el card.

### V-JOB-3 · 🟡 LOW · Las flechas de reordenar la cola se muestran para movimientos que el server rechaza
- **Archivo:** `app/queue/page.tsx:~212-231`
- **Qué se ve:** flechas ▲▼ se pintan por índice global (`idx>0`, `idx<len-1`), pero `moveItem` solo intercambia si ambos vecinos son `pending`. Un pending justo debajo de un `running` muestra flecha ▲ que al clicar da 400 (tragado) y la fila no se mueve → parece roto.
- **Fix:** calcular la movilidad desde los vecinos `pending` (deshabilitar/ocultar la flecha cuando el vecino no es pending).

---

## 4. Calendario editorial

### V-CAL-1 · 🟠 MEDIUM · El panel de detalle aparece fuera de pantalla / debajo del fold (sin overlay, sin scroll)
- **Archivo:** `app/calendar/page.tsx:~370-378` (`DetailPanel` en `~725`)
- **Qué se ve:** `DetailPanel` se renderiza inline al final del flujo (`<div className="glass mt-4 ...">`), no como overlay. Al clicar un evento abajo de una rejilla de 6 filas, el panel aparece muy por debajo del fold sin auto-scroll → parece que no pasó nada. (El `PlanModal` sí es overlay `fixed z-50`, de ahí la incoherencia.)
- **Fix:** `scrollIntoView` al abrir, o renderizar `DetailPanel` como overlay fijo como `PlanModal`.

### V-CAL-2 · 🟡 LOW · La última semana del mes queda sin celdas de relleno (borde inferior dentado)
- **Archivo:** `components/calendar/MonthGrid.tsx:~89-165`
- **Qué se ve:** solo se pintan celdas vacías iniciales (`firstDayOffset`); no hay celdas finales. En meses cuyo último día no cae en domingo, la fila final queda con hueco a la derecha sin caja bordeada → el borde inferior de la rejilla se ve irregular contra el glass.
- **Fix:** `trailing = (7 - ((firstDayOffset + daysInMonth) % 7)) % 7` y pintar esas celdas de relleno con el mismo estilo que las iniciales.

### V-CAL-3 · 🟡 LOW · El highlight de drag-over parpadea al pasar sobre los chips de evento
- **Archivo:** `components/calendar/MonthGrid.tsx:~103-105`
- **Qué se ve:** `onDragLeave` limpia `dragOverDay` cuando el puntero entra en un chip hijo (el dragleave salta en fronteras de hijos). Movimiento rápido sobre un día con varios chips → parpadeo del borde gold de drag-over.
- **Evidencia:** `onDragLeave={() => setDragOverDay((d) => (d === day ? null : d))}` con `<button>` chips dentro de la celda.
- **Fix:** `pointer-events-none` en los chips durante el drag, o comparar `e.relatedTarget` con `e.currentTarget.contains(...)` antes de limpiar.

---

## 5. Lab (magenta)

### V-LAB-1 · 🟠 MEDIUM · `pill-active` inyecta un punto verde duplicado (dos puntos / pill descuadrada)
- **Archivo:** `components/lab/StyleEngineJobView.tsx:~142-148`, `components/lab/ResearchPanel.tsx:~524-528`
- **Qué se ve:** el pill `done` es `<span className="pill-active"><span …bg-green-400 />done</span>`. La clase `.pill-active` ya ES un pill completo (inline-flex + gap + bg/borde/glow verde); añadirle un punto hijo da un segundo indicador verde y espaciado desigual respecto a los pills running/failed (que están hechos a mano).
- **Evidencia:** `<span className="pill-active"><span className="h-1.5 w-1.5 rounded-full bg-green-400" />done</span>` con `.pill-active { display:inline-flex; gap:.375rem; … }` en `globals.css:286`.
- **Fix:** usar un span inline-flex manual con un solo punto (como running/failed), o quitar el punto hijo (la `.pill-active` ya es el pill entero).

### V-LAB-2 · 🟠 MEDIUM · Indicador de progreso incoherente: la card marca el paso actual como "hecho"; el wizard como "actual"
- **Archivo:** `components/lab/ChannelDraftCard.tsx:~72-79` vs `components/lab/WizardProgress.tsx:~36-37`
- **Qué se ve:** la card rellena con `n <= draft.currentStep ? 'seg-done' : 'seg-empty'` (marca el paso actual como completo, en gold), mientras `WizardProgress` usa `n < current` para "hecho" y un estilo distinto para "actual". Las dos vistas del mismo draft discrepan en cuántos pasos hay completos, y la card usa el gold `seg-done` en vez del magenta de Lab.
- **Fix:** usar `n < draft.currentStep` para "hecho" en la card (+ estilo de "actual"), y/o recolorear a magenta dentro de Lab.

### V-LAB-3 · 🟡 LOW · "Siguiente" navega vía `<Link href="#">` → salto de hash / scroll-to-top
- **Archivo:** `components/lab/WizardStepLayout.tsx:~117-120` (usado desde `DraftWizard` con `nextHref={hasAnalysis ? '#' : null}`)
- **Qué se ve:** pasos 2-4 pasan `nextHref="#"` y delegan en `onNext` (router.push). El `<Link href="#" onClick={onNext}>` ejecuta `onNext` Y la navegación por defecto a `#` (scroll arriba + entrada `#` en el historial). Salto visible y entrada basura en historial en cada "Siguiente".
- **Fix:** botón `<button onClick={onNext}>` cuando la navegación es programática, o `e.preventDefault()` en `onNext`, o pasar el `stepHref` real.

### V-LAB-4 · 🟡 LOW · "Siguiente" no se deshabilita durante el `router.push` (doble-avance)
- **Archivo:** `components/lab/WizardStepLayout.tsx:~117-139`
- **Qué se ve:** doble click rápido dispara `onNext` dos veces → entradas duplicadas en historial / desincronización momentánea del `step`.
- **Fix:** flag transitorio de navegación que deshabilite el link.

### V-LAB-5 · 🟡 LOW · Step 5 (bootstrap) no ofrece re-lanzar el state-engine una vez parseado
- **Archivo:** `app/lab/drafts/[draftId]/DraftWizard.tsx:~701-718`
- **Qué se ve:** a diferencia de los pasos 2-4, el paso 5 no tiene botón "re-lanzar"; si las propuestas son malas, la única salida es recargar.
- **Fix:** añadir un botón "Re-lanzar state-engine" que resetee `parsed`/`jobId` y llame a `launch()`.

> Nota: el "no había indicador de carga al re-lanzar" (pasos 2-4) **se ha resuelto** como parte del fix funcional del re-lanzamiento invisible (ahora el `StyleEngineJobView` se muestra durante el re-lanzamiento).

---

## 6. Automator (rojo)

### V-AUT-1 · 🟠 MEDIUM · El botón "Reintentar/Regenerar" por escena no se deshabilita durante un run
- **Archivo:** `app/automator/components/SceneCard.tsx:~120-135` (desde `page-client.tsx:578`)
- **Qué se ve:** el botón de retry/regenerate está siempre clicable; `handleRetry` hace `if (isRunning) return;`, así que durante una producción completa el botón parece activo pero no hace nada → control muerto silencioso.
- **Fix:** pasar `disabled={isRunning}` a `SceneCard`/`IconButton`.

### V-AUT-2 · 🟡 LOW · Los modales no bloquean scroll ni cierran con Escape
- **Archivo:** `app/automator/components/ProviderModal.tsx:~166-174`, `app/automator/components/FormatsHelper.tsx:~65-73`
- **Qué se ve:** ambos son overlays `fixed inset-0` pero sin listener de Escape ni `overflow:hidden` en body; con la terminal/dock a la derecha, scrollear con un modal abierto mueve la página de fondo y Escape no cierra.
- **Fix:** `useEffect` con Escape→`onClose` + `document.body.style.overflow='hidden'` mientras `open`.

### V-AUT-3 · 🟡 LOW · La selección de proveedor en el modal es no-op (el modal usa `selectedProvider="kie"` hardcodeado)
- **Archivo:** `app/automator/components/ProviderModal.tsx:~212-217` vs `page-client.tsx:~919,928`
- **Qué se ve:** el modal pinta radios de proveedor y llama a `onSelectProvider?.(p.id)`, pero page-client nunca pasa `onSelectProvider` y fija `selectedProvider="kie"`. Hoy solo KIE está `enabled`, así que el highlight nunca se mueve; los radios se presentan como interactivos pero no hacen nada.
- **Fix:** cablear `onSelectProvider` a estado real, o renderizar el proveedor como indicador estático mientras solo haya uno habilitado.

### V-AUT-4 · 🟡 LOW · Las stages de imagen/vídeo completadas solo tienen icono de descarga al hover, sin preview
- **Archivo:** `app/automator/components/StageCard.tsx:~116-156`
- **Qué se ve:** para `first_frame`/`video`/`last_frame` completadas hay `buildDownloadUrl(...)` válido pero solo se usa en un ancla de descarga `opacity-0 group-hover`. El resultado nunca se previsualiza inline → la vista de producción no confirma visualmente el resultado.
- **Fix:** renderizar un `<img>`/`<video>` thumbnail para stages visuales completadas (con `onError` al icono actual).

### V-AUT-5 · 🟡 LOW · Mojibake/typo en texto de UI: "GenAlPro" / "Promt" / "Animacion"
- **Archivo:** `app/automator/components/ProductionView.tsx:~200,219`, `app/automator/components/FormatsHelper.tsx:~25-26`
- **Qué se ve:** el Segmented de proveedor muestra `"GenAlPro"` (I mayúscula vs l minúscula, debería ser "GenAIPro") en las filas de imagen y vídeo; `FormatsHelper` muestra `"Promt:"` (typo de "Prompt"). Texto visible al usuario con errores en una UI en español.
- **Evidencia:** `{ value: "genaipro", label: "GenAlPro" }` (×2); `` `SECUENCIA 1\nPromt: ...` ``.
- **Fix:** corregir a `"GenAIPro"` y `Promt`→`Prompt` (la falta de acento en "Animacion" parece intencional para demostrar input sin tildes — verificar antes de tocar). **Quick win.**

---

## 7. Aprobaciones Telegram / decisiones de Pablo

### V-APR-1 · 🟠 MEDIUM · El badge dice "1 pendientes" (plural roto)
- **Archivo:** `components/PabloDecisionsPanel.tsx:~27`
- **Qué se ve:** con una sola decisión pendiente se lee "1 pendientes" (gramática incorrecta en el caso más común).
- **Evidencia:** `{decisions.length} pendientes`.
- **Fix:** `{decisions.length} {decisions.length === 1 ? 'pendiente' : 'pendientes'}`. **Quick win.**

### V-APR-2 · 🟠 MEDIUM · Títulos/recomendaciones largos se desbordan sin truncar
- **Archivo:** `components/PabloDecisionsPanel.tsx:~43-47`, `components/DecisionModal.tsx:~118,144`
- **Qué se ve:** los títulos de MARCOS son largos (40-70+ chars). En el panel `★ {d.recommendation}` y en el modal `<span className="flex-1">{opt}</span>` no tienen `break-words`/`line-clamp`; una cadena larga sin espacios desborda o ensancha la tarjeta.
- **Fix:** `break-words` (y opcional `line-clamp-2`) en esos nodos de texto.

### V-APR-3 · 🟠 MEDIUM · DecisionModal no bloquea scroll ni cierra al clicar fuera
- **Archivo:** `components/DecisionModal.tsx:~55-61,95-96`
- **Qué se ve:** abrir el modal no fija el scroll del body (la página de detrás scrollea bajo el overlay) y clicar el backdrop `bg-black/70` no cierra (solo la X o Esc), incoherente con la affordance que sugiere el oscurecido.
- **Fix:** `onMouseDown` en backdrop → `onClose` si el target es el backdrop + `overflow:hidden` en body mientras montado.

### V-APR-4 · 🟡 LOW · WorkingModeToggle muestra estado obsoleto si el POST falla
- **Archivo:** `components/WorkingModeToggle.tsx:~37-48`
- **Qué se ve:** `toggle` actualiza optimista `mode`+localStorage y hace POST con `.catch(()=>{})`. Si el server falla, la UI (y el cache) discrepan del server hasta el próximo montaje — Pablo cree estar "Fuera" recibiendo avisos cuando el backend sigue en "home".
- **Fix:** await de la respuesta; en `!r.ok` revertir `mode`/localStorage y mostrar un mini error.

### V-APR-5 · 🟡 LOW · Key de la lista de decisiones puede colisionar
- **Archivo:** `components/PabloDecisionsPanel.tsx:~34`
- **Qué se ve:** `key={\`${d.section}:${d.anchor}\`}` no es único si dos secciones comparten heading + ancla canónica idéntica → warning de React y posible mal-render al resolver una.
- **Fix:** anteponer el índice: `key={\`${i}:${d.section}:${d.anchor}\`}`.

---

## 8. Subidas / programados / sleep-stories

### V-SUB-1 · 🟠 MEDIUM · La cola de programados muestra la hora EQUIVOCADA para subidas con programación nativa
- **Archivo:** `app/scheduled/page.tsx:~8-22,128-129`
- **Qué se ve:** para uploads con `publishAt` (programación nativa de YouTube), la fila muestra `scheduledFor` — que auto-publish/la página de subida ponen a ~ahora (es cuando se *sube* el fichero), no cuándo se hace público. Un vídeo programado para el sábado muestra "Programado para: [hoy, en 0 min]". El campo `publishAt` ni siquiera está en la interfaz `ScheduledItem`.
- **Evidencia:** la interfaz omite `publishAt`; render `Programado para: {new Date(it.scheduledFor)...} ({tilLabel(it.scheduledFor)})`.
- **Fix:** añadir `publishAt` a la interfaz y, si está, mostrarlo como hora de publicación ("Sale público: …") distinta de la hora de subida.

### V-SUB-2 · 🟡 LOW · La pantalla de éxito de subida dice "Programado" también para subidas inmediatas
- **Archivo:** `app/upload/page.tsx:~252-262,98`
- **Qué se ve:** tras "⚡ Subir ya" (inmediato, sin `publishAt`), la vista de éxito sigue mostrando el título "Programado" y "Te llevamos a la cola de programados…". Copy incorrecto para la ruta inmediata.
- **Fix:** ramificar el título/copy según `scheduleMode === 'now'`.

### V-SUB-3 · 🟡 LOW · La lista de programados pinta un "Ver chat →" muerto del motor de jobs deprecado
- **Archivo:** `app/scheduled/page.tsx:~19,146-153`
- **Qué se ve:** `jobId` es `@deprecated` (el motor actual lanza `upload.py`, no setea jobId). Filas legacy con `jobId` muestran un "Ver chat →" a `/jobs/{jobId}` inexistente.
- **Fix:** quitar el bloque del link (el motor ya no produce jobs) o gatearlo a un job válido conocido.

### V-SLP-1 · 🟡 LOW · Pill de estado sin mapear → pill transparente/sin texto en sleep-stories
- **Archivo:** `app/sleep-stories/page.tsx:~53,192-194`
- **Qué se ve:** la API enumera todos los `stateFolders` del canal, que pueden incluir estados fuera de `STATE_PILL`/`STATE_LABEL` (solo cubren 5). El pill renderiza `className="absolute top-2 right-2 undefined"` (sin fondo/borde) y label `undefined` → pill vacío.
- **Evidencia:** `<span className={\`absolute top-2 right-2 ${STATE_PILL[s.state]}\`}>{STATE_LABEL[s.state]}</span>`.
- **Fix:** `${STATE_PILL[s.state] ?? 'pill-soon'}` y `{STATE_LABEL[s.state] ?? s.state}`. **Quick win.**

### V-SLP-2 · 🟡 LOW · `<img onError>` oculta miniaturas rotas sin placeholder
- **Archivo:** `app/sleep-stories/page.tsx:~180-182`
- **Qué se ve:** al fallar una miniatura, `onError` pone `display:none` y deja la caja `bg-black/30` vacía; el icono-luna de fallback solo aparece cuando `thumbnailUrl` es null, no cuando da error.
- **Fix:** en error, cambiar al placeholder (estado por card) en vez de solo ocultar.

### V-SUB-4 · 🟡 LOW · El selector de privacidad sigue interactivo pero se ignora en modo "Programar"
- **Archivo:** `app/upload/page.tsx:~327-353,219`
- **Qué se ve:** en "📅 Programar" la privacidad se fuerza a `public` al enviar (hay nota), pero los tres botones siguen clicables — el usuario puede seleccionar "🔒 Privado", verlo resaltado, y se ignora silenciosamente.
- **Fix:** deshabilitar/atenuar el grupo (o forzar highlight en Público) mientras `scheduleMode === 'scheduled'`.

---

## Bugs FUNCIONALES arreglados en esta misma pasada (referencia)

Estos **sí** se tocaron (verificado `tsc --noEmit` verde). No son visuales — se listan para el registro:

1. **SSE de jobs filtraba timers** (`stream/route.ts`): `heartbeat`+`deadline` no se limpiaban en `cancel()` → timer de 30 min vivo por cada conexión desconectada. Hoisted + limpiados.
2. **Notificaciones/XP de fin de job no se disparaban por SSE** (`ClaudeRunButton.tsx`): la lógica vivía solo en el polling (que no corre con SSE, el transporte por defecto). Extraída a `notifyJobTransition`, llamada en ambos caminos.
3. **Subida DUPLICADA a YouTube** (`auto-publish.ts`): `runAutoPublishTick` sin guard de reentrada → dos pollers podían encolar el mismo vídeo. Añadido mutex de proceso.
4. **Doble conteo de huecos** (`calendar-gaps.ts`): un planificado que ya es subida se contaba dos veces → huecos reales ocultos. Dedup por carpeta (igual que `/api/calendar`).
5. **Re-lanzar análisis/visual/validación en Lab era invisible y descartaba resultados** (`DraftWizard.tsx`): las ramas de resultados tapaban el `JobView`. Gateadas con `!jobId` + `setJobId(null)` tras persistir.
6. **ResearchPanel bloqueaba el 2º research para siempre** (`ResearchPanel.tsx`): `jobId` no se limpiaba → botón deshabilitado eternamente. Añadido estado `jobRunning` liberado al terminar.
7. **Pantalla en blanco en historial/proyectos del automator** (`*page-client.tsx`): `fetch` sin `.catch` → ninguna rama de render casaba. Añadido catch con estado de error.
8. **Notas de rechazo Telegram podían resolver la decisión EQUIVOCADA** (`approvals.ts`): el fallback casaba cualquier solicitud esperando notas. Ahora solo si hay exactamente una.
9. **`optionsFile` casaba cualquier `.md`** (`parse-pablo-decisions.ts`): incluía `packaging.md` → opciones basura. Restringido a referencia con pista + exclusiones.
10. **Notion poller tope silencioso de 25 filas** (`notion-poller.ts`): filas 26+ nunca procesadas. Añadida paginación (`has_more`/`next_cursor`, page_size 100).
11. **Rango HTTP sufijo `bytes=-N`** (`media/route.ts`): devolvía desde el principio en vez de los últimos N bytes.
12. **Crash si `seen-states.json` no es objeto** (`seen-states.ts`): `JSON.parse(null/array)` rompía `map[folder]`. Validación de forma.
13. **`settings` aceptaba `pollIntervalMs=0`/NaN** (`settings.ts`): bucle de polling caliente. Clamp [5s, 300s] + saneo de tipos.
14. **Logros/niveles en cascada diferidos un evento** (`gamification.ts`): bonus de XP que sube nivel no re-checaba logros. Iteración a punto fijo.
15. **`relaunchSara` perdía `effort` (y modelo)** (`job-queue.ts`): los turnos de continuación caían al default.
16. **`upsertCadence` reseteaba `hour` a 12** (`channel-cadence.ts`): full-replace en vez de merge.
17. **`ThumbnailsPanel` re-fetch en cada render** (`ThumbnailsPanel.tsx`): efecto dependía de un string recreado cada render.
18. **first-video: `chosenName` sin sanear en path de FS** (`first-video/route.ts`): añadido guard `isSafePathSegment` (traversal).
19. **`/api/chats/[sessionId]` sin validar el segmento** (defensa en profundidad): añadido `isSafePathSegment`.
20. **`run`/`regenerate` proxy sin try/catch** (`run`, `regenerate` routes): backend caído → 500 sin manejar. Ahora 502 limpio.
21. **`extractMetadata` estrategia tabla #2 sin piso de longitud** (`extract-metadata.ts`): celda casi vacía pasaba como título.
22. **`/api/uploads` no validaba `privacyOnPublish`** contra el enum.
23. **Paneles del calendario obsoletos** (`calendar/page.tsx`): `createPlanned`/`startPipeline` no refrescaban backlog/gaps.
24. **`api_end` con código ≠ 0 se tragaba en el automator** (`page-client.tsx`): run fallido parecía idle. Añadida rama de error.
25. **Key de escena duplicable en ProductionView** (`ProductionView.tsx`): `key` compuesta con índice.

## Issue latente NO visual (a vigilar)

- **`app/api/lab/channels/[id]/first-video/route.ts` contiene un byte NUL** (git lo trata como binario; `git diff` no lo muestra). Está en la región del regex `sanitizeFolderName`, lo que impide editar esa línea con herramientas normales (por eso el fix cosmético del regex que se come espacios/guiones quedó pendiente). `tsc` lo tolera. **Recomendado:** reescribir el fichero limpio (sin el NUL) para recuperar diffs normales y de paso aplicar el fix del regex (`[<>:"/\\|?*]`, sin ` -`).
