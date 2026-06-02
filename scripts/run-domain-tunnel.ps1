param(
  [string]$Domain = "delabopablo.dpdns.org",
  [string]$TunnelName = "cryptoaggregator",
  [int]$Port = 8080,
  [switch]$NoApp
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
. "$PSScriptRoot\cloudflared-common.ps1"

$cloudflaredPath = Ensure-Cloudflared
$configPath = Join-Path (Join-Path $env:USERPROFILE ".cloudflared") "$TunnelName.yml"

if (-not (Test-Path -LiteralPath $configPath)) {
  Write-Host "Tunnel config was not found: $configPath" -ForegroundColor Red
  Write-Host "Run setup first:" -ForegroundColor Yellow
  Write-Host "  npm run domain:setup" -ForegroundColor White
  exit 1
}

Set-Location -LiteralPath $projectRoot
Ensure-AppServer -ProjectRoot $projectRoot -Port $Port -NoApp:$NoApp

Write-Step "Starting domain tunnel"
Write-Host "Public URL: https://$Domain" -ForegroundColor Green
Write-Host "Keep this terminal open while people use the site." -ForegroundColor Yellow
Write-Host ""

& $cloudflaredPath tunnel --config $configPath run $TunnelName
