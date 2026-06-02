param(
  [int]$Port = 8080,
  [switch]$NoApp
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

. "$PSScriptRoot\cloudflared-common.ps1"

$cloudflaredPath = Ensure-Cloudflared

Ensure-AppServer -ProjectRoot $projectRoot -Port $Port -NoApp:$NoApp

Write-Step "Opening public HTTPS tunnel"
Write-Host "Copy the https://*.trycloudflare.com URL from the output below." -ForegroundColor Yellow
Write-Host "People on other PCs open only that URL in the browser. They do not need npm." -ForegroundColor Yellow
Write-Host ""
Write-Host "For report links set PUBLIC_BASE_URL to that same URL in .env and restart the app." -ForegroundColor Yellow
Write-Host ""

& $cloudflaredPath tunnel --url "http://localhost:$Port"
