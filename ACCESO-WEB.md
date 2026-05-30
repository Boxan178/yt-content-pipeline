# ACCESO WEB — yt-content-pipeline

> Fecha: 2026-05-27
> Estado: dev server (rama `main`) corriendo y accesible desde Chrome local, LAN y Tailscale.

## TL;DR

| Versión | Cómo se accede | Cuándo usarla |
|---|---|---|
| **Oficial-escritorio** (.exe v0.6.0) | Icono del escritorio / menú inicio | Cuando quieras la app de toda la vida con notificaciones nativas + auto-updater |
| **Dev-web** (rama main, `next dev`) | Chrome → http://localhost:3001 | Para iterar diseño con hot reload o supervisar desde el móvil/portátil |
| **Prod-web** (snapshot compilado) | No arrancada por defecto — ver §5 | Cuando quieras snapshot estable que no se recompile al editar |

El **.exe** y el **dev-web** comparten todo el estado de datos (mismo PC, mismos `H:\YOUTUBE`, `Y:\J.A.R.V.I.S` y `~/.yt-content-pipeline/`). Si la app es la "ventana" sobre tu producción, las dos miran el mismo backend filesystem.

## 1. URLs disponibles ahora mismo

El dev server escucha en `0.0.0.0:3001` (todas las interfaces) — esto significa:

```
http://localhost:3001              → Chrome del propio PC
http://127.0.0.1:3001              → Idem (alias)
http://192.168.1.46:3001           → Otro PC / móvil / tablet en tu WiFi de casa
http://100.86.173.107:3001         → Cualquier dispositivo de tu tailnet, donde sea
```

Los 3 últimos respondieron `HTTP 200` desde este mismo PC (lo testeé al montarlo). Si desde tu móvil o portátil no carga, mira §4 (Tailscale) o §6 (firewall).

## 2. Acceso remoto desde la playa, el sofá, el coworking — Tailscale

Tu PC `pcchidote` (100.86.173.107) está en tu tailnet junto a `jarvis-vps`. **No necesitas Cloudflare, ngrok, ni montar VPS** — Tailscale ya te resuelve el acceso remoto seguro.

### Lista de requisitos (todo lo que se necesita)

1. ✅ **PC encendido en casa** con el dev server corriendo (no hibernación; suspensión rompe la conexión)
2. ✅ **Dispositivo cliente** (portátil / móvil / iPad) con la app Tailscale instalada y logueada con `p.navas.04@gmail.com`
3. ✅ **Conexión a internet** del cliente — cualquiera, móvil 4G/5G también vale

### Cómo conectarte desde el portátil/móvil

- **Opción A (recomendada)**: navegar a `http://100.86.173.107:3001`
- **Opción B**: si tienes activado MagicDNS en Tailscale, navegar a `http://pcchidote:3001`

Si Tailscale no resuelve el hostname, fíjate por IP. La IP es estable (Tailscale asigna IP por dispositivo y la persiste).

### Mini-cheatsheet para verificar que el PC está accesible desde fuera

Desde el portátil (cuando estés fuera):
```powershell
# Comprobar conectividad de Tailscale
tailscale ping pcchidote

# Comprobar HTTP
curl http://100.86.173.107:3001
```

Si el ping de Tailscale no llega, **el PC se suspendió**. Mira §6 (mantener vivo).

## 3. Funcionalidad disponible en web vs .exe

Auditado el 2026-05-27. La app es **100% web-compat** — no hay rutas bloqueantes.

### Funciona idéntico en ambos
- Kanban de canales (`/channels/[slug]`)
- Modal de detalle de vídeo: reproductores, miniaturas, packaging, checklist
- Botones de skills (SARA, ELENA, AMELIA, MARCUS, LUIS, NORA+IRIS, MARIO, test-72h)
- Jobs persistentes (.claude-jobs/), polling, aprobación
- `/lab` (visible solo en dev / no en .exe — sin cambios)
- `/automator`, `/scheduled`, `/notifications`
- ChatDock derecho (SSE contra `/api/claude/chat`)
- Gamification (XP via localStorage, toasts in-app)

### Solo en .exe (degradación silenciosa en web)
- Notificaciones nativas del SO (en web cae a la Notification API del navegador si el usuario da permiso)
- Toast del auto-updater (irrelevante en web)
- Banner "MODO DESARROLLO" (en web detecta por `location.hostname === 'localhost'` que cuenta como dev)

**Conclusión**: para producir y supervisar, ambas son intercambiables. El .exe es "más bonito" en el OS, la web es "accesible desde cualquier lado".

## 4. Cómo apagar / relanzar el dev server

### Comprobar si está vivo
```powershell
Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
```
Si devuelve algo, está vivo. Si no, está muerto.

### Apagar
```powershell
# Mata todo lo que escuche en 3001 (limpio: identifica PID y stop)
$pid = (Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue).OwningProcess
if ($pid) { Stop-Process -Id $pid -Force }
```

