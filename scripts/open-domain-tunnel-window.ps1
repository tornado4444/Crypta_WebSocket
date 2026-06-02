$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$command = @"
Set-Location -LiteralPath '$projectRoot'
Write-Host ''
Write-Host 'CryptoAggregator domain tunnel' -ForegroundColor Cyan
Write-Host 'Public URL: https://delabopablo.dpdns.org' -ForegroundColor Green
Write-Host 'Keep this window open while other people use the site.' -ForegroundColor Yellow
Write-Host ''
npm.cmd run domain:tunnel
"@

Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList @("-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command) `
  -WorkingDirectory $projectRoot `
  -WindowStyle Normal
