$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
$Port = 8741
$PidFile = Join-Path $Root ".pitch-reader.pid"
$stopped = $false

function Stop-ByPid([string]$ProcessId) {
  if (-not $ProcessId) { return $false }
  $idNumber = 0
  if (-not [int]::TryParse("$ProcessId", [ref]$idNumber)) { return $false }
  if ($idNumber -le 10) { return $false }
  & taskkill.exe /F /T /PID $idNumber > $null 2>&1
  return $LASTEXITCODE -eq 0
}

if (Test-Path $PidFile) {
  $saved = Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if (Stop-ByPid $saved) { $stopped = $true }
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

$listeners = @()
try {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($conns) {
    $listeners = @($conns | Select-Object -ExpandProperty OwningProcess -Unique)
  }
} catch {
  $listeners = @()
}
if ($listeners.Count -eq 0) {
  $lines = netstat -ano | Select-String ":$Port\s"
  foreach ($line in $lines) {
    if ($line.Line -match "(LISTENING|侦听)\s+(\d+)\s*$") {
      $listeners += [int]$Matches[2]
    }
  }
}

foreach ($listener in @($listeners | Select-Object -Unique)) {
  if (Stop-ByPid "$listener") { $stopped = $true }
}

if ($stopped) {
  Write-Host "已关闭音高朗读。"
} else {
  Write-Host "没有发现正在运行的音高朗读。"
}
Start-Sleep -Seconds 2
