# PLAN — Pipeline autoauditable (anti "vídeo público con fallos")

> **Fecha:** 2026-06-02 · **Autor:** SARA (sesión nocturna, investigación read-only)
> **Estado:** PLAN — pendiente de ejecutar. NO se ha tocado código ni YouTube esta noche.
> **Disparador:** el vídeo de Epicteto se auto-publicó PÚBLICO el 2026-06-01 18:15 (España)
> con andamiaje del guion quemado en los subtítulos (`HOOK — PAIN SCENE (0:00–0:45)`).

---

## 0. Qué pasó (confirmado en código + artefactos, no inferido)

**Síntoma:** `The One Sentence Epictetus Taught Against Any Attack on Your Character`
(título publicado: *"The One Phrase to Silence Everyone — STOICISM"*, videoId **`LpNdgjaO8Zg`**)
salió con subtítulos quemados que incluían los encabezados de estructura del guion:
- `HOOK — PAIN SCENE (0:00–0:45)` en el segundo 1
- `AGITATION (0:45–1:45)` hacia 1:05

**El audio está LIMPIO.** No es un fallo de TTS. Verificado:
- `01_BRUTOS/_LOCUCION/tts-jobs.json` → el texto de los 3 chunks empieza en *"Someone just said something about you…"*, sin andamiaje. CICERÓN hizo su trabajo.
- `01_BRUTOS/_LOCUCION/part_01.srt` → idem, limpio.

**Causa raíz (probada):** el motor de auto-edit genera los subtítulos por *forced alignment*
del **guion** contra el audio, y la fuente que recibe es el `guion.md` CRUDO (con andamiaje),
no el `tts-jobs.json` limpio.

- Archivo: `Y:\04_DEV\J.A.R.V.I.S\lab\auto-edit\core\script_align.py`
- Función: `clean_markdown_script()` (líneas 42-67).
  - SÍ quita: frontmatter, `# headers` markdown, `**meta**`, blockquotes, `---`, asteriscos, y
    todo lo que va entre corchetes `[...]` (vía `_AUDIO_TAG_RE`, por eso `[1]` y `[PAUSE]`
    desaparecen).
  - NO quita: líneas de andamiaje en **texto plano** sin `#`, p.ej. `HOOK — PAIN SCENE (0:00–0:45)`.
    Tras quitarle el `[1]` del principio, la línea sobrevive entera y entra al alignment.
- `extract_script()` (líneas 70-87) **ya soporta `tts-jobs.json`** como fuente (concatena el
  campo `text` de cada chunk). Esa rama está limpia. El render no la usa.

**Por qué ningún gate lo frenó:**
1. **LUÍS / auto-edit STATE 4** (auto-audit visual con `/watch`) busca asteriscos, capa oscura,
   subs de 1 línea, frames negros — **pero NO busca andamiaje de sección** en los subtítulos.
2. **`lib/auto-publish.ts` → `isComplete()`** (líneas 384-387) solo comprueba que EXISTEN
   `renderPrincipal && miniaturaFinal && hasPackagingMd`. **No abre el MP4 ni mira el `.ass`.**
3. El `.auto-published.json` de este vídeo lleva un `note: "Re-subido con QA completa
   (AMELIA+chapters+Marcus Hale)…"` — ese sello es de una subida MANUAL (formato distinto al que
   escribe `auto-publish.ts`), y la QA que afirma no miró el render real. Sello sin sustancia.

**Nota colateral (no es la causa de este bug, pero relacionado):** `auto-publish.ts` SÍ tiene
salvaguarda contra miniatura cuadrada (`isLandscapeThumb`, líneas 113-147) — descarta no-16:9.
El problema de la miniatura cuadrada `B-REST-RISE-v1.png` era de OTRO vídeo (Marcus Aurelius
self-discipline) y venía de generarla fuera de Algrow. Ver §4.4.

---

## 1. Arreglar el vídeo de Epicteto (táctico — Pablo ya decidió: borrar + rehacer + resubir)

El audio y los brutos están bien; solo hay que regenerar subtítulos + render.

1. **Despublicar/borrar** `LpNdgjaO8Zg` en YouTube Studio (decisión de Pablo; pocas visitas).
   YouTube no permite reemplazar el archivo de un ID existente → será un ID nuevo.
2. **Limpiar el `guion.md`** de la carpeta del vídeo (quitar `[N]`, headers de sección con
   timestamps, `[PAUSE]`) → o mejor, saltar directo al paso 3 usando el `tts-jobs.json`.
