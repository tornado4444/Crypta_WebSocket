$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$command = @"
Set-Location -LiteralPath '$projectRoot'
Write-Host ''
Write-Host 'CryptoAggregator domain setup' -ForegroundColor Cyan
Write-Host '1) Cloudflare will open a login page.' -ForegroundColor Yellow
Write-Host '2) Select delabopablo.dpdns.org and authorize it.' -ForegroundColor Yellow
Write-Host '3) Wait until this window says Done.' -ForegroundColor Yellow
Write-Host ''
npm.cmd run domain:setup
Write-Host ''
Write-Host 'If setup finished successfully, start the domain tunnel with:' -ForegroundColor Green
Write-Host '  npm run domain:tunnel' -ForegroundColor White
Write-Host ''
"@

Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList @("-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command) `
  -WorkingDirectory $projectRoot `
  -WindowStyle Normal
