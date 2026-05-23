# Sesión 2026-05-23 — Propuestas + cambios aplicados

Resumen breve de lo que has dejado encargado: **canal de historias nuevo**, **niveles Jedi en lugar de estoicos**, **favicon + sprite pixel-art**, y **propuestas de features tras explorar la bóveda**. Todo lo que se ha tocado en código está aplicado pero **NO commiteado todavía** — tú decides cuándo lo subes y empaquetas v0.3.0.

---

## 1. Cambios ya aplicados al código (sin commit)

### Canal nuevo "The Bow Man" para historias
- Añadido en [lib/channels.ts](lib/channels.ts) un canal `the-bow-man` con `enabled: true` y `rootPath: H:/YOUTUBE/THE BOW MAN`.
- Subcarpetas estándar (_PENDIENTE LOCUCION, _EN PRODUCCIÓN, _LISTOS PARA SUBIR, _SUBIDOS, _ARCHIVO).
- Cuando lo abras por primera vez aparecerá vacío hasta que crees las carpetas físicas. Si decides renombrarlo a otra cosa, edita una línea en `lib/channels.ts`.
- Los sleep stories actuales (`story-XX-*`) **siguen en sus canales de estoicismo** — tú los mueves cuando quieras al canal nuevo.

### Niveles Jedi (sustituyen a los estoicos)
- [lib/gamification-types.ts](lib/gamification-types.ts) ahora tiene 8 rangos canónicos basados en Wookieepedia (Disney + Legends, indico cuál es legends-only):
  | Nivel | Rango |
  |---|---|
  | 1 | **Iniciado** (Jedi Initiate / Youngling) |
  | 2 | **Padawan** |
  | 4 | **Caballero Jedi** (Jedi Knight) |
  | 7 | **Centinela Jedi** (Jedi Sentinel) |
  | 10 | **Maestro Jedi** (Jedi Master) |
  | 14 | **Miembro del Consejo** (Council Member) |
  | 18 | **Maestro de la Orden** (Master of the Order) |
  | 22 | **Gran Maestro Jedi** (Grand Master) |
- Cada rango lleva nombre EN + descripción canon-correct (tooltip + vista perfil).
- La XPBar de la TopBar ahora muestra "Padawan" en lugar de "Aprendiz estoico".
- `/perfil` tiene una sección **"Camino del Templo Jedi"** con los 8 rangos en orden, marcando dónde estás ("tú estás aquí") + cuál bloqueas siguiente.
- Nombre del rango siguiente visible debajo de la barra de XP.

### Avatar/sprite por nivel
- [api/avatar](app/api/avatar/route.ts) ampliado: ahora acepta `?level=N`.
- Busca `~/.yt-content-pipeline/avatars/level-<N>.png` (`.webp`, `.jpg`). Si no existe, retrocede al sprite del rango anterior. Si no hay nada, cae al `avatar.{png,jpg}` genérico, y por último a la inicial "P".
- AvatarBadge del sidebar ahora pide `?level=<nivelActual>` automáticamente y aplica `image-rendering: pixelated` para que los sprites SNES-style se vean nítidos.

### Favicon de la app
- `electron/main.ts` lee `build/icon.png` (dev) o `process.resourcesPath/build/icon.png` (prod) si existe. Si no, Electron usa el icono por defecto.
- `package.json > build.win.icon` apunta a `build/icon.ico` para el installer / portable. Cuando metas el archivo ahí, electron-builder lo embebe automáticamente.

---

## 2. Prompts visuales (los generas tú)

### 2.1 Favicon de la app — `build/icon.png` (1024×1024) + `build/icon.ico`

```
A clean, modern desktop application icon, 1024x1024 px, square with slightly rounded corners.

Subject: a stylized "YT" monogram on top of a play-button triangle, suggesting a YouTube content pipeline. Behind it, a subtle ascending pipeline of three connected nodes (small geometric shapes — circle, diamond, hexagon) implying production flow from idea to publish.

Style: flat vector, sharp geometry, no skeuomorphism. Slight inner glow on the central monogram for depth. Subtle film grain on the background for texture.

Palette: deep charcoal background (#0b0b0e), warm amber primary (#d4af37 / #f0c557), with a single accent blue (#3b82f6) on one of the pipeline nodes to suggest "live job running". White-cream text on monogram (#f5f5dc).

Composition: monogram + play button occupy ~55% of the canvas, centered. Pipeline nodes arc behind, top-left to bottom-right, lower opacity (~60%). 32px margin around all sides for proper alpha bleed.

Avoid: photographic textures, gradients with banding, drop shadows that exceed 4% opacity, emoji-style colors, cartoon faces, mascots.

Output: PNG with transparent background. Centered, edge-safe at all sizes from 16x16 up.
```

