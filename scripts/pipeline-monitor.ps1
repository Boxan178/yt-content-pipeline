# Vigía del pipeline (prueba de lava). Comprueba DE VERDAD: Algrow vivo, vídeos
# bloqueados/fallidos, avance real del job activo (por su jobId, no "el más reciente").
# Heartbeat real cada 5 min a Telegram; sale (y despierta a Claude) en eventos:
#   exit 0 PROGRESS (un vídeo más listo) · 2 RENDER · 4 FAILED · 5 BLOCKED · 7 STUCK · 8 ALGROW_DOWN · 3 deadline
$base = "http://localhost:3001"
$prod = "H:\YOUTUBE\CANALES ESTOICISMO\MODERNI STOICI\_EN PRODUCCIÓN"
$hbSec = 300
$lastHB = (Get-Date).AddSeconds(-310)
$deadline = (Get-Date).AddHours(3)
$lastActive = ''; $lastLoc = -1; $lastLocT = (Get-Date)
function HB($m) { try { $b = @{ text = $m } | ConvertTo-Json; $by = [System.Text.Encoding]::UTF8.GetBytes($b); Invoke-RestMethod -Uri "$base/api/telegram/notify" -Method POST -Body $by -ContentType "application/json; charset=utf-8" -TimeoutSec 15 | Out-Null } catch {} }
function JobFolder($jobId) { foreach ($d in (Get-ChildItem -LiteralPath $prod -Directory)) { if (Test-Path -LiteralPath (Join-Path $d.FullName ".claude-jobs\$jobId.json")) { return $d.FullName } } return $null }
try { $q0 = Invoke-RestMethod -Uri "$base/api/queue" -TimeoutSec 10; $baseDone = @($q0.queue.items | Where-Object { $_.status -eq 'done' } | Select-Object -ExpandProperty videoFolder -Unique).Count; $baseBlocked = @($q0.queue.items | Where-Object { $_.status -eq 'blocked' }).Count } catch { $baseDone = 0; $baseBlocked = 0 }
while ((Get-Date) -lt $deadline) {
  $alg = '?'; try { $h = Invoke-RestMethod -Uri "$base/api/health/algrow" -TimeoutSec 12; if ($h.up) { $alg = 'OK' } else { $alg = 'CAIDO' } } catch { $alg = '?' }
  if ($alg -eq 'CAIDO') { HB("🔴 ALERTA: Algrow CAÍDO — voz/miniaturas no se generan. Reviso."); "ALGROW_DOWN"; exit 8 }
  try {
    $q = Invoke-RestMethod -Uri "$base/api/queue" -TimeoutSec 12; $items = $q.queue.items
    if (@($items | Where-Object { $_.status -eq 'failed' }).Count -gt 0) { HB("🔴 ALERTA: un vídeo FALLÓ. Reviso ya."); "FAILED"; exit 4 }
    foreach ($d in (Get-ChildItem -LiteralPath $prod -Directory)) { $mp4 = Get-ChildItem -LiteralPath (Join-Path $d.FullName "RENDER") -Filter *.mp4 -ErrorAction SilentlyContinue | Where-Object { $_.Length -gt 50MB }; if ($mp4) { HB("⚠️ ALARMA: render en «$($d.Name)» (no debería en pre-edit)."); "ALARM_RENDER"; exit 2 } }
    $blocked = @($items | Where-Object { $_.status -eq 'blocked' }).Count
    if ($blocked -gt $baseBlocked) { HB("⚠️ ALERTA: un vídeo se BLOQUEÓ (total $blocked). Reviso."); "NEW_BLOCKED=$blocked"; exit 5 }
    $done = @($items | Where-Object { $_.status -eq 'done' } | Select-Object -ExpandProperty videoFolder -Unique).Count
    if ($done -gt $baseDone) { "PROGRESS uniqueDone=$done"; exit 0 }
    $run = $items | Where-Object { $_.status -eq 'running' } | Select-Object -First 1
    $stage = 'idle'; $title = '(cola)'; $turnMin = 0; $loc = 0
    if ($run) {
      $fol = JobFolder $run.jobId
      if ($fol) {
        $title = Split-Path $fol -Leaf
        $pkg = Test-Path (Join-Path $fol "_PACKAGING\packaging.md"); $loc = @(Get-ChildItem -LiteralPath (Join-Path $fol "01_BRUTOS\_LOCUCION") -Filter *.mp3 -ErrorAction SilentlyContinue).Count; $ttsj = Test-Path (Join-Path $fol "01_BRUTOS\_LOCUCION\tts-jobs.json"); $mini = @(Get-ChildItem -LiteralPath (Join-Path $fol "_PACKAGING\MINIATURAS") -Include *.png, *.jpg, *.jpeg, *.webp -Recurse -ErrorAction SilentlyContinue).Count
        if (-not $pkg) { $stage = 'packaging' } elseif ($loc -eq 0 -and $ttsj) { $stage = 'generando voz' } elseif ($loc -eq 0) { $stage = 'guion' } elseif ($mini -eq 0) { $stage = 'miniatura' } else { $stage = 'casi listo' }
        $j = Get-Content -LiteralPath (Join-Path $fol ".claude-jobs\$($run.jobId).json") -Raw | ConvertFrom-Json; $turnMin = [math]::Round(([DateTime]::UtcNow - [DateTime]::Parse($j.startedAt).ToUniversalTime()).TotalMinutes, 0)
      } else { $title = $run.videoTitle }
    }
    if ($title -ne $lastActive) { $lastActive = $title; $lastLoc = $loc; $lastLocT = (Get-Date) } elseif ($loc -ne $lastLoc) { $lastLoc = $loc; $lastLocT = (Get-Date) }
    $locFroz = [int]((Get-Date) - $lastLocT).TotalMinutes
    if ($run -and (($loc -gt 0 -and $locFroz -gt 40) -or ($turnMin -gt 80))) { HB("⚠️ ALERTA: «$($title.Substring(0,[Math]::Min(34,$title.Length)))» atascado (fase $stage, turno ${turnMin}m, voz sin avance ${locFroz}m). Desatasco."); "STUCK turn=$turnMin locFroz=$locFroz"; exit 7 }
    if ((((Get-Date) - $lastHB).TotalSeconds) -ge $hbSec) { $pct = [int]($done / 6 * 100); HB("✅ Algrow $alg · $done/6 listos (~$pct%) · ahora: «$($title.Substring(0,[Math]::Min(34,$title.Length)))» (fase $stage, ${turnMin}m, $loc mp3)"); $lastHB = (Get-Date) }
  } catch {}
  Start-Sleep -Seconds 45
}
"HEARTBEAT_DEADLINE done=$baseDone"; exit 3
