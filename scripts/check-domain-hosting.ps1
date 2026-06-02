param(
  [string]$Domain = "delabopablo.dpdns.org"
)

$ErrorActionPreference = "Continue"

function Write-Check {
  param(
    [string]$Name,
    [bool]$Ok,
    [string]$Details
  )

  $status = if ($Ok) { "OK" } else { "FAIL" }
  $color = if ($Ok) { "Green" } else { "Red" }
  Write-Host ("[{0}] {1}" -f $status, $Name) -ForegroundColor $color
  if ($Details) {
    Write-Host "     $Details" -ForegroundColor Gray
  }
}

function Test-HttpUrl {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 15
    return @{
      Ok = ($response.StatusCode -eq 200)
      Reachable = $true
      StatusCode = [int]$response.StatusCode
      Details = "Status $($response.StatusCode), $($response.Content.Length) bytes"
      Content = [string]$response.Content
    }
  } catch {
    $statusCode = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $statusCode = [int]$_.Exception.Response.StatusCode
    }

    $details = if ($statusCode) {
      "Status ${statusCode}: $($_.Exception.Message)"
    } else {
      $_.Exception.Message
    }

    return @{
      Ok = $false
      Reachable = ($null -ne $statusCode)
      StatusCode = $statusCode
      Details = $details
      Content = ""
    }
  }
}

function Get-WebDnsRecords {
  param([string]$Name)

  $records = @()
  foreach ($type in @("CNAME", "A")) {
    try {
      $records += @(
        Resolve-DnsName $Name -Type $type -ErrorAction Stop |
          Where-Object { $_.Type -in @("CNAME", "A") }
      )
    } catch {
      # Some delegated/proxied Cloudflare routes do not expose useful records
      # through every local resolver immediately. HTTPS checks below are the
      # final authority for whether the public app is reachable.
    }
  }

  return $records
}

Write-Host ""
Write-Host "Checking public hosting for https://$Domain" -ForegroundColor Cyan
Write-Host ""

$healthUrl = "https://$Domain/health"
$homeUrl = "https://$Domain/"
$health = Test-HttpUrl $healthUrl
$homeCheck = Test-HttpUrl $homeUrl
$dnsRecords = @(Get-WebDnsRecords $Domain)

if ($dnsRecords.Count -gt 0) {
  $details = ($dnsRecords | ForEach-Object {
    if ($_.Type -eq "CNAME") { "CNAME -> $($_.NameHost)" }
    elseif ($_.Type -eq "A") { "A -> $($_.IPAddress)" }
    else { "$($_.Type)" }
  }) -join "; "
  Write-Check "DNS/web route" $true $details
} elseif ($health.Reachable -or $homeCheck.Reachable) {
  Write-Check "DNS/web route" $true "The domain is routed through Cloudflare because HTTPS returned a response. Local DNS did not expose a direct A/CNAME record."
} else {
  Write-Check "DNS/web route" $false "No web route was found. Email MX/TXT records do not open the web app."
}

$healthDetails = if ($health.Content) {
  "Status $($health.StatusCode): $($health.Content)"
} else {
  $health.Details
}
Write-Check "HTTPS /health" $health.Ok $healthDetails
Write-Check "Dashboard page" $homeCheck.Ok $homeCheck.Details

Write-Host ""
if ($health.Ok -and $homeCheck.Ok) {
  Write-Host "Public hosting is working. Share links can use https://$Domain/r/<code>." -ForegroundColor Green
} elseif ($health.StatusCode -eq 530 -or $homeCheck.StatusCode -eq 530) {
  Write-Host "Cloudflare sees the domain, but the tunnel/origin is not running." -ForegroundColor Yellow
  Write-Host "Run:" -ForegroundColor Yellow
  Write-Host "  npm run domain:tunnel:window" -ForegroundColor White
} else {
  Write-Host "If the DNS/web route fails, run:" -ForegroundColor Yellow
  Write-Host "  npm run domain:setup:window" -ForegroundColor White
  Write-Host ""
  Write-Host "If DNS is OK but HTTPS fails, run:" -ForegroundColor Yellow
  Write-Host "  npm run domain:tunnel:window" -ForegroundColor White
}
