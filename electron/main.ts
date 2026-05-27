import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// `app.isPackaged` es la fuente de verdad cuando corre Electron:
//   - dev (`electron .` directo): false
//   - .exe empaquetado: true
// NO usar NODE_ENV — en .exe no se setea por defecto y la detección falla.
const isDev = !app.isPackaged;
const DEV_URL = 'http://localhost:3001';

// userData en home del usuario (no en el cwd del proyecto).
app.setPath('userData', path.join(os.homedir(), '.yt-content-pipeline'));

let mainWindow: BrowserWindow | null = null;
let nextServerProcess: ChildProcess | null = null;
let nextServerUrl: string | null = null;
let notionPollerInterval: NodeJS.Timeout | null = null;

/** Intervalo del poller Notion. Pablo lo fijó en 30s — ver task brief. */
const NOTION_POLLER_INTERVAL_MS = 30_000;

// ── Next standalone server (sólo en producción) ─────────────────────────

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (typeof addr === 'object' && addr) {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        reject(new Error('No se pudo obtener puerto libre'));
      }
    });
  });
}

/**
 * Arranca el server.js generado por `next build` (standalone output) en un
 * puerto libre. Devuelve la URL para `loadURL`. Sólo se invoca en producción.
 *
 * Layout esperado (electron-builder con files/extraResources configurados):
 *   <app>/resources/app.asar.unpacked/.next/standalone/server.js
 *   <app>/resources/app.asar.unpacked/.next/standalone/.next/static/
 *   <app>/resources/app.asar.unpacked/public/
 *
 * Si standalone no se encuentra (build incompleto o paths mal), tira error.
 */
