# Auditoría yt-content-pipeline · 2026-05-22 (sesión interactiva)

> Ejecutada en directo dentro de la sesión, no por el cron programado (Pablo lo desactivó y pidió arrancar ya).

## Bugs arreglados

### 1. `lib/checklist-resolver.ts` — variante `unknown` muerta del `ResolverPlan`
**Síntoma**: 3 errores TS en `components/ChecklistItemRow.tsx` (líneas 178, 192, 195). El narrowing tras `if (plan.kind === 'manual') return …` dejaba al tipo en `'auto' | 'unknown'`, y `unknown` no tiene `.label` / `.hint`, así que el acceso fallaba.

**Causa raíz**: la variante `{kind: 'unknown', reason}` estaba declarada en el tipo pero NUNCA se devolvía (el fallback final siempre construye un `auto` que delega a SARA). Código muerto contaminando el discriminado.

**Fix aplicado**: eliminar la variante `unknown` del tipo `ResolverPlan` en `lib/checklist-resolver.ts`. Si en el futuro hace falta un fallback "no sé qué hacer", se reintroduce — pero hoy era ruido.

**Commit sugerido**: `fix(checklist-resolver): remove unused 'unknown' variant breaking ChecklistItemRow narrowing`

### 2. `lib/prompts.ts` — `BuiltPrompt.model` tipado como `'sonnet' | 'opus' | string`
**Síntoma**: 7 errores TS en `components/ThumbnailsPanel.tsx` (línea 131) y `components/VideoDetailModal.tsx` (líneas 331, 343, 357, 372, 388, 400). Todos del mismo tipo: `string | undefined` no asigna a `ClaudeModel`.

**Causa raíz**: la unión `'sonnet' | 'opus' | string` colapsa a `string` (cualquier string incluye los literals). Como `ClaudeRunButton` y `JobOptionsPicker` esperan `ClaudeModel = 'sonnet' | 'opus'`, la asignación rompía en todos los consumidores.

**Fix aplicado**: estrechar `BuiltPrompt.model` a `'sonnet' | 'opus'` en `lib/prompts.ts`. Si Pablo quiere usar nombres completos de modelo (`claude-opus-4-5-...`), tendrá que ampliar el literal explícitamente. Hoy ningún builder devuelve nada que no sea sonnet/opus.

**Commit sugerido**: `fix(prompts): narrow BuiltPrompt.model to literal union so ClaudeRunButton accepts it`

### 3. `next.config.mjs` — `output: 'export'` incompatible con la app real
**Síntoma**: `npm run build` falla con `export const dynamic = "force-dynamic" on page "/api/channels/[channel]/videos/[video]/render" cannot be used with "output: export"`. Mismo bloqueo aplicaría a TODAS las route handlers de la app.

**Causa raíz**: el config tenía `output: process.env.NODE_ENV === 'production' ? 'export' : undefined` con la intención (supuesta) de empaquetar el frontend como bundle estático para Electron. Pero la app actual depende de route handlers en `/api/*` que SIEMPRE son dinámicos (jobs claude, channels, media). Export estático es incompatible con eso por diseño.

**Fix aplicado**: eliminar `output: 'export'` del `next.config.mjs` y dejar un comentario explicando que la app vive en modo server (dev hoy, server Node en producción si se hace release). Si Pablo tenía un plan distinto (mover lógica a IPC Electron o server embebido), tendrá que tomar esa decisión más adelante.

**Decisión documentada porque CAMBIA estrategia de empaquetado**: si Pablo quiere static export, tiene que portar todas las route handlers a IPC o a un server externo. No es un fix trivial.

**Commit sugerido**: `fix(config): remove incompatible static export — app depends on dynamic route handlers`

## Bugs detectados pero NO arreglados

Ninguno. La auditoría no descubrió nada más que requiriera decisión humana o estuviera bloqueado por zona protegida.

## Lo que se revisó y resultó estar limpio

- **`app/api/channels/[channel]/videos/[video]/thumbnail/route.ts`** — no usa `Readable.toWeb`, sirve el buffer entero con `readFile` + `new NextResponse(buf, …)`. No tiene el bug del `Controller closed` que sí tenía `media/route.ts` (arreglado en esta misma sesión, antes de la auditoría). Sin acción.
- **TODOs / FIXMEs / XXX / HACK** en `lib/`, `components/`, `app/`, `electron/` — cero matches reales. Los dos hits que devolvió grep eran la palabra "TODOS" en español dentro de prosa, no marcadores.
- **`console.log` olvidados** — 4 ocurrencias, todas son `console.error` o `console.warn` legítimos de manejo de errores (`electron/main.ts:154`, `components/JobCard.tsx:28`, `app/thumbnails/page.tsx:30`, `lib/supabase.ts:10`). Sin acción.
- **Spawn de `claude` con `--output-format stream-json --verbose`** en `lib/claude-jobs.ts` — sin evidencia de fallo, no se tocó (zona marcada como protegida en CLAUDE.md).

## Estado final

- `npx tsc --noEmit`: ✅ limpio, cero errores.
- `npm run build:next`: ✅ limpio. 28 rutas compiladas, todas las API marcadas como `ƒ (Dynamic)`. Bundle de páginas en rangos sanos (87 kB shared, picos de 162 kB en `/channels/[channel]`).

## Tiempo invertido

Aproximadamente 20 minutos contando build y reintento tras destapar el bug de `output: 'export'`.

## Archivos tocados

- `lib/checklist-resolver.ts` — eliminada variante `unknown` del `ResolverPlan`.
- `lib/prompts.ts` — `BuiltPrompt.model` ahora es `'sonnet' | 'opus'` (sin `| string`).
- `next.config.mjs` — eliminado `output: 'export'` con comentario explicando el motivo.
- `AUDITORIA-2026-05-22.md` — este informe.