3. **Re-render** apuntando la fuente al `tts-jobs.json` limpio (ver §2.1). Carpeta:
   `H:\YOUTUBE\CANALES ESTOICISMO\MODERNI STOICI\_LISTOS PARA SUBIR\The One Sentence Epictetus…\`
   (moverla antes a `_EN PRODUCCIÓN\`).
4. **Verificar el `.ass` nuevo** con el gate de §3.1 (cero andamiaje) antes de nada.
5. **Re-subir** ya validado. Mantener título/miniatura (a Pablo le gustan).
6. Borrar los marcadores viejos: `_PACKAGING/.auto-published.json`, `.upload-jobs/`.

> Tiempo estimado del re-render: ~20 min. El resto, minutos.

---

## 2. Fix de raíz en el motor auto-edit (`Y:\04_DEV\J.A.R.V.I.S\lab\auto-edit\`)

### 2.1 — Preferir `tts-jobs.json` como fuente del alignment (fix principal, "CICERÓN guardián")

El `tts-jobs.json` es **literalmente el texto que se narró** y está limpio por construcción.
Usarlo como fuente da subtítulos = exactamente lo locutado, y elimina el andamiaje de raíz.

- **Archivo:** `tools/render_project.py` (y/o `core/render_project.py`) — donde se resuelve el
  `--script` que se pasa a `extract_script()`.
- **Cambio:** resolución de fuente con prioridad:
  1. `01_BRUTOS/_LOCUCION/tts-jobs.json` (si existe) ← **preferido**
  2. `…/guiones/<slug>/guion-v2.md`
  3. `<carpeta_vídeo>/guion.md`
- Loguear qué fuente se usó (para auditoría).

### 2.2 — Robustecer `clean_markdown_script()` (defensa en profundidad)

Aunque el render use el json, blindar el camino `.md` por si alguna vez se usa:

- **Archivo:** `core/script_align.py`.
- Añadir, antes de procesar énfasis, un filtro que elimine **líneas de andamiaje**:
  - Líneas que contengan un rango de timestamps tipo `(\d{1,2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2})`
    → línea de sección, nunca texto narrable. Eliminar línea entera.
  - Opcional: líneas que, tras quitar `[N]`, queden como header de sección en MAYÚSCULAS
    (`^[A-Z][A-Z ——-]{4,}$`). Cuidado de no comerse frases narrables legítimas — el
    discriminador fiable es el timestamp; usar las MAYÚSCULAS solo como heurística secundaria.
- Tests unitarios con el `guion.md` de Epicteto como fixture (debe salir 0 líneas de andamiaje).

### 2.3 — Convención de guion (preventivo, opcional)

Pedir a MARCO AURELIO / CICERÓN que el andamiaje vaya SIEMPRE como markdown header (`## HOOK …`)
o íntegramente entre corchetes `[HOOK — PAIN SCENE (0:00–0:45)]`, que el limpiador ya elimina.
Esto hace el guion robusto aunque falle todo lo demás. Documentar en las skills.

---

## 3. Gate de auto-auditoría — que NO se publique con fallos (lo que más le importa a Pablo)

### 3.1 — Check determinista sobre el `.ass` generado (barato, 100% fiable, sin OCR ni LLM)

Tras el render, antes de dar el vídeo por bueno, parsear los `Dialogue:` del `.ass` y FALLAR si
alguna línea casa patrones de andamiaje:
- timestamps `(\d{1,2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2})`
- etiquetas de sección conocidas (`HOOK`, `PAIN SCENE`, `AGITATION`, `CONTEXT \d`, `CTA`, …)
- corchetes residuales `[.*]`

- **Dónde:** nuevo módulo en auto-edit (p.ej. `core/qa_subs.py`) llamado al final de
  `render_project.py`. Si falla → marca el render como NO APTO y NO escribe sello de QA.
- Integrarlo también en **LUÍS STATE 4** como check explícito (hoy mira frames; que mire el `.ass`).

### 3.2 — Sello de QA del render

Escribir `RENDER/.render-qa.json` con `{ passed: bool, checks: {...}, at }` SOLO si 3.1 pasa.
Es el contrato entre "render hecho" y "apto para subir".

### 3.3 — `auto-publish.ts` exige el sello (cierra el agujero de la subida hands-off)

