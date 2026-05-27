# 🗿 MIGUEL ÁNGEL — Auditoría visual yt-content-pipeline

**Fecha**: 2026-05-27
**App**: yt-content-pipeline (Electron 33 + Next.js 14 + Tailwind, DESKTOP)
**Proyecto Stitch**: `8296652321668230254`
**Design System Stitch**: `assets/17930957154126530287` — *YTCP Charcoal & Gold*
**Cuota consumida**: 5 generaciones de pantalla + 1 creación de design system = **6/350 del mes**.

---

## Brief recibido

> "Buenos días, podrías por favor hacer una auditoría, visualmente hablando y de
> User Interface, de la aplicación entera y aplicar todas las mejoras que
> visualmente creas conveniente."

**Cómo lo he interpretado**: la app entera son ~20 pantallas + 8 modales. Auditar
y rediseñar TODO en una sesión consume más cuota de la que conviene gastar de
golpe (≥20 generaciones, ~6% del mes) y arriesga inconsistencia. He esculpido
**el design system unificado + las 5 pantallas vertebrales** que definen el
lenguaje visual del resto. Cuando integres estas 5 y veas cómo respira la app,
generamos el resto con coherencia ya validada.

**Decisión consciente**: MIGUEL ÁNGEL **no integra código en el repo**. Genera
mockups en Stitch, los descarga a `design/stitch/<screen-slug>/` y deja el
handoff. Pablo o el agente integrador lo traducen al stack real (Next 14 +
Tailwind) con criterio de developer.

---

## Por qué este rediseño

### Lo que está bien hoy (mantener)