Después conviértelo a `.ico` (puedes usar https://icoconvert.com o `magick convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico`). Coloca ambos en `build/`.

### 2.2 Sprites pixel-art Jedi — 8 sprites (uno por nivel)

**Base común para todos** (cambia solo el `<RANK_BLOCK>` por cada uno):

```
A 64x64 pixel-art character portrait sprite in classic 16-bit JRPG style (think Chrono Trigger / Secret of Mana / FF6), front-facing, head-and-shoulders close-up centered on a transparent background.

The character is a young-to-middle-aged human male with short dark hair, neutral expression, gentle determination in the eyes. Subtle stubble. Glasses (rounded rectangular frames, thin dark plastic). This same character appears across all 8 sprites — only the rank attire changes.

<RANK_BLOCK>

Style constraints:
- Strictly 64x64 px, no anti-aliasing, hard pixel edges
- Limited palette: ~16 colors total per sprite
- 1-px black outline around the silhouette
- Single light source from top-left, simple cell shading (2-3 tones per material)
- No background — fully transparent PNG
- Output as PNG

Avoid: anime/manga style, smooth gradients, photorealism, blur, modern flat illustration, mascots, female features, "chibi" oversized heads.
```

**Bloques `<RANK_BLOCK>` por sprite** (los pones en orden):

1. **level-1.png — Iniciado (Youngling)**
   ```
   <RANK_BLOCK>
   Wearing simple beige novice robes with V-neck collar. No lightsaber visible. No padawan braid yet. Looks young and curious. Cream / sand tones.
   ```

2. **level-2.png — Padawan**
   ```
   <RANK_BLOCK>
   Wearing light-brown padawan tunic with darker brown belt. Thin padawan braid visible behind the right ear, falling to the shoulder, with small silver bead at the end. Calm, focused expression.
   ```

3. **level-4.png — Caballero Jedi (Knight)**
   ```
   <RANK_BLOCK>
   Wearing standard Jedi Knight robes: brown outer tunic over cream undertunic, dark leather belt. NO padawan braid (cut during the knighting ceremony). Lightsaber hilt visible at the belt, silver and black. Confident posture.
   ```

4. **level-7.png — Centinela Jedi (Sentinel)**
   ```
   <RANK_BLOCK>
   Wearing darker, more practical Jedi Sentinel robes — slate grey and deep brown layers, leather utility belt with several pouches. Hood resting on shoulders. Lightsaber hilt at belt with a yellow emitter band (Sentinel iconography). A subtle scar on the brow.
   ```

5. **level-10.png — Maestro Jedi (Master)**
   ```
   <RANK_BLOCK>
   Wearing full Jedi Master robes: layered brown and cream, heavier outer cloak with high collar. Detailed leather belt with metal clasps. Lightsaber hilt with green emitter. Hair slightly longer, light grey starting at the temples. Wise, serene expression.
   ```

6. **level-14.png — Miembro del Consejo (Council Member)**
   ```
   <RANK_BLOCK>
   Wearing Jedi Council formal robes: dark brown outer cloak with embroidered hem (subtle geometric pattern). Cream inner robe with high collar. Both shoulders covered. Lightsaber hilt at hip. Hair fully grey at temples. Sitting tall, dignified.
   ```

7. **level-18.png — Maestro de la Orden (Master of the Order)**
   ```
   <RANK_BLOCK>
   Wearing solemn deep-brown Master of the Order robes with subtle gold trim along the collar and cuffs. Heavier ceremonial mantle on the shoulders. A small badge of office (geometric circle motif) at the throat. Full grey hair, neat beard. Calm authority in the gaze.
   ```

8. **level-22.png — Gran Maestro Jedi (Grand Master)**
   ```
   <RANK_BLOCK>
   Wearing simple, modest grey-and-cream robes — the Grand Master archetype is humble, like late-Yoda or post-RotJ Luke. Holding a wooden gimer-stick / staff in the foreground. White hair, full white beard. Eyes calm and ancient, with faint hint of a smile. Light glows subtly around the silhouette (very subtle — 1-2 pixels of soft yellow).
   ```

Genera los 8 en serie con Nano Banana / Midjourney / Stable Diffusion, guárdalos como `level-1.png`, `level-2.png`, …, `level-22.png` en `C:\Users\pablo\.yt-content-pipeline\avatars\` (créala). La app los pillará automáticamente.

---

## 3. Propuestas de features tras explorar tu bóveda

Sub-agente mapeó `Y:\04_DEV\J.A.R.V.I.S` y propone esto, ordenado por **ROI estimado** (alto → bajo):

### TIER 1 — Alto ROI, bajo esfuerzo (1-3h cada uno)

1. **Bulk-queue de renders LUIS** — La cola que ya tienes (`/queue`) ya existe pero hoy se encolan items uno a uno desde botón. Añadir un modal "Encolar lote" donde marcas N vídeos con checkbox y los mete TODOS a la cola en orden. Caso de uso vivo: las 20 sleep stories. **Recomendado: SÍ.**

2. **Integración `kie-bridge` directa** — Vista nueva `/visual-lab` con: input de prompt, selector de modelo (`nano-banana-2`, `nano-banana-pro`, Seedance, Veo), aspect ratio, resolución. Botón "Generar" → llama a `kie.py` directamente sin pasar por NORA. Sirve para iterar imágenes sueltas (intros, recursos visuales, etc.) sin tener que abrir una skill completa. **Recomendado: SÍ, complementa a NORA+IRIS.**

3. **Botón "📊 Stats canal" pre-upload** — En el modal de detalle, antes del botón Subir, añadir uno que invoca Algrow MCP (`get_channel_about` + `get_channel_videos`) y muestra mini-dashboard: subs actuales, avg views últimos 10 vídeos, mejor hora del día para publicar tu nicho. Ayuda a decidir cuándo programar el upload. **Recomendado: SÍ.**

4. **Skill MARIO accesible** — La skill `mario` (estratega YouTube faceless) existe en `Y:\.claude\skills\mario\SKILL.md` y nadie la invoca desde la app. Añadir botón "🎯 Diagnóstico con MARIO" en el modal de detalle. **Recomendado: SÍ.**

5. **Skill `test-72h` para post-mortem** — Vídeos en estado `uploaded` con >72h de publicación deberían tener un botón "🔍 Post-mortem 72h" que invoca esta skill (analiza CTR/AVD reales vs target, propone iteración de título/miniatura si aplica). **Recomendado: SÍ.**

### TIER 2 — Medio ROI

6. **Sidebar info contextual de feedback** — Tu `~/.claude/claude-memory/` tiene 15+ memorias `feedback_*` con reglas vivas del pipeline ("eme-dash trunca paths bash Windows", "Nano Banana 2 en Flow", etc.). Añadir un panel "ℹ️ Reglas del canal" en el sidebar del modal de detalle que muestra los feedback relevantes filtrados por tipo de tarea actual.

7. **Sleep stories tracker dedicado** — Vista `/sleep-stories` mejorada con grid 5×N donde cada card muestra % de chunks generados, botón "asignar CALIOPE batch" y dropdown de progreso. La vista actual ya lista las stories, pero esta sería "panel de control" en lugar de listado.

8. **Mapa Canvas del pipeline** — Tu archivo `Y:\04_DEV\J.A.R.V.I.S\flow-creacion-video.canvas` ya describe las 8 fases del pipeline con dependencias. Importarlo como vista `/pipeline-map` interactiva (cada nodo es clickeable, lleva a la skill correspondiente). Bonito y útil para onboarding mental.

9. **Selector de "Equipo" por vídeo** — Tu skill `EQUIPOS.md` mapea 30 skills por departamento. En el modal de detalle, sección "🎬 Equipo asignado a este vídeo" con chips clickables por skill. Cada chip abre un "brief" textual (qué espera del vídeo, validaciones clave, output). Reemplaza tener que abrir el `.md` manual.

### TIER 3 — Alto valor pero más trabajo

10. **Mission Control "Dream Engine" panel** — Tu memoria `reference_mc_dream_engine_visual_spec.md` describe un panel de recomendaciones generadas overnight. Implementarlo aquí: `claude` corre durante la noche (cron) y genera ideas de título, topics saturados, gaps de nicho, Algrow outliers. Por la mañana abres la app y ves "🌙 Recomendaciones de hoy". **Encaja con tu uso real porque vives en modo async.**

11. **Multi-proyecto** — Hoy la app asume tu workspace estoico. Tu memoria documenta otros proyectos (Dark Matters HD, Shorts Factory, Voidline). Añadir un selector de "Workspace" en la home que carga distintos archivos de canales según el proyecto activo. Permite usar la misma app para canales muy distintos.

12. **Push web + Telegram al terminar jobs** — Hoy las notificaciones del fin de job son solo notif OS local. Integrar `notify-done` real (Telegram + push web del dashboard) cuando un job de duración >5 min termina. Tu PC nocturno + dispositivos móviles te enterarías.

---

## 4. Mi recomendación de orden si avanzamos

Si te encajan, yo iría así (cada slot = 1 sesión nuestra):

1. **Sesión próxima**: Bulk-queue + skill MARIO + skill test-72h. Las tres son botones nuevos sobre infraestructura existente. Da volumen visible.
2. **Sesión +1**: kie-bridge directo (`/visual-lab`) + Stats pre-upload con Algrow.
3. **Sesión +2**: Sidebar contextual de feedback + selector de Equipo. Aprovecha tu memoria existente.
4. **Sesión +3**: Mapa Canvas + Sleep stories panel.
5. **Sesión +4**: Mission Control Dream Engine + Push real notifications.
6. **Sesión +5**: Multi-proyecto (la última porque cambia arquitectura).

---

## 5. Pregunta abierta para ti

- ¿El canal nuevo va a llamarse **"The Bow Man"** (reciclando el existente) o **otro nombre**? Si es otro, dímelo y lo cambio en una línea.
- ¿Vas a generar el favicon + sprites tú mismo (con los prompts de arriba) o quieres que dispare yo NORA+IRIS desde la app para los 8 sprites? Tu llamada — los prompts ya están listos.
- ¿Quieres que pase el cambio a **v0.3.0** y publique release con auto-update para probar el flow desde la v0.2.0 instalada?
