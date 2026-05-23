# CLAUDE.md — yt-content-pipeline

App de escritorio que sirve como **ventana de supervisión + riendas** sobre el proceso de producción de YouTube de Pablo. Visualiza vídeos por canal en kanban, abre detalle por vídeo con todo el material (render, miniaturas, packaging, checklist), y permite **disparar skills** del equipo (SARA, ELENA, AMELIA, MARCUS HALE, LUIS, NORA+IRIS) directamente desde la UI via `claude -p` local.

> **Antes de tocar nada, lee `STATUS-2026-05-22.md`** en este mismo directorio. Es el documento de cierre de sesión que contiene: estado de cada feature, arquitectura clave, bug crítico actual, próximos pasos. NO empieces a programar sin leerlo, evitarás repetir tests ya descartados.

## Dónde vive y por qué

Este proyecto **vive en `C:\dev\yt-content-pipeline\`** (SSD local), NO en `Y:\04_DEV\J.A.R.V.I.S\lab\`. Razón: Next.js dev sobre el NAS arranca en 40-60s. En `Y:\04_DEV\J.A.R.V.I.S\lab\yt-content-pipeline\POINTER.md` hay una nota apuntando aquí para que la vault Obsidian lo referencie.

## Lo mínimo que tienes que saber para no romper nada

- **Stack**: Electron 33 + Next.js 14 (App Router) + Tailwind + xterm/node-pty para terminal embebida.
- **Vista principal**: `/channels/[slug]` con kanban (filesystem-driven, lee `H:\YOUTUBE\<canal>\`).
- **Vista detalle**: modal al click en card, con reproductores, packaging.md renderizado, galería miniaturas, checklist, **botones de skills** (SARA/ELENA/AMELIA/MARCUS/LUIS/NORA+IRIS).
- **Terminal embebida**: panel derecho persistente (siempre visible, redimensionable). `claude` o shell, vive en `layout.tsx` para que sobreviva a navegación.
- **Jobs persistentes**: cada botón de skill spawna proceso detached con persistencia en `<videoFolder>/.claude-jobs/`. La UI polleia el estado. Sobrevive a cerrar modal y cerrar Electron.
- **Canales** en `lib/channels.ts`. Solo `moderni-stoici` está `enabled: true`. Para activar otro, completar `rootPath`, `scriptsRoot` y nombres exactos de las carpetas de estado.

## Bug crítico actual (PRIORIDAD 1)

**`claude -p` spawneado detached con stdin desde file descriptor queda colgado** (~8s de CPU en 7+ min). Bloquea TODOS los botones de skills. La terminal interactiva (con node-pty) NO está afectada.

Detalles completos + soluciones a probar en `STATUS-2026-05-22.md` sección "BUG CRÍTICO ACTUAL".

## Cosas que NO debes hacer (lecciones aprendidas)

- **No tocar el split layout** (`app/layout.tsx`): la terminal a la derecha vive ahí porque persiste entre rutas.
- **No fusionar `lib/progress-types.ts` con `lib/progress.ts`**: separación browser-safe vs server-only es necesaria para que el build de Next no falle con `UnhandledSchemeError`.
- **No re-introducir `shell: true` en `lib/claude-jobs.ts`**: rompe stdin propagation. Ya descartado.
- **No usar `claude.cmd` directo con shell:false**: Node 18+ devuelve EINVAL.
- **No automatizar Flow con Playwright**: descartado 2026-05-14 por fricción con la UI.
- **No usar API key de Anthropic**: subscription Pro siempre.
- **No mover el proyecto al NAS**: 40-60s de arranque.
- **No borrar archivos durmientes** (`components/RenderPanel.tsx`, `app/api/channels/.../render/`, `lib/render.ts`, `app/api/claude/run/route.ts`) sin antes confirmar que el flujo nuevo funciona en producción.

## Cómo levantar la app

```powershell
cd C:\dev\yt-content-pipeline
npm run dev
```

Espera el `✓ Ready`. Electron arranca solo. Si algo no carga, `Ctrl+Shift+R` en la ventana.

Si hay procesos node huérfanos:
```powershell
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*\nodejs\*" } | Stop-Process -Force
```
(Esto mata TODOS los node, úsalo solo antes de relanzar.)

## Arquitectura visual

```
Next dev server :3001  ←─ http  ─→  Electron renderer (xterm + React + Next pages)
       │                                    │
       ↓                                    ↓ IPC (preload + contextBridge)
  /api/* (Node)                       Electron main (node-pty para terminal)
       │                                    │
       ↓                                    ↓
  filesystem H:/, Y:/                  spawn pty `claude` o shell
  spawn `claude -p` (jobs)
  spawn `python kie.py`
  spawn `explorer.exe`
```

## Canales y filesystem

```
H:\YOUTUBE\CANALES ESTOICISMO\MODERNI STOICI\
├── _EN PRODUCCIÓN\        ← state: production
├── _LISTOS PARA SUBIR\     ← state: ready
├── _SUBIDOS\               ← state: uploaded
└── _ARCHIVO\               ← state: archived

Override visual: si un vídeo tiene activeJobs > 0, se muestra en
"En producción" aunque físicamente esté en otra carpeta. Vuelve a su
columna real cuando el job termina (en el siguiente refresh).
```

Cada `<vídeo>/` tiene `01_BRUTOS/`, `RENDER/`, `_PACKAGING/`. Los 6 hitos de progreso se calculan en `lib/progress.ts` mirando si existen archivos clave en esas subcarpetas.

## Convenciones

- Sin auth todavía. RLS abierta en Supabase. Si la app se expone fuera del PC, meter auth antes.
- No subir `.env.local` (ya está en `.gitignore`).
- Next.js dev en :3001 (youtube-dashboard usa :3000 si lo tienes activo).
- Skills viven en `Y:\04_DEV\J.A.R.V.I.S\.claude\skills\` y son detectadas automáticamente cuando spawneamos `claude` con CWD en `Y:\04_DEV\J.A.R.V.I.S`.

## Referencias

- `STATUS-2026-05-22.md` — estado completo y próximos pasos (LEER PRIMERO)
- `README.md` — versión pública (puede estar desactualizado respecto al estado real)
- `Y:\04_DEV\J.A.R.V.I.S\.claude\skills\sara\SKILL.md` — orquestadora del pipeline
- `Y:\04_DEV\J.A.R.V.I.S\.claude\skills\nano-banana-iris\SKILL.md` — generación imagen (ejecuta kie-bridge directo)
- `Y:\04_DEV\J.A.R.V.I.S\lab\kie-bridge\` — wrapper Python para API Kie.ai
