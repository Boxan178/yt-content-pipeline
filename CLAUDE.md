# CLAUDE.md — yt-content-pipeline

App de escritorio que sirve como **ventana de supervisión + riendas** sobre el proceso de producción de YouTube de Pablo. Visualiza vídeos por canal en kanban, abre detalle por vídeo con todo el material (render, miniaturas, packaging, checklist), y permite **disparar skills** del equipo (SARA, ELENA, AMELIA, MARCUS HALE, LUIS, NORA+IRIS) directamente desde la UI via `claude -p` local.

> **Antes de tocar nada, lee `ESTABILIZACION-2026-05-24.md`** (auditoría más reciente). Estado de salud, código que ya se eliminó como durmiente, riesgos latentes, próximos pasos. Sustituye al antiguo `STATUS-2026-05-22.md`, que mantiene contexto histórico pero ya no refleja el estado actual.
>
> **Si vas a usar la app desde el navegador o desde fuera del PC, lee `ACCESO-WEB.md`**. Resumen: el dev server escucha en `0.0.0.0:3001` y es accesible desde Chrome local, LAN (`192.168.1.46:3001`) y Tailscale (`100.86.173.107:3001` desde cualquier dispositivo del tailnet). El `.exe` v0.6.0 sigue siendo la versión "oficial-escritorio" intocable.

## Dónde vive y por qué