### Relanzar
```powershell
cd C:\dev\yt-content-pipeline
npm run dev:next     # solo Next, sin Electron
# o
npm run dev          # Next + Electron a la vez
```

> El proceso actual es huérfano-desacoplado: su parent original ya murió pero los hijos siguen vivos. Sobrevive a cerrar cualquier terminal. **Solo se muere si Pablo lo mata o el PC se reinicia.**

## 5. Apéndice — Arrancar también la versión PROD compilada (snapshot estable)

Esto te da una segunda URL paralela en `:3002` con el código actual de `main` pero **compilado** (no recompila al guardar archivos, runtime más rápido, refleja exactamente cómo se vería el .exe servido vía Electron).

⚠️ **Antes de hacerlo, entiende esto**:

- Necesita un **git worktree** porque `npm run build` borra `.next/` y rompería el dev server en marcha.
- Necesita `npm install` en el worktree (~3-5 min, otro `node_modules` duplicado, ~1 GB de disco).
- **localStorage divergente**: cada origen (`:3001` y `:3002`) tiene su propio almacén — XP, settings, dedup de gamification se duplican.
- **No hay aislamiento de filesystem**: ambas tocan los mismos `H:\YOUTUBE`, `Y:\J.A.R.V.I.S` y `~/.yt-content-pipeline/`. Si lanzas el mismo job desde ambas URLs, **se ejecuta dos veces**.

### Receta paso a paso (cuando lo quieras)

```powershell
# 1) Crear worktree desde la rama main (sin tocar el árbol principal)
git -C C:\dev\yt-content-pipeline worktree add C:\dev\yt-content-pipeline-prod main

# 2) Instalar deps en el worktree (un solo node_modules paralelo)
cd C:\dev\yt-content-pipeline-prod
npm install

# 3) Recrear el symlink de skills (los worktrees no lo heredan — ver CLAUDE.md)
cmd /c "mklink /D `"C:\dev\yt-content-pipeline-prod\.claude\skills`" `"\\Servidornas\naspablo\04_DEV\J.A.R.V.I.S\.claude\skills`""

# 4) Build (toca solo el worktree)
npm run build

# 5) Arrancar el standalone server en :3002 escuchando en todas las interfaces
$env:PORT=3002; $env:HOSTNAME='0.0.0.0'; $env:NODE_ENV='production'
node .next\standalone\server.js
```

Para acceder: `http://localhost:3002`, `http://192.168.1.46:3002`, `http://100.86.173.107:3002` (mismas tres modalidades que :3001).

Para apagar: `Ctrl+C` en la terminal donde corre. Para borrar el worktree cuando ya no lo quieras: `git worktree remove C:\dev\yt-content-pipeline-prod`.

## 6. Seguridad y mantenimiento

### Exposición de la app en LAN

El dev server escucha en `0.0.0.0:3001`, lo que significa **cualquier dispositivo de tu red WiFi puede acceder**. En tu casa (red de confianza) es OK. Pero:

- Si tienes invitados conectados a tu WiFi, pueden tocar la API sin auth.
- Si vas a un coworking y te llevas el portátil con `npm run dev`, eso expone la app en su red.

**Mitigación si te preocupa**:
- Tailscale es seguro por defecto (solo dispositivos del tailnet acceden). Si quitas la regla de firewall y solo permites tráfico desde `100.0.0.0/8`, cierras la LAN y mantienes el remote vía Tailscale.
- Auth real (Supabase Auth, NextAuth) — ver §5 de `ESTABILIZACION-2026-05-24.md`. No urgente para single-user en casa.

### Mantener el PC accesible cuando no estás

- **Suspensión / hibernación** mata Tailscale. Configura Power Options → Sleep → Never (al menos en "When plugged in").
- **Wake on LAN** requiere config BIOS + cable Ethernet — si la conexión es por WiFi, no funciona estándar.
- **Reinicios automáticos por Windows Update**: programa el horario fuera de las horas que sueles estar fuera. Y deja un script en `shell:startup` que arranque `npm run dev` (TODO opcional, no implementado).

### Si el PC se queda colgado mientras estás fuera

Sin acceso físico no hay solución elegante. Mitigaciones futuras:
- Tarea programada Windows que reinicie `next dev` si el puerto 3001 deja de responder (script de auto-restart cada 5 min)
- PM2 (Node) para ejecutar `next dev` como servicio con auto-restart

No urgente. Si pasa una vez, lo monto. Si pasa más, hay que automatizarlo.

## 7. Referencias

- `ESTABILIZACION-2026-05-24.md` — auditoría actual (estado de salud, no toca el setup web)
- `electron/main.ts:14, 57-112` — cómo el .exe arranca su propio Next server en puerto random localhost (no expuesto a web)
- `package.json:9-11` — scripts `dev:next`, `dev:electron`, `dev`
- Tailscale admin: https://login.tailscale.com/admin/machines (asegúrate de que `pcchidote` aparece online cuando estás fuera)

---

_Documento creado durante la sesión 2026-05-27 antes de que Pablo dejara el PC produciendo. Si alguna URL deja de funcionar, empezar por §4._