- **Archivo:** `C:\dev\yt-content-pipeline\lib\auto-publish.ts` → `isComplete()` (líneas 384-387).
- Añadir condición: además de render+miniatura+packaging, exigir que exista
  `RENDER/.render-qa.json` con `passed === true`. Sin sello → **no encola, no sube**.
- Opcional: si falta el sello en un vídeo "completo", avisar a Pablo por Telegram
  (reusar `sendTelegram`) en vez de silencio.

### 3.4 — (Más adelante) auto-auditoría visual real con frames

Como capa extra para fallos que no se ven en el `.ass` (capa oscura, glitches, último frame):
extraer N frames del MP4 y verificarlos. El `.ass` cubre el caso de hoy; los frames cubren lo visual.

---

## 4. Replicación a los otros canales estoicos

### 4.1 — Moderno Estoico
Mismo motor, misma corrección. Pendiente histórico ya anotado en LUÍS: extender
`_build_locucion_filtered` al patrón `ME-<slug>-parte-NN.mp3` cuando CALIOPE genere para ME.

### 4.2 — The Sleeping Stoic (estoicismo para dormir) — MÁS DELICADO
Vídeos mucho más largos. Implicaciones:
- El forced alignment y el gate del `.ass` deben aguantar guiones largos (batching ya existe:
  `core/build_video.py`, `_BATCH_SIZE`). Verificar memoria/tiempo.
- Andamiaje propio del formato sleep (otros headers) → el filtro por **timestamps** sigue siendo
  el discriminador robusto; revisar qué convención usa el guion de sleep.
- Comprobar `app/sleep-stories/` en la app (ya tiene bugs visuales menores anotados: V-SLP-1/2).

### 4.3 — Sincronización del guion en la vault
El `guion.md` de Epicteto vivía SOLO en `H:\…\<vídeo>\guion.md`, no en
`youtube-os/youtube/moderni-stoici/guiones/<slug>/`. LUÍS espera `guion-v2.md` en la vault.
Definir la fuente única del guion y que SARA verifique el sync (ya es regla suya).

### 4.4 — Miniaturas siempre por Algrow 16:9 (relacionado, no es este bug)
- La regla "100% miniaturas por la tool de Algrow" apunta a una tool que NO existe con ese nombre:
  la real es **`mcp__algrow__generate_image`** con `aspect_ratio:"16:9"` (default), modelo
  `nano-banana-2`. Corregir el nombre en la skill IRIS/SARA (hoy dice `generate_thumbnail`).
- `auto-publish.ts` ya filtra miniaturas no-landscape; reforzar que NORA/IRIS NUNCA generen con
  GPT u otra vía que dé 1:1.

---

## 5. Orden de ejecución sugerido (mañana)

1. **§2.1** — render_project.py prefiere `tts-jobs.json`. (fix de raíz, desbloquea todo)
2. **§3.1 + §3.2** — gate `qa_subs.py` sobre el `.ass` + sello `.render-qa.json`.
3. **§1** — rehacer y resubir el vídeo de Epicteto (primer caso real que valida el fix end-to-end).
4. **§3.3** — `auto-publish.ts` exige el sello.
5. **§2.2** — robustecer `clean_markdown_script` + tests.
6. **§4** — replicar a ME y sleep, sincronía de guion, fix nombre de tool de miniatura.

**Criterio de "hecho":** re-render del de Epicteto → `.render-qa.json.passed === true`,
`.ass` con 0 líneas de andamiaje, y `auto-publish` que se NIEGA a encolar cualquier vídeo sin sello.

---

## Archivos clave (referencia rápida)

| Pieza | Ruta |
|---|---|
| Forced alignment / limpieza guion | `Y:\04_DEV\J.A.R.V.I.S\lab\auto-edit\core\script_align.py` |
| Render (resuelve fuente del guion) | `Y:\04_DEV\J.A.R.V.I.S\lab\auto-edit\tools\render_project.py` |
| Subtítulos / Whisper | `Y:\04_DEV\J.A.R.V.I.S\lab\auto-edit\core\subtitles.py` |
| Auto-publicación (gate de subida) | `C:\dev\yt-content-pipeline\lib\auto-publish.ts` |
| Skill editor (orquesta el render) | `Y:\04_DEV\J.A.R.V.I.S\.claude\skills\luis\SKILL.md` |
| Vídeo afectado | `H:\YOUTUBE\CANALES ESTOICISMO\MODERNI STOICI\_LISTOS PARA SUBIR\The One Sentence Epictetus…\` |