Este proyecto **vive en `C:\dev\yt-content-pipeline\`** (SSD local), NO en `Y:\04_DEV\J.A.R.V.I.S\lab\`. Razón: Next.js dev sobre el NAS arranca en 40-60s. En `Y:\04_DEV\J.A.R.V.I.S\lab\yt-content-pipeline\POINTER.md` hay una nota apuntando aquí para que la vault Obsidian lo referencie.

## Lo mínimo que tienes que saber para no romper nada

- **Stack**: Electron 33 + Next.js 14 (App Router) + Tailwind + xterm/node-pty para terminal embebida.
- **Vista principal**: `/channels/[slug]` con kanban (filesystem-driven, lee `H:\YOUTUBE\<canal>\`).
- **Vista detalle**: modal al click en card, con reproductores, packaging.md renderizado, galería miniaturas, checklist, **botones de skills** (SARA/ELENA/AMELIA/MARCUS/LUIS/NORA+IRIS/MARIO/test-72h).
- **Terminal embebida**: panel derecho persistente (siempre visible, redimensionable). `claude` o shell, vive en `layout.tsx` para que sobreviva a navegación.
- **Jobs persistentes**: cada botón de skill spawna proceso con persistencia en `<videoFolder>/.claude-jobs/`. La UI polleia (o usa SSE) el estado. Sobrevive a cerrar modal y cerrar Electron.
- **Canales** en `lib/channels.ts`. Tres habilitados (`moderni-stoici`, `moderno-estoico`, `vaultman`). Para activar otro, completar `rootPath`, `scriptsRoot` y nombres exactos de las carpetas de estado.
- **Paths absolutos** centralizados en `lib/config.ts`. Exporta `JARVIS_ROOT`, `YOUTUBE_OS_ROOT`, `LAB_ROOT`, `KIE_BRIDGE_PY`, `TTS_JOBS_ES/EN`, `normalizeAllowedPath()`, `channelScriptsRoot()`. **Nota anti-NFT**: `H:/YOUTUBE` NO se exporta como const (rompe `next build` porque webpack/NFT recorre `_RECURSOS/` y encuentra `.mp4` problemáticos). En `lib/channels.ts` los `rootPath` son literales completos hasta el folder concreto.
- **`/lab` (solo dev)** — wizard de 5 pasos para crear canales nuevos a partir de un canal de referencia (style-engine), validar el nicho (MARIO+Algrow), bootstrappear en disco (B1-B7 de state 16 + `bootstrap_channel.py`) y arrancar el primer vídeo. Persistencia JSON en `~/.yt-content-pipeline/lab/{channels,ideas,research}.json`. Visibilidad gated por `window.electronAPI.isDev` — en el `.exe` instalado NO aparece la entrada en sidebar, las rutas siguen accesibles por URL directa. Archivos clave: `lib/lab/`, `app/lab/`, `components/lab/`, `app/api/lab/`.

## Cosas que NO debes hacer (lecciones aprendidas)

- **No tocar el split layout** (`app/layout.tsx`): la terminal a la derecha vive ahí porque persiste entre rutas.
- **No fusionar `lib/progress-types.ts` con `lib/progress.ts`**: separación browser-safe vs server-only es necesaria para que el build de Next no falle con `UnhandledSchemeError`.
- **No re-introducir `shell: true` en `lib/claude-jobs.ts`**: rompe stdin propagation. Ya descartado.
- **No usar `claude.cmd` directo con shell:false**: Node 18+ devuelve EINVAL.
- **No usar `detached: true` en `spawn` de claude en Windows**: abre ventanas CMD aunque `windowsHide` esté. Usa `detached: false` + `stdio: ['ignore', fd, fd]`.
- **No hardcodear `Y:/04_DEV/J.A.R.V.I.S` ni `H:/YOUTUBE`** en archivos nuevos. Importa desde `lib/config.ts`. Si centralizar duele, el path no debería existir.
- **No automatizar Flow con Playwright**: descartado 2026-05-14 por fricción con la UI.
- **No usar API key de Anthropic**: subscription Pro siempre.
- **No mover el proyecto al NAS**: 40-60s de arranque.

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
- Skills viven físicamente en `Y:\04_DEV\J.A.R.V.I.S\.claude\skills\`. Desde este proyecto son accesibles vía **symlink** en `C:\dev\yt-content-pipeline\.claude\skills` → `\\Servidornas\naspablo\04_DEV\J.A.R.V.I.S\.claude\skills`. **No editar skills desde aquí** — edita en J.A.R.V.I.S. y se ven al instante. El symlink se recrea desde PowerShell admin si se rompe: `New-Item -ItemType SymbolicLink -Path "C:\dev\yt-content-pipeline\.claude\skills" -Target "\\Servidornas\naspablo\04_DEV\J.A.R.V.I.S\.claude\skills"`. Cuando spawneamos `claude -p` con CWD en `Y:\04_DEV\J.A.R.V.I.S` (jobs de skills), también las ve por la ruta original — los dos caminos coexisten.
- **Worktrees NO heredan el symlink de skills.** Cuando Claude Code crea un worktree bajo `.claude\worktrees\<slug>\`, le mete su propio `.claude\` vacío sin las skills. Resultado: `/sara`, `/miguel-angel`, etc. devuelven "Unknown command" desde esa sesión. Fix (no necesita admin, Dev Mode ya está activo): `cmd /c "mklink /D `"C:\dev\yt-content-pipeline\.claude\worktrees\<slug>\.claude\skills`" `"\\Servidornas\naspablo\04_DEV\J.A.R.V.I.S\.claude\skills`""` y reiniciar la sesión del worktree (las skills se indexan al arrancar). Documentado en [[reference_worktree_skills_symlink]].

## Referencias

- `ACCESO-WEB.md` — URLs (local/LAN/Tailscale), funcionalidad web vs .exe, cómo arrancar la versión PROD compilada en :3002, mantenimiento y seguridad
- `LAB-PLAN-2026-05-25.md` — plan del módulo `/lab` (decisiones, fases, archivos)
- `ESTABILIZACION-2026-05-24.md` — auditoría actual (LEER PRIMERO)
- `STATUS-2026-05-22.md` — cierre de sesión anterior, contexto histórico
- `AUDITORIA-2026-05-22.md` — auditoría previa (3 bugs ya arreglados)
- `PROPUESTAS-2026-05-23.md` — propuestas TIER 1-3 (algunas ya en v0.4.0)
- `README.md` — versión pública (puede estar desactualizado respecto al estado real)
- `lib/config.ts` — single source of truth para paths absolutos
- `Y:\04_DEV\J.A.R.V.I.S\.claude\skills\sara\SKILL.md` — orquestadora del pipeline
- `Y:\04_DEV\J.A.R.V.I.S\.claude\skills\nano-banana-iris\SKILL.md` — generación imagen (ejecuta kie-bridge directo)
- `Y:\04_DEV\J.A.R.V.I.S\lab\kie-bridge\` — wrapper Python para API Kie.ai
