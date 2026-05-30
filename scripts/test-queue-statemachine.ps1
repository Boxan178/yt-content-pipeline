<#
  test-queue-statemachine.ps1
  --------------------------------------------------------------------------
  Test de regresion del state machine de la cola (lib/job-queue.ts -> tickQueue).

  Ejercita las transiciones criticas del loop "video de principio a fin" con
  fixtures controlados (job falso + log NDJSON falso + progreso falso en disco),
  conduciendo la logica REAL del server via GET /api/queue. NINGUN caso spawnea
  SARA real: todos terminan en done / blocked / failed / cancelled, nunca en el
  branch de relaunch.

  Requisitos:
    - Dev server corriendo en :3001  (npm run dev:next)
    - Acceso a H:\YOUTUBE (los fixtures viven en H:\YOUTUBE\_YTCP_TEST)

  Seguridad:
    - Hace backup de ~/.yt-content-pipeline/queue.json y lo restaura al final.
    - Borra los fixtures al terminar.

  Uso:  powershell -ExecutionPolicy Bypass -File scripts\test-queue-statemachine.ps1
#>

$ErrorActionPreference = 'Stop'
$base     = 'http://localhost:3001'
$userHome = $env:USERPROFILE
$qf       = Join-Path $userHome '.yt-content-pipeline\queue.json'
$qbak     = Join-Path $userHome '.yt-content-pipeline\queue.statemachine-testbak.json'
$fixRoot  = 'H:\YOUTUBE\_YTCP_TEST'
$utf8     = New-Object System.Text.UTF8Encoding $false
# _VIDEO con I-acentuada construida por codepoint para no depender de como
# PowerShell 5.1 lee el encoding de este .ps1 (evita mojibake en la ruta).
$videoSub = "01_BRUTOS\_V$([char]0x00CD)DEO"

$script:results = @()
function Check($name, $cond, $detail) {
  $script:results += [pscustomobject]@{ Case = $name; Pass = [bool]$cond; Detail = $detail }
  $tag = if ($cond) { 'PASS' } else { 'FAIL' }
  Write-Host ("[{0}] {1} -- {2}" -f $tag, $name, $detail)
}

function Write-Queue($items) {
  $arr = @($items)
  $itemJson = ($arr | ForEach-Object { $_ | ConvertTo-Json -Depth 12 -Compress }) -join ','
  $json = '{"version":1,"items":[' + $itemJson + ']}'
  [System.IO.File]::WriteAllText($qf, $json, $utf8)
}

function Invoke-Tick {
  $r = Invoke-RestMethod -Uri "$base/api/queue" -Method Get -TimeoutSec 40
  return $r.queue
}

function New-Item-Id { [guid]::NewGuid().ToString() }

function Assistant-Log($text) {
  $ev = @{ type = 'assistant'; message = @{ content = @(@{ type = 'text'; text = $text }) } }
  return "[ytcp claude-job] header`n" + ($ev | ConvertTo-Json -Depth 6 -Compress)
}

function New-FakeJob($vf, $jobId, $status, $logText, $startedAtIso, $timeoutMs) {
  $jdir = Join-Path $vf '.claude-jobs'
  New-Item -ItemType Directory -Force -Path $jdir | Out-Null
  $logPath  = Join-Path $jdir "$jobId.log"
  $jsonPath = Join-Path $jdir "$jobId.json"
  [System.IO.File]::WriteAllText($logPath, $logText, $utf8)
  $job = [ordered]@{
    jobId = $jobId; pid = 999999; skill = 'sara'; label = 'test'; status = $status
    startedAt = $startedAtIso; prompt = 'test'; cwd = 'Y:/'; logPath = $logPath
    jobPath = $jsonPath; videoFolder = ($vf -replace '\\','/'); timeoutMs = $timeoutMs; model = 'opus'
  }
  [System.IO.File]::WriteAllText($jsonPath, ($job | ConvertTo-Json -Depth 6), $utf8)
}

