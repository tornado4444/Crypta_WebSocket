function Resolve-Cloudflared {
  $command = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $knownPaths = @(
    "C:\Program Files\cloudflared\cloudflared.exe",
    "C:\Program Files (x86)\cloudflared\cloudflared.exe",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"
  )

  foreach ($path in $knownPaths) {
    if ($path -and (Test-Path -LiteralPath $path)) {
      return $path
    }
  }

  return $null
}

function Write-Step {
  param([string]$Text)
  Write-Host ""
  Write-Host "==> $Text" -ForegroundColor Cyan
}

function Write-Info {
  param([string]$Text)
  Write-Host $Text -ForegroundColor Gray
}

function Ensure-Cloudflared {
  $cloudflaredPath = Resolve-Cloudflared

  if (-not $cloudflaredPath) {
    Write-Host "cloudflared is not installed." -ForegroundColor Red
    Write-Host ""
    Write-Host "Install it once, then run the command again:" -ForegroundColor Yellow
    Write-Host "  winget install --id Cloudflare.cloudflared -e" -ForegroundColor White
    exit 1
  }

  return $cloudflaredPath
}

function Ensure-AppServer {
  param(
    [string]$ProjectRoot,
    [int]$Port,
    [switch]$NoApp
  )

  if ($NoApp) {
    return
  }

  Write-Step "Checking CryptoAggregator on http://localhost:$Port"
  $env:PORT = "$Port"
  $existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

  if ($existing) {
    Write-Info "Port $Port is already in use. I will reuse the running server."
    return
  }

  $appProcess = Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList @("run", "dev") `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -PassThru

  Write-Info "Started app process id: $($appProcess.Id)"
  Start-Sleep -Seconds 5
}
