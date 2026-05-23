# yt-content-pipeline

App de escritorio (Electron + Next.js) — **YouTube Content Pipeline App**.

Ventana de supervisión sobre todo el proceso de producción de YouTube.
La pantalla principal es un **dashboard kanban por canal** que escanea
tu disco `H:\YOUTUBE\<canal>\` y muestra cada vídeo en su estado real
(En producción / Listos para subir / Subidos / Archivados). La aprobación
de miniaturas vía Claude + [`kie-bridge`](../kie-bridge) vive en
`/thumbnails` como vista secundaria.

> **Vive en `C:\dev\yt-content-pipeline\` (SSD local), no en el NAS.**
> Razón: Next.js dev sobre `\\Servidornas\...` arranca en 40-60s. Hay un
> pointer en `Y:\04_DEV\J.A.R.V.I.S\lab\yt-content-pipeline\POINTER.md`.

## Arquitectura

Hay dos sub-sistemas que conviven en la misma app:

### 1. Dashboard de vídeos por canal (pantalla principal)

```
┌──────────────┐        readdir/stat        ┌─────────────────────────┐
│  Electron    │ ─────────────────────────► │  H:\YOUTUBE\<canal>\    │
│  + Next.js   │  /api/channels/[c]/videos  │  _EN PRODUCCIÓN/        │
│              │ ◄───────────────────────── │  _LISTOS PARA SUBIR/    │
│  Kanban UI   │   JSON                     │  _SUBIDOS/              │
│              │                            │  _ARCHIVO/              │
└──────────────┘                            └─────────────────────────┘
```

- La pantalla `/channels/<slug>` escanea las 4 subcarpetas de estado del canal
  y pinta un **kanban** (en producción / listos / subidos / archivados-toggle).
- Cada card lee `_PACKAGING/MINIATURAS/` para el preview y `RENDER/` para
  derivar badges (render OK, número de Shorts, etc.).
- Refresh manual + auto cada 60s. Sin BD para esto — la fuente de verdad
  es el filesystem.
- Configuración de canales en `lib/channels.ts`.

### 2. Aprobación de miniaturas (vista `/thumbnails`)

```
┌──────────────┐  insert job        ┌──────────────────┐
│  Claude Code │ ─────────────────► │  Supabase        │
│  (MCP)       │                    │  thumbnail_jobs  │
└──────────────┘                    └──────────────────┘
                                       │      │
              ┌────────────────────────┘      │ realtime
              │ polling 3s                    ▼
              ▼                       ┌──────────────────┐
   ┌──────────────────┐  upload PNG   │  Electron + Next │
   │  worker.py       │ ────────────► │  (vista          │
   │  kie-bridge      │   bucket      │   /thumbnails)   │
   │  nano-banana-pro │               └──────────────────┘
   └──────────────────┘
```

- **Supabase** (`trnlcfkomjljypzpxejt`, reusado del youtube-dashboard) actúa
  como bus: tabla `thumbnail_jobs` con realtime activado y bucket Storage
  `thumbnails` para los binarios.
- **Worker Python** (`worker/worker.py`) consume `pending`, llama a
  `kie-bridge`, sube el resultado, deja el job en `ready`.
- **App Electron + Next.js** muestra los jobs en realtime y permite decidir
  (`approved` / `rejected` / `discarded`) desde `/thumbnails`.

## Rutas de la app

| Ruta | Qué hace |
|---|---|
| `/` | Picker de canales |
| `/channels/<slug>` | Kanban del canal |
| `/thumbnails` | Aprobación de miniaturas (Supabase realtime) |
| `/api/channels/[channel]/videos` | API que escanea el filesystem |
| `/api/channels/[channel]/videos/[video]/thumbnail` | Sirve la miniatura del vídeo |

## Setup (primera vez)

```powershell
cd C:\dev\yt-content-pipeline
npm install
```

El worker es 100% Python stdlib — **no necesita pip install ni venv**.
Variables ya están en `.env.local` (Supabase URL + anon key del proyecto
youtube-dashboard). La API key de Kie la lee `kie-bridge` de
`C:\Users\pablo\.claude\secrets\kie.json`.

## Día a día

Tres terminales (típico), todas desde la **raíz del proyecto**:

```powershell
cd C:\dev\yt-content-pipeline

# Terminal 1 — app de escritorio (Next.js dev en :3001 + Electron)
npm run dev

# Terminal 2 — worker que escucha jobs
python worker/worker.py