function New-Fixture($name, [string[]]$milestones) {
  $vf = Join-Path $fixRoot $name
  if (Test-Path $vf) { Remove-Item -Recurse -Force $vf }
  New-Item -ItemType Directory -Force -Path $vf | Out-Null
  if ($milestones -contains 'script') {
    $pk = Join-Path $vf '_PACKAGING'
    New-Item -ItemType Directory -Force -Path $pk | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $pk 'packaging.md'), ('# packaging' + ("`nlorem ipsum dolor" * 200)), $utf8)
  }
  if ($milestones -contains 'mini') {
    $md = Join-Path $vf '_PACKAGING\MINIATURAS'
    New-Item -ItemType Directory -Force -Path $md | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $md 'thumb.jpg'), 'JPEGDATA', $utf8)
  }
  if ($milestones -contains 'loc') {
    $ld = Join-Path $vf '01_BRUTOS\_LOCUCION'
    New-Item -ItemType Directory -Force -Path $ld | Out-Null
    & fsutil file createnew (Join-Path $ld 'narration.mp3') 400000 | Out-Null
  }
  if ($milestones -contains 'brutos') {
    $bd = Join-Path $vf $videoSub
    New-Item -ItemType Directory -Force -Path $bd | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $bd 'clip.mp4'), 'MP4', $utf8)
  }
  if ($milestones -contains 'render') {
    $rd = Join-Path $vf 'RENDER'
    New-Item -ItemType Directory -Force -Path $rd | Out-Null
    & fsutil file createnew (Join-Path $rd 'final.mp4') 53000000 | Out-Null
  }
  return $vf
}

function Base-Item($id, $vf, $extra) {
  $it = [ordered]@{
    id = $id; skill = 'sara'; label = 'test'; videoFolder = ($vf -replace '\\','/')
    videoTitle = 'test'; prompt = 'test'; cwd = 'Y:/'; timeoutMs = 1800000
    status = 'running'; addedAt = (Get-Date).ToUniversalTime().ToString('o')
  }
  foreach ($k in $extra.Keys) { $it[$k] = $extra[$k] }
  return $it
}

$nowIso = (Get-Date).ToUniversalTime().ToString('o')

# Backup de la cola real
if (Test-Path $qf) { Copy-Item $qf $qbak -Force }

