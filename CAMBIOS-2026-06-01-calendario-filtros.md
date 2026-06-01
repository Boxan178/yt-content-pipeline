# Cambios 2026-06-01 — Filtros del calendario de contenidos

> Entrada de changelog para la **update grande de hoy**. Self-contained: pégalo o
> referencia desde el doc consolidado de la release (v0.7.2). Trabajado en sesión
> aparte; el resto de bugs de la jornada van documentados en
> `PRUEBA-FUEGO-2026-06-01.md` (gaps de pipeline/skills) — esto es independiente y
> es UI pura del módulo `/calendar`.

- **Ámbito:** `app/calendar/page.tsx` (frontend, sin tocar API ni backend).
- **Commit:** `555a2c5` en rama `beta/v0.7.0` — *"fix(calendar): aplicar filtro de
  canal al backlog + filtro por estado desplegable"*.
- **Build:** `.exe` 0.7.1 regenerados con el fix dentro
  (`release/YT Content Pipeline-Setup-0.7.1.exe` + `…-Portable-0.7.1.exe`).
- **Riesgo:** bajo. Cambio aislado a un componente client; `tsc --noEmit` limpio.
- **Verificación visual:** ⏳ pendiente (build OK + typecheck OK; no arrancada la app).

---

## El bug (reportado por Pablo)

En `/calendar`, al pulsar un chip de canal (p. ej. "Moderni Stoici") el **backlog**
de la barra lateral (Ideas + Vídeos listos) **seguía mostrando ideas de todos los
canales**. No se podía aislar el contenido de un canal concreto.

## Causa raíz (eran dos cosas)

1. **El filtro de canal no se aplicaba al backlog.** `channelFilter` solo filtraba
   `filtered` → la rejilla del mes (`MonthGrid`). Las listas `ideas` y `readyVideos`
   de la barra lateral se renderizaban **sin filtrar**.
2. **Los chips de canal se derivaban solo de los items del calendario.**
   `channelsPresent` se construía a partir de `items` (subidas/planificados). Un
   canal con ideas en el banco pero **sin nada en el calendario** (p. ej. *Drowsy
   Tales*) **ni siquiera tenía chip** → era imposible filtrar por él. Por eso en la
   captura del bug las ideas eran de *Drowsy Tales* pero el único chip era *Moderni
   Stoici*.

## Qué se cambió

- **Chips de canal desde la unión de fuentes:** `channelsPresent` ahora se deriva de
  calendario **+ banco de ideas + vídeos listos**. Aparecen todos los canales con
  cualquier contenido (resuelve nombre/color vía `getChannel()` / `channelColor()`).
- **Backlog filtrado por canal:** al seleccionar un canal arriba, el backlog muestra
  solo ideas (`idea.channelId === channelFilter`) y vídeos (`v.channel ===
  channelFilter`) de ese canal. El subtítulo del backlog indica el canal activo.
- **Nuevo `BacklogPanel` con secciones desplegables por estado:** las ideas se
  agrupan por su `IdeaStatus` (`raw` → "Ideas", `developing` → "En desarrollo",
  `in-production` → "En producción") más una sección "Vídeos listos". Cada sección es
  colapsable (chevron + contador).
- **Filtro por estado propio del backlog:** chips `Todos / Ideas / En desarrollo / En
  producción / Vídeos listos` con contador; al seleccionar uno se muestra solo ese
  grupo. Combina con el filtro de canal (filtrado **por canal Y por estado** a la vez).
- Robustez: estados de idea no contemplados caen en su propia sección (no se pierden);
  el drag-and-drop al calendario se mantiene idéntico.

## Archivos tocados

- `app/calendar/page.tsx`
  - `channelsPresent` reescrito (unión calendario + ideas + vídeos).
  - `<aside>` del backlog sustituido por `<BacklogPanel />`.
  - Componentes nuevos: `BacklogPanel`, `StatusChip` + constantes
    `BACKLOG_STATUS_LABEL` / `BACKLOG_STATUS_ORDER`.
  - Import añadido: `channelColor` desde `@/lib/channels`.

## Notas / pendientes

- El filtro por **estado** es específico del backlog (ideas/producción/listos). Si se
  quiere también filtrar el **calendario** por su estado propio (programado/subido/
  pendiente/etc.), es un añadido aparte no incluido aquí.
- El `.exe` empaqueta el repo en su estado actual → arrastra el `claude-jobs.ts` con
  el spawn roto (ver `ESTADO-2026-05-31-NOCHE.md`). Este fix es UI y no lo toca, pero
  conviene resolver los jobs antes de distribuir la build como producción.
- Working tree con cambios sueltos de sesiones previas (auto-publish, notify,
  upload-schedule, route.ts del calendario) **no incluidos** en este commit a propósito.
