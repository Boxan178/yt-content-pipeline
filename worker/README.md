# worker

Loop de Python que consume `thumbnail_jobs` con `status='pending'`, dispara
`kie-bridge` (`nano-banana-pro` por defecto), sube el resultado al bucket
`thumbnails` y deja el job en `status='ready'` con `image_url` apuntando
a la URL pública.

## Levantar

**No necesita venv ni pip install.** El worker usa solo stdlib de Python
(urllib + json) para hablar con Supabase REST y Storage REST.

```powershell
cd Y:/04_DEV/J.A.R.V.I.S/lab/thumbnail-generator/worker
python worker.py
```

Lee `../.env.local` para las credenciales de Supabase y `~/.claude/secrets/kie.json`
para la API key de Kie (vía kie-bridge).

> Nota: si ya creaste `.venv` antes, déjalo. No molesta. Pero ya no hace
> falta activarlo.

## Por qué cero deps

Probamos con `supabase-py` y arrastra `pyiceberg` como transitiva, que
en Windows + Python 3.14 falla porque exige MSVC++ Build Tools para
compilar wheel propio. La REST API de Supabase + Storage REST es
trivial de llamar con urllib, así que prescindimos del SDK entero.

## Schema del campo `thumbnail_meta`

Opcional; controla qué pasa al modelo. Default: `nano-banana-pro` a 16:9 2K JPG.

```json
{
  "model": "nano-banana-pro",
  "aspect_ratio": "16:9",
  "resolution": "2K",
  "output_format": "jpg",
  "image_input": ["https://...ref1.jpg", "https://...ref2.jpg"]
}
```

## Manejo de errores

Si Kie devuelve error, el worker pone el job de vuelta en `pending` y guarda
el mensaje en `notes`. Así el job se reintenta en el siguiente ciclo si lo
desbloqueas tú a mano, o lo descartas desde la app.