try {
  Write-Host "=== Test state machine de la cola ===`n"

  # TC1 -- VIDEO_DONE marker => done
  $id = New-Item-Id
  $vf = New-Fixture 'tc1' @()
  New-FakeJob $vf $id 'running' (Assistant-Log "Trabajo hecho.`n<<<VIDEO_DONE>>>") $nowIso 1800000
  Write-Queue @(Base-Item $id $vf @{ jobId = $id; loopUntilComplete = $true })
  $q = Invoke-Tick
  $it = $q.items | Where-Object { $_.id -eq $id }
  Check 'TC1 done-by-VIDEO_DONE' ($it.status -eq 'done') "status=$($it.status)"

  # TC2 -- VIDEO_BLOCKED marker => blocked + reason
  $id = New-Item-Id
  $vf = New-Fixture 'tc2' @()
  New-FakeJob $vf $id 'running' (Assistant-Log "No puedo seguir.`n<<<VIDEO_BLOCKED: Pablo debe elegir titulo>>>") $nowIso 1800000
  Write-Queue @(Base-Item $id $vf @{ jobId = $id; loopUntilComplete = $true })
  $q = Invoke-Tick
  $it = $q.items | Where-Object { $_.id -eq $id }
  Check 'TC2 blocked-by-VIDEO_BLOCKED' (($it.status -eq 'blocked') -and ($it.blockReason -like '*elegir titulo*')) "status=$($it.status) reason=$($it.blockReason)"

  # TC3 -- progreso 100% => done
  $id = New-Item-Id
  $vf = New-Fixture 'tc3' @('script','loc','brutos','render','mini')
  New-FakeJob $vf $id 'running' (Assistant-Log "Sigo trabajando, sin marcador.") $nowIso 1800000
  Write-Queue @(Base-Item $id $vf @{ jobId = $id; loopUntilComplete = $true })
  $q = Invoke-Tick
  $it = $q.items | Where-Object { $_.id -eq $id }
  Check 'TC3 done-by-progress-100' (($it.status -eq 'done') -and ($it.lastPercent -eq 100)) "status=$($it.status) pct=$($it.lastPercent)"

  # TC4 -- estancamiento (2 turnos sin avance) => blocked
  $id = New-Item-Id
  $vf = New-Fixture 'tc4' @()
  New-FakeJob $vf $id 'running' (Assistant-Log "Sin marcador, sin progreso.") $nowIso 1800000
  Write-Queue @(Base-Item $id $vf @{ jobId = $id; loopUntilComplete = $true; lastPercent = 40; stalledRuns = 1; attempts = 2 })
  $q = Invoke-Tick
  $it = $q.items | Where-Object { $_.id -eq $id }
  Check 'TC4 stall-2runs => blocked' (($it.status -eq 'blocked') -and ($it.blockReason -like '*Sin avance*')) "status=$($it.status) reason=$($it.blockReason)"

  # TC5 -- maxAttempts alcanzado (sin estancamiento) => blocked
  $id = New-Item-Id
  $vf = New-Fixture 'tc5' @('script')   # ~33% > lastPercent 0 => no stall
  New-FakeJob $vf $id 'running' (Assistant-Log "Sin marcador.") $nowIso 1800000
  Write-Queue @(Base-Item $id $vf @{ jobId = $id; loopUntilComplete = $true; attempts = 6; maxAttempts = 6; lastPercent = 0 })
  $q = Invoke-Tick
  $it = $q.items | Where-Object { $_.id -eq $id }
  Check 'TC5 maxAttempts => blocked' (($it.status -eq 'blocked') -and ($it.blockReason -like '*ximo*')) "status=$($it.status) reason=$($it.blockReason)"

  # TC6 -- skill de un solo paso (no-loop): job done => item done
  $id = New-Item-Id
  $vf = New-Fixture 'tc6' @()
  New-FakeJob $vf $id 'running' (Assistant-Log "render hecho") $nowIso 2700000
  $it6 = Base-Item $id $vf @{ jobId = $id; loopUntilComplete = $false }
  $it6.skill = 'luis'
  Write-Queue @($it6)
  $q = Invoke-Tick
  $it = $q.items | Where-Object { $_.id -eq $id }
  Check 'TC6 single-step luis => done' ($it.status -eq 'done') "status=$($it.status)"

  # TC7 -- job cancelado => item cancelled
  $id = New-Item-Id
  $vf = New-Fixture 'tc7' @()
  New-FakeJob $vf $id 'cancelled' (Assistant-Log "cancelado") $nowIso 1800000
  Write-Queue @(Base-Item $id $vf @{ jobId = $id; loopUntilComplete = $true })
  $q = Invoke-Tick
  $it = $q.items | Where-Object { $_.id -eq $id }
  Check 'TC7 job-cancelled => cancelled' ($it.status -eq 'cancelled') "status=$($it.status)"

  # TC8 -- item running sin jobId => failed
  $id = New-Item-Id
  $vf = New-Fixture 'tc8' @()
  Write-Queue @(Base-Item $id $vf @{ loopUntilComplete = $true })   # sin jobId
  $q = Invoke-Tick
  $it = $q.items | Where-Object { $_.id -eq $id }
  Check 'TC8 no-jobId => failed' (($it.status -eq 'failed') -and ($it.failReason -like '*jobId*')) "status=$($it.status) reason=$($it.failReason)"

  # TC9 -- jobId presente pero job inexistente en disco => failed
  $id = New-Item-Id
  $vf = New-Fixture 'tc9' @()
  Write-Queue @(Base-Item $id $vf @{ jobId = 'ghost-no-existe'; loopUntilComplete = $true })
  $q = Invoke-Tick
  $it = $q.items | Where-Object { $_.id -eq $id }
  Check 'TC9 job-missing => failed' (($it.status -eq 'failed') -and ($it.failReason -like '*desapareci*')) "status=$($it.status) reason=$($it.failReason)"

}
finally {
  # Restaurar cola real y limpiar fixtures
  if (Test-Path $qbak) { Copy-Item $qbak $qf -Force; Remove-Item $qbak -Force }
  if (Test-Path $fixRoot) { Remove-Item -Recurse -Force $fixRoot }
}

$pass = ($script:results | Where-Object { $_.Pass }).Count
$total = $script:results.Count
Write-Host ("`n=== RESULTADO: {0}/{1} PASS ===" -f $pass, $total)
$script:results | Format-Table Case, Pass, Detail -AutoSize
if ($pass -ne $total) { exit 1 } else { exit 0 }