async function startNextServer(): Promise<string> {
  // `process.resourcesPath` apunta a la carpeta resources del empaquetado.
  // electron-builder está configurado con `extraResources` que copia
  // `.next/standalone` → `resources/standalone/` (ver build config en
  // package.json). En dev este path no es válido, pero startNextServer sólo
  // se llama en producción.
  const standaloneDir = path.join(process.resourcesPath, 'standalone');
  const serverEntry = path.join(standaloneDir, 'server.js');
  if (!existsSync(serverEntry)) {
    throw new Error(`Next standalone server no encontrado en ${serverEntry}. ¿Build incompleto?`);
  }
  const port = await findFreePort();

  const child = spawn(process.execPath, [serverEntry], {
    cwd: standaloneDir,
    detached: false,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      // Electron por defecto setea ELECTRON_RUN_AS_NODE para que el binario
      // se comporte como node puro al ejecutar el server.js standalone.
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  nextServerProcess = child;

  child.stdout?.on('data', (chunk: Buffer) => {
    process.stdout.write(`[next] ${chunk.toString()}`);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(`[next:err] ${chunk.toString()}`);
  });
  child.on('exit', (code) => {
    console.error(`[next] server salió con code=${code}`);
    nextServerProcess = null;
  });

  // Esperar a que el server escuche. Polling cada 200ms con timeout 15s.
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const ok = await fetch(url).then((r) => r.status < 500).catch(() => false);
      if (ok) {
        nextServerUrl = url;
        return url;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Next server no respondió en ${url} tras 15s`);
}

// ── Detección de binario claude ────────────────────────────────────────

function detectClaudeBinary(): { ok: boolean; path?: string; error?: string } {
  try {
    if (process.platform === 'win32') {
      const result = spawnSync('where', ['claude.cmd'], { encoding: 'utf-8', windowsHide: true });
      if (result.status !== 0 || !result.stdout) {
        return { ok: false, error: 'claude.cmd no está en el PATH' };
      }
      return { ok: true, path: result.stdout.trim().split(/\r?\n/)[0] };
    } else {
      const result = spawnSync('which', ['claude'], { encoding: 'utf-8', windowsHide: true });
      if (result.status !== 0 || !result.stdout) {
        return { ok: false, error: 'claude no está en el PATH' };
      }
      return { ok: true, path: result.stdout.trim() };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Notion poller (background interval) ───────────────────────────────

/**
 * Lanza un setInterval que cada 30s hace POST al endpoint /api/notion/sync.
 * El endpoint internamente respeta el toggle `enabled` (no-op si está off) y
 * el backoff exponencial — así esta función NO necesita conocer la lógica del
 * poller. Si el server Next aún no responde, fallamos silenciosamente y
 * reintentamos al siguiente tick.
 *
 * Se llama desde whenReady() después de que el server está arriba.
 */
function startNotionPoller() {
  const baseUrl = isDev ? DEV_URL : nextServerUrl;
  if (!baseUrl) {
    console.warn('[notion-poller] no hay baseUrl, no se arranca');
    return;
  }
  if (notionPollerInterval) return; // ya arrancado

  const tickOnce = async () => {
    try {
      const r = await fetch(`${baseUrl}/api/notion/sync`, { method: 'POST' });
      if (!r.ok) {
        console.warn(`[notion-poller] sync respondió ${r.status}`);
        return;
      }
      const data = (await r.json().catch(() => null)) as
        | { ok: boolean; result?: { matched?: number; processed?: number; reason?: string } }
        | null;
      if (data?.result?.processed && data.result.processed > 0) {
        // Notificación nativa cuando el poller arranca algo
        if (Notification.isSupported()) {
          try {
            new Notification({
              title: 'Notion → SARA',
              body: `${data.result.processed} fila(s) procesadas. ${data.result.matched ?? '?'} marcadas como 🟡 Arrancar.`,
              silent: false,
            }).show();
          } catch {}
        }
      }
    } catch (e) {
      // Silencioso — el server puede estar reiniciando.
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('ECONNREFUSED') && !msg.includes('fetch failed')) {
        console.warn('[notion-poller] tick failed:', msg);
      }
    }
  };

  // Primer tick a los 5s del arranque (deja que la app se estabilice).
  setTimeout(tickOnce, 5_000);
  notionPollerInterval = setInterval(tickOnce, NOTION_POLLER_INTERVAL_MS);
  console.log(`[notion-poller] interval ${NOTION_POLLER_INTERVAL_MS}ms armado (baseUrl=${baseUrl})`);
}

function stopNotionPoller() {
  if (notionPollerInterval) {
    clearInterval(notionPollerInterval);
    notionPollerInterval = null;
  }
}

// ── Auto-updater (electron-updater + GitHub Releases) ──────────────────

/**
 * Configura el updater contra GitHub Releases. Sólo se activa si:
 *   - estamos en producción
 *   - la env var YTCP_UPDATER_ENABLED=1 (toggle para evitar checkForUpdates
 *     cuando todavía no se ha configurado el repo)
 *
 * Cuando Pablo cree el repo y suba el primer release, basta con setear la env
 * var al arrancar la app (o quitar la guard de aquí) para que las siguientes
 * versiones se actualicen solas.
 */
function setupAutoUpdater() {
  if (isDev) return;
  if (process.env.YTCP_UPDATER_ENABLED !== '1') {
    console.log('[updater] desactivado (YTCP_UPDATER_ENABLED!=1). Editar build.publish en package.json y poner la env var a 1 cuando esté el repo.');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err.message);
  });
  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] update disponible: ${info.version}`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    // En vez de un diálogo modal, mandamos un evento al renderer para que
    // pinte un toast inline ("Reiniciar para actualizar" + versión). Si el
    // renderer no responde (ventana cerrada, race), el autoInstallOnAppQuit
    // garantiza que se aplique en el próximo cierre.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:downloaded', { version: info.version });
    }
  });

  // Comprobar al arrancar + cada 4h mientras la app esté abierta.
  autoUpdater.checkForUpdates().catch((e) => console.error('[updater] check failed:', e?.message ?? e));
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);
}

function showClaudeMissingDialog(reason: string) {
  const isWin = process.platform === 'win32';
  const installCmd = isWin
    ? 'npm install -g @anthropic-ai/claude-code'
    : 'npm install -g @anthropic-ai/claude-code';
  dialog.showMessageBoxSync({
    type: 'error',
    title: 'Falta el binario claude',
    message: 'No se encontró el CLI de Claude Code en tu PATH.',
    detail: `Razón: ${reason}\n\nPara instalarlo:\n\n  ${installCmd}\n\nLuego reinicia la app. Si ya lo tienes instalado, asegúrate de que el directorio donde vive está en la variable PATH del sistema y vuelve a abrir Electron.`,
    buttons: ['Cerrar'],
  });
}

