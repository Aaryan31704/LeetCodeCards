<#
.SYNOPSIS
    Start the LeetPlacards backend for local/LAN development.
.DESCRIPTION
    Detects your LAN IP, updates app.json, and starts the backend.
    Use this when your phone and laptop are on the same WiFi network.
#>

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$AppJson = Join-Path $ProjectRoot "mobile\app.json"

# ── Detect LAN IP ──
$LanIp = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.InterfaceAlias -notmatch "Loopback" -and $_.PrefixOrigin -eq "Dhcp" } |
    Select-Object -First 1).IPAddress

if (-not $LanIp) {
    $LanIp = "localhost"
    Write-Host "Could not detect LAN IP, using localhost" -ForegroundColor Yellow
}

$LocalUrl = "http://${LanIp}:8000"
Write-Host "`n=== Local Development Mode ===" -ForegroundColor Cyan
Write-Host "  API URL: $LocalUrl" -ForegroundColor Green
Write-Host "  LAN IP:  $LanIp`n" -ForegroundColor Green

# ── Update mobile app.json ──
$appJsonObj = Get-Content $AppJson -Raw | ConvertFrom-Json
$appJsonObj.expo.extra.apiUrl = $LocalUrl
$appJsonObj | ConvertTo-Json -Depth 10 | Set-Content $AppJson -Encoding UTF8
Write-Host "[OK] Updated mobile/app.json apiUrl = $LocalUrl" -ForegroundColor Green

# ── Update .env AUTH_REDIRECT_HOST for Expo Go ──
Write-Host "[OK] AUTH_REDIRECT_HOST should be: ${LanIp}:8081/--" -ForegroundColor Green

# ── Start the backend ──
Write-Host "`nStarting FastAPI backend...`n" -ForegroundColor Cyan
$env:APP_URL = $LocalUrl
Set-Location (Join-Path $ProjectRoot "backend")
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
