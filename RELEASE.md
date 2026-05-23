# Release & auto-update — yt-content-pipeline

Guía corta para empaquetar la app y distribuirla con auto-update vía GitHub Releases.

## 1. Empaquetar localmente (sin publicar)

```powershell
cd C:\dev\yt-content-pipeline
npm install              # primera vez: añade electron-builder y electron-updater
npm run dist             # genera installer NSIS + portable en .\release\
```

Los binarios resultantes:
- `release\YT Content Pipeline-Setup-0.1.0.exe` ← installer NSIS (con wizard, accesos directos, desinstalador).
- `release\YT Content Pipeline-Portable-0.1.0.exe` ← portable, ejecútalo donde sea sin instalar.

Para llevarlo al portátil: copia el `.exe` que prefieras (probablemente el portable) por USB / Drive / lo que sea.

## 2. Setup de GitHub Releases (una vez)

El auto-updater apunta a un repo en GitHub. Hoy `package.json > build.publish.owner` tiene el placeholder `GITHUB_OWNER_REPLACE_ME`. Pasos:

```powershell
# Inicializar repo local (la primera vez, hoy NO es repo git)
cd C:\dev\yt-content-pipeline
git init
git add .
git commit -m "Initial commit"

# Crear el repo en GitHub (necesita gh CLI autenticado)
gh repo create yt-content-pipeline --private --source=. --remote=origin --push
```

Anota el `owner` (tu usuario o la organización). En este caso típicamente `p-navas-04` o similar.

Edita `package.json` y sustituye:
```json
"publish": [
  {
    "provider": "github",
    "owner": "GITHUB_OWNER_REPLACE_ME",   ← pon aquí tu user/org real
    "repo": "yt-content-pipeline",
    "releaseType": "release"
  }
]
```

Commit el cambio:
```powershell
git add package.json
git commit -m "Configure GitHub Releases owner for auto-update"
git push
```

## 3. Generar un personal access token (PAT) para publicar

`electron-builder` necesita un token para subir los binarios a Releases.

1. Ve a https://github.com/settings/tokens?type=beta
2. **Generate new token** → Fine-grained → scope: solo `yt-content-pipeline` → permissions: `Contents: read/write`, `Metadata: read`.
3. Copia el token y guárdalo en `C:\Users\pablo\.ytcp-gh-token` (sin saltos de línea, sólo el token).
4. Al hacer release, set la env var:

```powershell
$env:GH_TOKEN = (Get-Content C:\Users\pablo\.ytcp-gh-token -Raw).Trim()
npm run release
```

`npm run release` ejecuta `electron-builder --publish always`, que sube el installer + portable + `latest.yml` (metadata para el updater) a un release nuevo en GitHub.

## 4. Activar el auto-updater en la app

Por defecto está **desactivado** para no fallar mientras no haya repo. Cuando ya tengas el primer release subido:

- En cualquier lanzador / acceso directo de la app, añade `set YTCP_UPDATER_ENABLED=1` antes de invocar el `.exe`.
- Alternativa más limpia: edita `electron/main.ts` línea de `if (process.env.YTCP_UPDATER_ENABLED !== '1') return;` y quita la guard. A partir de ese build, la app comprueba updates al arrancar y cada 4h.

## 5. Versionado y publicación de nuevas versiones

1. Bumpa la versión en `package.json` (`"version": "0.1.0"` → `"0.2.0"`).
2. Commit + push.
3. `npm run release` desde tu máquina (con `GH_TOKEN` exportado).
4. Las apps existentes detectan la nueva versión la próxima vez que se abran (o en la siguiente check cada 4h) y descargan en background. Al cerrar la app o al pulsar "Reiniciar ahora", se aplica.

## Notas

- El `claude` CLI **debe estar instalado en el sistema target** (`npm i -g @anthropic-ai/claude-code`). La app comprueba al arrancar y muestra un diálogo de error si falta.
- El bundle NO incluye Python ni `kie-bridge` — si lo necesitas en el portátil, replica los venvs / paths a mano.
- La app SIGUE asumiendo que `H:\YOUTUBE\` y `Y:\04_DEV\J.A.R.V.I.S` son rutas válidas. En casa el portátil tiene esas letras mapeadas al NAS → funciona idéntico. Fuera de casa, fuera de alcance hasta que se porte la "memoria" a algo online.
