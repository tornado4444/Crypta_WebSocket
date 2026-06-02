param(
  [string]$Domain = "delabopablo.dpdns.org",
  [string]$TunnelName = "cryptoaggregator",
  [int]$Port = 8080
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
. "$PSScriptRoot\cloudflared-common.ps1"

$cloudflaredPath = Ensure-Cloudflared
$cloudflaredDir = Join-Path $env:USERPROFILE ".cloudflared"
$certPath = Join-Path $cloudflaredDir "cert.pem"
$configPath = Join-Path $cloudflaredDir "$TunnelName.yml"

if (-not (Test-Path -LiteralPath $cloudflaredDir)) {
  New-Item -ItemType Directory -Path $cloudflaredDir | Out-Null
}

if (-not (Test-Path -LiteralPath $certPath)) {
  Write-Step "Cloudflare login is required"
  Write-Host "A browser page will open. Select the zone/domain: $Domain" -ForegroundColor Yellow
  Write-Host "After approval, cloudflared creates: $certPath" -ForegroundColor Yellow
  Write-Host ""
  & $cloudflaredPath tunnel login
}

if (-not (Test-Path -LiteralPath $certPath)) {
  Write-Host "Cloudflare login was not completed. Please run npm run domain:setup again and approve the browser login." -ForegroundColor Red
  exit 1
}

Write-Step "Creating or reusing named tunnel: $TunnelName"
$tunnelsJson = & $cloudflaredPath tunnel list --output json
$tunnels = @()
if ($tunnelsJson) {
  $tunnels = @($tunnelsJson | ConvertFrom-Json)
}

$tunnel = $tunnels | Where-Object { $_.name -eq $TunnelName } | Select-Object -First 1
if (-not $tunnel) {
  & $cloudflaredPath tunnel create $TunnelName
  $tunnelsJson = & $cloudflaredPath tunnel list --output json
  $tunnels = @($tunnelsJson | ConvertFrom-Json)
  $tunnel = $tunnels | Where-Object { $_.name -eq $TunnelName } | Select-Object -First 1
}

if (-not $tunnel) {
  Write-Host "Could not create or find tunnel: $TunnelName" -ForegroundColor Red
  exit 1
}

$tunnelId = [string]$tunnel.id
$credentialsPath = Join-Path $cloudflaredDir "$tunnelId.json"

if (-not (Test-Path -LiteralPath $credentialsPath)) {
  Write-Host "Credentials file was not found: $credentialsPath" -ForegroundColor Red
  Write-Host "Try deleting the tunnel in Cloudflare Zero Trust and run npm run domain:setup again." -ForegroundColor Yellow
  exit 1
}

Write-Step "Writing tunnel config"
$configContent = @"
tunnel: $tunnelId
credentials-file: $credentialsPath

ingress:
  - hostname: $Domain
    service: http://localhost:$Port
  - hostname: www.$Domain
    service: http://localhost:$Port
  - service: http_status:404
"@

Set-Content -LiteralPath $configPath -Value $configContent -Encoding UTF8
Write-Info "Config written: $configPath"

Write-Step "Creating Cloudflare DNS routes"
try {
  & $cloudflaredPath tunnel route dns $TunnelName $Domain
} catch {
  Write-Host "DNS route for $Domain may already exist: $($_.Exception.Message)" -ForegroundColor Yellow
}

try {
  & $cloudflaredPath tunnel route dns $TunnelName "www.$Domain"
} catch {
  Write-Host "DNS route for www.$Domain may already exist: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Step "Updating PUBLIC_BASE_URL in .env"
$envPath = Join-Path $projectRoot ".env"
if (Test-Path -LiteralPath $envPath) {
  $envText = Get-Content -LiteralPath $envPath -Raw
  if ($envText -match "(?m)^PUBLIC_BASE_URL=") {
    $envText = $envText -replace '(?m)^PUBLIC_BASE_URL=.*$', "PUBLIC_BASE_URL=`"https://$Domain`""
  } else {
    $envText = $envText.TrimEnd() + "`r`nPUBLIC_BASE_URL=`"https://$Domain`"`r`n"
  }
  Set-Content -LiteralPath $envPath -Value $envText -Encoding UTF8
  Write-Info ".env updated with PUBLIC_BASE_URL=https://$Domain"
} else {
  Write-Info ".env was not found. Add PUBLIC_BASE_URL=https://$Domain manually if needed."
}

Write-Step "Done"
Write-Host "Now run:" -ForegroundColor Green
Write-Host "  npm run domain:tunnel" -ForegroundColor White
Write-Host ""
Write-Host "Then open:" -ForegroundColor Green
Write-Host "  https://$Domain" -ForegroundColor White