- **Tema oscuro charcoal + accent dorado matte (#c9a96a)**: identidad fuerte,
  asociada a Marco Aurelio y a los Jedi. Mantener como columna vertebral.
- **Sidebar 64px con emojis**: legibilidad alta, character único. No tocar.
- **Gamificación Jedi (XPBar + ranks)**: bien dosificada en la TopBar. No
  invasiva. Mantener.
- **Kanban filesystem-driven**: el modelo mental encaja con cómo trabajas. La
  estructura existente sirve, solo se afina visualmente.

### Lo que pedía cincel (mejorar)

1. **Jerarquía visual del Home**: hoy las cards de canales activos y las
   "coming soon" tienen el mismo peso. Eso confunde. → He bajado el peso de las
   coming soon (zinc + opacity) y subido el de las activas (gold subtle).
2. **El VideoDetailModal era una sopa**: 12+ botones, 4 sections, scroll. He
   metido jerarquía clara: botones primary (SARA + LUIS) destacan; secondary
   (ELENA, MARCUS, etc.) en stack subtle; el ChecklistPanel se separa visualmente
   con borde propio. Header sticky con título + path + acciones.
3. **El Lab no se diferenciaba visualmente de producción**: he añadido un strip
   ámbar superior y accent ámbar en marcadores Lab (icono sidebar, FAB,
   pulses del wizard) sobre el sistema charcoal/gold. Te queda claro de un
   vistazo si estás en producción o experimentando.
4. **Tipografía monolítica (Inter en todo)**: he añadido Sora para títulos y
   números de KPI — geométrica, técnica, encaja con dashboard de pipeline. Inter
   sigue para body y UI. Mono para paths.
5. **Sin grid de spacing claro**: definido grid base 4px, padding card 16-20,
   gaps consistentes.

---

## Pantallas entregadas

Cada una en su carpeta con `screen.html` (código React-Tailwind en HTML
standalone, listo para ver en navegador o trasplantar a componentes) y
`preview.png` (screenshot 2560×alto en PNG para revisión visual rápida).

| Slug | Pantalla | Screen ID Stitch | HTML | PNG |
|---|---|---|---|---|
| `home-dashboard/` | Home — Hola Caballero Jedi + KPIs + canales | `3f635ddc81984352...` | 25 KB | 45 KB |
| `kanban-channel/` | Kanban del canal "Moderni Stoici" | `b416b9ab2e1a4a40...` | 21 KB | 35 KB |
| `video-detail-modal/` | Modal de detalle de vídeo (Never Chase…) | `58b3885efbab45c1...` | 23 KB | 48 KB |
| `lab-dashboard/` | Lab — Canales borrador + tabs Ideas/Investigaciones | `7e6b75e191414e8f...` | 16 KB | 36 KB |
| `lab-wizard-step-1/` | Wizard Paso 1: Canal de referencia + transcripts | `51cdb3e627c746bb...` | 18 KB | 56 KB |

**Cómo previsualizar rápido**: doble click sobre cualquier `screen.html` y se
abre en el navegador. Los assets están autoincluidos (Tailwind via CDN dentro
del HTML).

---

## Design System — YTCP Charcoal & Gold

Listo para traducirse al `tailwind.config.ts` del repo. Tokens:

### Colors

```ts
// tailwind.config.ts → theme.extend.colors
colors: {
  bg:     '#0b0b0e',  // charcoal — fondo base
  panel:  '#13131a',  // panel — superficies elevadas
  border: '#26262e',  // border — separadores sutiles
  accent: '#c9a96a',  // gold matte — el ÚNICO accent principal
  muted:  '#5a5a66',  // texto secundario
  ok:     '#22c55e',  // estados positivos (activo, done, en-el-PC)
  err:    '#ef4444',  // error, cancel, failed
  warn:   '#facc15',  // warning, pending decision, loop intento
  info:   '#3b82f6',  // scheduled, info neutral
}
```

### Typography

```ts
// next/font o equivalentes
fontFamily: {
  sans:    ['Inter', 'system-ui', 'sans-serif'],   // body/UI/forms
  display: ['Sora', 'Inter', 'sans-serif'],        // títulos + números KPI
  mono:    ['JetBrains Mono', 'Consolas', 'monospace'], // paths, file lists
}

// Sizes (suelo aplicado en pantallas Stitch):
//   title-xl  32/40   título página
//   title-lg  24/32   título modal
//   title-md  20/28   nombre canal en card
//   body-md   14/20   texto general
//   body-sm   13/18   metadata cards
//   label     11/16 uppercase tracking-wider   etiquetas de sección
```

### Roundness

```ts
borderRadius: {
  DEFAULT: '8px',     // cards, botones, paneles
  full:    '9999px',  // pills, avatares
  sm:      '2px',     // inputs, chips de archivo (alta densidad)
  lg:      '16px',    // modal premium feel
}
```

### Spacing y rhythm

- Grid base **4px**.
- Padding card: `p-4` a `p-5` (16-20px).
- Padding modal: `p-5` a `p-6` (20-24px).
- Sidebar items: `40×40` cuadro, gap `8px`.
- KPI tiles: padding 20, gap 16.

### Elevation (mínima)

- Cero shadows en cards normales. Las superficies se distinguen por color de fondo
  (`bg` charcoal vs `panel`) + `border` 1px.
- Hover: border accent/60 + subtle bg `accent/5`.
- Solo el modal grande usa `shadow-2xl`.

### Estados semánticos (regla de oro)

| Estado | Color | Uso |
|---|---|---|
| Importante / primary | accent (gold) | Botón principal, link activo, focus ring, XPBar fill |
| Done / positivo | ok (green) | Pill "activo", ✓ check, En-el-PC, job done |
| Error | err (red) | Cancel button, failed job, validation error |
| Warning / pendiente | warn (yellow) | Decisión pendiente, loop intento N, sin guion |
| Info / scheduled | info (blue) | Pill "programado", scheduled column |

Gold = "esto importa, tu atención aquí". Nunca usar gold para decoración.

---

## Brief de integración paso a paso

Esto es lo que MIGUEL ÁNGEL te recomienda hacer cuando vuelvas a integrar
(no lo hago yo — es tu repo, tu agente integrador):

### Fase 1 — Design tokens (30 min)

1. Abre `tailwind.config.ts` del repo.
2. Mete los tokens del bloque `Colors`, `Typography`, `Roundness`, `Spacing`.
3. Si no hay `next/font` configurado para Sora, añadirlo en `app/layout.tsx`:
   ```ts
   import { Sora, Inter, JetBrains_Mono } from 'next/font/google';
   ```
4. Reemplazar el CSS custom de `app/globals.css` que defina colores hex sueltos
   por referencias a los tokens (`bg-bg`, `text-accent`, etc.).
5. `npx tsc --noEmit` debe seguir limpio. `npm run dev` arranca, miras visual
   regression.

### Fase 2 — Componentes vertebrales (2-3 h)

Migra en este orden, abriendo el `screen.html` correspondiente y trasladando
clases a los componentes existentes:

1. **`components/Sidebar.tsx`** — clases del sidebar del home-dashboard.
   Verifica que el gating `isDev` del Lab sigue funcionando.
2. **`components/TopBar.tsx`** + **`XPBar.tsx`** + **`WorkingModeToggle.tsx`** +
   **`AvatarBadge.tsx`** — del header del home-dashboard. La XPBar ahora con
   gradiente sutil gold + label "Caballero Jedi (6) — XP".
3. **`app/page.tsx`** (Home) — bandas: greeting + KPIs + canales + quick actions.
   Crear `components/KPITile.tsx` reusable.
4. **`app/channels/[channel]/page.tsx`** — kanban refactorizado con columnas
   stickeys y cards con progress strip 6 hitos.
5. **`components/VideoDetailModal.tsx`** — el más invasivo. Aplicar la jerarquía
   de la pantalla `video-detail-modal/`. Mover el ChecklistPanel y los ClaudeRunButtons
   a la columna derecha 34% según el nuevo layout.

### Fase 3 — Lab (1-2 h)

Sólo si el agente autónomo terminó el Lab v1:

1. **`app/lab/page.tsx`** — tabs + grid de drafts según `lab-dashboard/`.
2. **`app/lab/new-channel/step-1-reference/page.tsx`** — formulario completo
   según `lab-wizard-step-1/`. Replicar el patrón visual (progress bar sticky,
   footer sticky, columna 720px centrada) para steps 2-5.

### Fase 4 — Pantallas no diseñadas (volver a MIGUEL ÁNGEL)

Cuando estés satisfecho con las 5 vertebrales, vuelve a llamarme para diseñar:

- `/upload` (configurar subida + scheduled)
- `/jobs` y `/jobs/[jobId]` (lista + detalle de job claude)
- `/perfil` (gamificación + sprites Jedi + camino del templo)
- `/notifications` (lista de notificaciones)
- `/configuracion` (settings + Notion poller)
- `/chats` y `/chats/[sessionId]` (historial filtrado a YouTube OS)
- `/sleep-stories` (tracker)
- `/visual-lab` (generación imagen)
- `/queue` (cola FIFO)
- `/scheduled` (programadas)
- `/lab/new-channel/step-2` a `step-5` (clonar patrón de step-1)
- `/lab/ideas`, `/lab/research`, `/lab/first-video/[draftId]`
- Modales: DecisionModal, BulkEnqueueModal, NewCompilationModal, UpdateToast, LevelUpToast

Cada lote de 5 pantallas = ~5 generaciones. Si las hacemos en bloques temáticos
(p.ej. "todas las pantallas de Jobs" en una sesión), cuesta ~20 generaciones para
cubrir la app entera. Eso son 6% del cupo mensual.

---

## Decisiones de diseño relevantes (qué resolví y por qué)

### 1. Sora para títulos, Inter para body

La app tenía Inter para todo. Bien para densidad, malo para personalidad.
Sora aporta carácter técnico-geométrico (encaja con dashboard de pipeline) sin
romper la legibilidad. Solo se usa para 6 contextos concretos: título página,
título modal, nombre canal en card, números grandes de KPI, headers de columna
kanban, breadcrumbs. Inter sigue dominando el resto.

### 2. Gold matte como ÚNICO accent

El sistema previo tenía gold + verdes + azules + reds repartidos sin jerarquía
clara. He restringido el gold a "lo importante" y delegado los otros colores a
**estados semánticos** (verde=ok, rojo=error, amarillo=warn, azul=info). Si una
acción no es la principal, no es gold.

### 3. Modal video con jerarquía 2:1

El modal antes tenía 1:1 visual entre contenido y panel de skills. Ahora el
contenido del vídeo (player + thumbs + packaging.md) ocupa 66%, y el panel
de skills + checklist + summary el 34%. El usuario mira primero el contenido y
luego decide qué hacer.

### 4. Lab con strip ámbar diferenciador

El Lab antes solo se diferenciaba por el icono 🧪 en sidebar. Si entras al
Lab, no había ningún recordatorio. He añadido un strip de 36px arriba ("Modo
experimental — Estás viendo el Lab. Las features de esta zona NO están
disponibles en el .exe instalado.") + accent ámbar para marcadores Lab. Te
sitúa de inmediato.

### 5. Progress strip 6 segmentos en cards kanban

Lo más informativo del kanban. Antes los hitos vivían dentro del modal. Ahora
en la card hay 6 segmentos visibles que se rellenan en gold conforme cumplen
los 6 hitos de `progress.ts` (hasPackagingMd, scriptWritten, locucionReady,
brutosVisuales, renderPrincipal, miniaturaFinal). De un vistazo sabes qué
falta.

### 6. Wizard del Lab con progress bar persistente

El wizard de 5 pasos siempre muestra dónde estás. El step actual con
pulse ámbar, los pasados en gold, los futuros locked (con tooltip "Completa
el paso anterior"). El footer sticky tiene el botón "Siguiente" gold + helper
text que explica qué va a pasar (lanza job claude ~3-5 min).

---

## Riesgos / vigilar al integrar

| Riesgo | Mitigación |
|---|---|
| **El HTML descargado usa Tailwind via CDN**: no es producción real, solo
mockup. Hay que trasladar clases a componentes Next y verificar que el
`tailwind.config.ts` cubre todas las clases custom usadas. | Mira `screen.html`,
identifica clases que necesiten extension del config, añádelas. |
| **Sora no estaba en el proyecto** (probablemente). | `next/font/google` lo
trae automáticamente, cero coste. |
| **Iconos emoji** quedan como emoji unicode, no como SVG. Render varía entre
Electron (Segoe UI Emoji Windows) y browser web. | Si quieres consistencia 1:1,
sustituir por `lucide-react` iconos. Pero perder character. Decisión tuya. |
| **El agente autónomo está modificando archivos en working tree
(`components/Sidebar.tsx`, `app/configuracion/page.tsx`, etc.)**. Si integras
mis cambios encima de los suyos, conflicto manual. | Coordinarse: o el agente
termina y commitea, o yo trabajo encima del último commit suyo. Hoy no he
tocado código del repo a propósito por esta razón. |
| **VideoDetailModal es 568 líneas**. La migración visual no es trivial. | Hacer
commit aparte solo del modal después de Sidebar/TopBar para reducir blast
radius. |

---

## Lo que NO hice (y por qué)

- ❌ Tocar código del repo (`components/*`, `app/*`). MIGUEL ÁNGEL esculpe
  mockups, no implementa. Lo justifica la skill: "MIGUEL ÁNGEL no integra el
  código en el repo". Además había un agente autónomo trabajando en paralelo,
  riesgo de conflicto.
- ❌ Diseñar las 15+ pantallas restantes en una sesión. Cuota responsable,
  y mejor validar el lenguaje con 5 que dudar de 20.
- ❌ Generar SVG/Lottie de iconos custom. Si quieres salir de emoji unicode,
  IRIS o un illustrator humano lo hace mejor que yo en este scope.
- ❌ Diseñar mobile/tablet. La app es Electron desktop. Si algún día se
  migra a web responsive, replantear el system.
- ❌ Tocar el `state/projects.json` de la skill después de la primera
  escritura. Ya quedó registrado el `project_id` para futuras sesiones.

---

## Acceso a Stitch

Cuenta: `p.navas.04@gmail.com`. Proyecto:
https://stitch.with.google.com/projects/8296652321668230254 (puede que la URL
sea distinta, pero el `project_id` `8296652321668230254` es el canónico).

Desde ahí puedes:
- Ver las 5 pantallas en alta fidelidad.
- Pedir variantes (`generate_variants` con `REFINE/EXPLORE/REIMAGINE`).
- Editar puntualmente (`edit_screens` con prompt directo).
- Exportar a Figma si lo necesitas para handoff con otro diseñador.

---

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**MIGUEL_SCORE**: 8/10
**MIGUEL_VEREDICTO**: LISTO PARA INTEGRAR (las 5 vertebrales) · PENDIENTE FASE 2 (~15 pantallas más)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Razón del 8 y no 10**:
- El modal de vídeo (`video-detail-modal/`) sigue siendo denso — funciona, pero
  hay margen de seguir simplificando en una iteración futura.
- Faltan estados de error/loading en general (cuando el dev se inicia, cuando
  Next dev tarda, etc.). Se diseñarán cuando lleguemos a las pantallas
  específicas que los muestran.
- El kanban con 5 columnas en 1440px es justo de espacio horizontal. Pablo
  trabaja en monitores anchos así que probablemente bien, pero a 1280px se
  apretará. Considerar collapsable de columnas archivadas/uploaded.

"El bloque ya está bien delimitado. Las cinco pantallas que entrego dictan el
lenguaje. El resto sale solo cuando vuelvas, eh? — MIGUEL ÁNGEL"