function resolveAppIcon(): string | undefined {
  // En dev cargamos desde `build/icon.png` (raíz del proyecto). En producción
  // electron-builder ya copia el icono al .exe vía `win.icon` (package.json).
  // Si el archivo no existe, devolvemos undefined y Electron usa el default.
  const candidate = isDev
    ? path.join(__dirname, '..', 'build', 'icon.png')
    : path.join(process.resourcesPath, 'build', 'icon.png');
  return existsSync(candidate) ? candidate : undefined;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'YouTube Content Pipeline',
    backgroundColor: '#0b0b0e',
    autoHideMenuBar: true,
    icon: resolveAppIcon(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      // Pasamos el flag isDev al preload para que el renderer pueda mostrar
      // el banner "MODO DESARROLLO".
      additionalArguments: [`--ytcp-dev=${isDev ? '1' : '0'}`],
    },
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
    // Nota: NO abrimos DevTools automáticamente. Pulsa F12 / Ctrl+Shift+I si
    // las necesitas. El banner amarillo de arriba indica que estás en dev.
  } else if (nextServerUrl) {
    mainWindow.loadURL(nextServerUrl);
  } else {
    // Fallback defensivo: si por alguna razón el server no arrancó, mostramos
    // una página de error inline en vez de quedarnos en blanco.
    mainWindow.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          '<html><body style="font-family:sans-serif;padding:40px;background:#0b0b0e;color:#fff"><h1>Servidor interno no disponible</h1><p>El servidor Next standalone no pudo arrancar. Revisa el log de la app.</p></body></html>',
        ),
    );
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── IPC handler para que el renderer aplique la actualización ──────────

ipcMain.handle('updater:quit-and-install', () => {
  try {
    autoUpdater.quitAndInstall();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

// ── IPC handler para notificaciones nativas OS ──────────────────────────

ipcMain.on('notify', (_event, opts: { title: string; body: string; kind?: string }) => {
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({
      title: opts.title || 'YouTube Content Pipeline',
      body: opts.body || '',
      silent: false, // suena el ding del OS
    });
    n.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
    n.show();
  } catch (e) {
    console.error('[notify] failed:', e);
  }
});

app.whenReady().then(async () => {
  // 1) Verificar que claude está en el PATH. Si falta, error claro y salimos.
  const claude = detectClaudeBinary();
  if (!claude.ok) {
    showClaudeMissingDialog(claude.error || 'desconocido');
    app.quit();
    return;
  }

  // 2) En producción, arrancar Next standalone server antes de la ventana.
  if (!isDev) {
    try {
      await startNextServer();
    } catch (e) {
      dialog.showMessageBoxSync({
        type: 'error',
        title: 'Error al arrancar la app',
        message: 'No se pudo arrancar el servidor interno.',
        detail: e instanceof Error ? e.message : String(e),
        buttons: ['Cerrar'],
      });
      app.quit();
      return;
    }
  }

  createWindow();
  setupAutoUpdater();
  startNotionPoller();
});

app.on('window-all-closed', () => {
  stopNotionPoller();
  // Matar el server Next si está vivo (sólo en producción)
  if (nextServerProcess) {
    try { nextServerProcess.kill(); } catch {}
    nextServerProcess = null;
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopNotionPoller();
  if (nextServerProcess) {
    try { nextServerProcess.kill(); } catch {}
    nextServerProcess = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Nota: si alguna vez vuelves a abrir este proyecto desde un share de red
// (Y:\ → \\Servidornas\...), Electron muere con "GPU process isn't usable".
// La cura es añadir antes de createWindow():
//   app.disableHardwareAcceleration();
//   app.commandLine.appendSwitch('no-sandbox');
//   app.commandLine.appendSwitch('disable-gpu');
