# Start LeetPlacards for remote access (one command, everything starts).
#
# 1. Starts ngrok tunnel for the API (port 8000)
# 2. Detects the public HTTPS URL
# 3. Updates mobile/app.json with the tunnel URL
# 4. Starts the FastAPI backend
# 5. Starts Expo with --tunnel in a separate window
#
# FIRST-TIME SETUP (do this once):
#   1. Sign up free at https://ngrok.com
#   2. Copy your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken
#   3. Run:  & "$env:USERPROFILE\ngrok\ngrok.exe" config add-authtoken YOUR_TOKEN
#   4. Claim your free static domain at https://dashboard.ngrok.com/domains
#      Then put it in backend\.env as:  NGROK_DOMAIN=your-name.ngrok-free.app
#   5. Update your GitHub OAuth App (https://github.com/settings/developers)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$NgrokExe = Join-Path $env:USERPROFILE "ngrok\ngrok.exe"
$EnvFile = Join-Path $ProjectRoot "backend\.env"
$AppJson = Join-Path $ProjectRoot "mobile\app.json"
$MobileDir = Join-Path $ProjectRoot "mobile"

Write-Host ""
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host "       LeetPlacards - Remote Access Mode" -ForegroundColor Cyan
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host ""

# Read NGROK_DOMAIN from .env if set
$NgrokDomain = ""
if (Test-Path $EnvFile) {
    $match = Select-String -Path $EnvFile -Pattern "^NGROK_DOMAIN=(.+)" | Select-Object -First 1
    if ($match) {
        $NgrokDomain = $match.Matches.Groups[1].Value.Trim()
    }
}

# Kill any existing ngrok processes
Get-Process -Name "ngrok" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Start ngrok
Write-Host "[1/4] Starting ngrok tunnel..." -ForegroundColor Yellow
if ($NgrokDomain -and $NgrokDomain -ne "your-subdomain.ngrok-free.app") {
    Write-Host "       Using static domain: $NgrokDomain" -ForegroundColor Green
    Start-Process -FilePath $NgrokExe -ArgumentList "http", "--url=$NgrokDomain", "8000" -WindowStyle Minimized
} else {
    Write-Host "       Using dynamic URL (set NGROK_DOMAIN in .env for a fixed URL)" -ForegroundColor Gray
    Start-Process -FilePath $NgrokExe -ArgumentList "http", "8000" -WindowStyle Minimized
}

# Wait for ngrok to be ready
$PublicUrl = $null
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -ErrorAction Stop
        $tunnel = $response.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1
        if ($tunnel) {
            $PublicUrl = $tunnel.public_url
            break
        }
    } catch { }
}

if (-not $PublicUrl) {
    Write-Host ""
    Write-Host "  ERROR: Could not detect ngrok tunnel." -ForegroundColor Red
    Write-Host "  Have you set up your authtoken?" -ForegroundColor Red
    Write-Host "    $NgrokExe config add-authtoken YOUR_TOKEN" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "    API Tunnel: $PublicUrl" -ForegroundColor White
Write-Host "  ============================================" -ForegroundColor Green
Write-Host ""

# Update mobile app.json
Write-Host "[2/4] Updating mobile config..." -ForegroundColor Yellow
$appJsonObj = Get-Content $AppJson -Raw | ConvertFrom-Json
$appJsonObj.expo.extra.apiUrl = $PublicUrl
$appJsonObj | ConvertTo-Json -Depth 10 | Set-Content $AppJson -Encoding UTF8
Write-Host "       app.json apiUrl = $PublicUrl" -ForegroundColor Green

# Start Expo in separate window
Write-Host "[3/4] Starting Expo in new window..." -ForegroundColor Yellow
$expoCmd = "Set-Location '" + $MobileDir + "'; npx expo start"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $expoCmd
Write-Host "       Expo started - scan QR code from that window" -ForegroundColor Green

# Remind about GitHub OAuth
Write-Host ""
Write-Host "  NOTE: If this is a new ngrok URL, update your GitHub OAuth App:" -ForegroundColor Yellow
Write-Host "    https://github.com/settings/developers" -ForegroundColor Cyan
Write-Host "    Homepage URL:              $PublicUrl" -ForegroundColor White
Write-Host "    Authorization callback URL: $PublicUrl/auth/github/callback" -ForegroundColor White
Write-Host ""

# Start the backend
Write-Host "[4/4] Starting FastAPI backend..." -ForegroundColor Yellow
Write-Host ""
$env:APP_URL = $PublicUrl
$backendDir = Join-Path $ProjectRoot "backend"
Set-Location $backendDir
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