# Terminal 3 — disparar un job de prueba
node scripts/create-test-job.mjs "Test miniatura" "moderni-stoici" "A red fox playing ukulele on a snowy moon, cinematic"
```

## Cómo Claude crea un job

Vía MCP de Supabase (`mcp__f1cefc52...__execute_sql`), proyecto
`trnlcfkomjljypzpxejt`:

```sql
INSERT INTO public.thumbnail_jobs (video_title, channel, prompt, thumbnail_meta)
VALUES (
  'Cómo Marco Aurelio se enfrentaba a la soledad',
  'moderni-stoici',
  'Cinematic dark portrait of Marco Aurelius alone in a dim study, golden light from a candle, eyes downcast in contemplation, oil painting style, dramatic chiaroscuro',
  '{"aspect_ratio":"16:9","resolution":"2K","output_format":"jpg"}'::jsonb
);
```

Inmediatamente:

1. La app muestra una card en `pending` (spinner).
2. El worker la coge, status → `generating`, llama a `nano-banana-pro`.
3. Cuando tiene el binario, lo sube al bucket y deja status → `ready`.
4. Pablo decide (Aprobar / Rechazar con notas / Descartar) desde la app.

## Schema del job

| Campo            | Tipo        | Notas |
|------------------|-------------|-------|
| `id`             | uuid        | PK auto |
| `video_title`    | text        | Obligatorio |
| `channel`        | text        | Opcional (slug, ej. `moderni-stoici`) |
| `status`         | text        | `pending` → `generating` → `ready` → `approved`/`rejected`/`discarded` |
| `prompt`         | text        | Lo que va al modelo |
| `image_url`      | text        | URL pública en el bucket, set por el worker |
| `thumbnail_meta` | jsonb       | `aspect_ratio`, `resolution`, `output_format`, `image_input`, `model` |
| `notes`          | text        | Motivo si rechazas, o error del worker |
| `created_at`     | timestamptz | auto |
| `updated_at`     | timestamptz | auto trigger |
| `decided_at`     | timestamptz | set por la app al aprobar/rechazar/descartar |

> La tabla se llama `thumbnail_jobs` (no `pipeline_jobs`) porque el MVP
> solo gestiona miniaturas. Cuando llegue v0.3 (pipeline multi-paso)
> decidiremos si renombrar o tener tablas hermanas (`script_jobs`,
> `audio_jobs`, `render_jobs`).

## Roadmap

- **v0.1 ✓** Dashboard kanban filesystem-driven (1 canal: Moderni Stoici) + aprobación de miniaturas en `/thumbnails`.
- **v0.2** Activar los 7 canales restantes en `lib/channels.ts`. Vista detalle del vídeo (modal o ruta `/channels/<slug>/videos/<title>`) con packaging.md renderizado.
- **v0.3** Convención de marker `UPLOADED.json` con video_id + URL de YouTube para los `_SUBIDOS/` — visible en la card. Acción "Mover a NAS" desde la card (archivar físicamente).
- **v0.4** Botón "subir a YouTube" con miniatura, descripción, capítulos, tags y programación (YouTube Data API + OAuth, similar a la skill `youtube-seo-optimizer`).
- **v0.5** Webhook desde Notion → crear job de miniatura o de pipeline al pulsar un botón en una BD de Notion.

## Limitaciones conocidas (MVP)

- **Sin auth.** Single-user, RLS abierta. Cuando se exponga fuera del PC, meter auth real.
- **Worker en polling** cada 3s. Suficiente; si en algún momento hace falta latencia menor, migrar a realtime con `realtime-py`.
- **Retries manuales.** Si Kie falla, el job vuelve a `pending` con el error en `notes`. Tienes que decidir si lo descartas desde la app o lo dejas reintentar.
- **No hay file-upload nativo.** Las reference images deben ser URLs públicas (limitación heredada de kie-bridge).

## Gotchas

### Worker y `pyiceberg`

`supabase-py` arrastra `pyiceberg` como transitiva y en Windows + Python 3.14
falla porque exige compilar wheel con MSVC++ Build Tools. Por eso el worker
usa **solo stdlib (urllib + json)** contra la REST API. Si en el futuro
añades deps al worker, recuerda esto antes de meter algo que tire de
binario nativo.

### Lanzar scripts desde la raíz del proyecto

Tanto `node scripts/create-test-job.mjs` como `python worker/worker.py`
se lanzan desde `C:\dev\yt-content-pipeline\`, **no desde `worker/`**. Si
haces `cd worker && node scripts/...` Node busca el script dentro de
worker y no lo encuentra.

### Si vuelves a abrir desde el NAS

Electron muere con "GPU process isn't usable" cuando se ejecuta desde un
path UNC. La cura está documentada como comentario al final de
`electron/main.ts`. No quites el comentario.

### `output: 'export'` vs API routes

`next.config.mjs` tenía `output: 'export'` para producción. Esto **NO es
compatible** con las API routes (`/api/channels/...`) que escanean el
filesystem. Para que el build de producción funcione hay que elegir:

1. Quitar `output: 'export'` y servir Next con un servidor Node embebido
   en Electron (más complejo de empaquetar pero correcto).
2. Mover el scan de filesystem al main process de Electron e IPC con el
   renderer (sin API routes Next).

Por ahora estamos en dev (`NODE_ENV !== 'production'`) donde no aplica
y todo funciona. Decisión pendiente para cuando hagamos el build.

## Estructura

```
yt-content-pipeline/
├── app/                    Next.js App Router (UI)
├── components/             JobCard, StatusPill
├── lib/                    supabase client, types
├── electron/               main process (Electron wrapper)
├── worker/                 Python worker que llama a kie-bridge
├── scripts/                utilidades (create-test-job.mjs)
├── supabase/migrations/    Copia local de la migración aplicada
├── package.json
├── tsconfig.json           (next)
├── electron/tsconfig.json  (electron, salida en dist-electron/)
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
├── .env.local              (Supabase URL + anon key, gitignored)
└── .gitignore
```
