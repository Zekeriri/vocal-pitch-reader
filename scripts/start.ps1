$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$Port = 8741
$Url = "http://127.0.0.1:$Port/"
$PidFile = Join-Path $Root ".pitch-reader.pid"

function Get-ListenerPids {
  $found = @()
  try {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
      $found = @($conns | Select-Object -ExpandProperty OwningProcess -Unique)
    }
  } catch {
    $found = @()
  }
  if ($found.Count -eq 0) {
    $lines = netstat -ano | Select-String ":$Port\s"
    foreach ($line in $lines) {
      if ($line.Line -match "(LISTENING|侦听)\s+(\d+)\s*$") {
        $found += [int]$Matches[2]
      }
    }
  }
  return @($found | Select-Object -Unique)
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "没有找到 Node.js。请先安装 Node.js 22 或更新版本，装好后重新双击 start.bat。"
  Write-Host "https://nodejs.org/"
  Read-Host "按回车键关闭"
  exit 1
}

$listening = @(Get-ListenerPids)
if ($listening.Count -gt 0) {
  Write-Host "音高朗读已经在运行，正在打开浏览器。"
  Start-Process $Url
  Start-Sleep -Seconds 2
  exit 0
}

if (-not (Test-Path (Join-Path $Root "node_modules"))) {
  Write-Host "第一次启动，正在安装依赖，可能要几分钟。"
  & npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "安装失败。看上面的报错，处理后重新双击 start.bat。"
    Read-Host "按回车键关闭"
    exit 1
  }
}

$proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "title 音高朗读 && npm run dev" -WorkingDirectory $Root -PassThru
Set-Content -Path $PidFile -Value $proc.Id -Encoding ascii

Write-Host "正在启动..."
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  if ($proc.HasExited) {
    Write-Host "启动失败，服务窗口已经退出。请看标题是「音高朗读」的窗口里的报错。"
    Read-Host "按回车键关闭"
    exit 1
  }
  try {
    $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    if ($resp.StatusCode -eq 200) {
      $ready = $true
      break
    }
  } catch {
    continue
  }
}

if (-not $ready) {
  Write-Host "等了 30 秒还没有打开。请看标题是「音高朗读」的窗口里的报错。"
  Read-Host "按回车键关闭"
  exit 1
}

Start-Process $Url
Write-Host "已打开浏览器。要停止，双击 stop.bat。这个窗口可以关掉。"
Start-Sleep -Seconds 3
