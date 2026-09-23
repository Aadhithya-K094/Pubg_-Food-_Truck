<#
    Starts the PUBG Food Truck Django API server.

    The login page shows "Server not running" whenever this backend is not
    up, because the browser can't reach the API on port 8000. Run this script
    and LEAVE THE WINDOW OPEN while you use the app — closing it stops the
    server and logins will fail again.

    Usage:
      powershell -ExecutionPolicy Bypass -File tools\run-backend.ps1
#>

$ErrorActionPreference = "Stop"

# Resolve paths relative to this script so it works from any directory.
$backend = Join-Path $PSScriptRoot "..\backend"
$python  = Join-Path $backend "venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    Write-Host "Python venv not found at: $python" -ForegroundColor Red
    Write-Host "Create it first:  cd backend ; python -m venv venv ; venv\Scripts\pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
}

# If something is already listening on 8000, don't start a second one.
$inUse = Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue
if ($inUse) {
    Write-Host "Port 8000 is already in use - the backend seems to be running already." -ForegroundColor Yellow
    Write-Host "Open http://127.0.0.1:8000/api/menu/ to confirm." -ForegroundColor Yellow
    exit 0
}

Write-Host "Starting Django API on http://127.0.0.1:8000/ ..." -ForegroundColor Cyan
Write-Host "Keep this window OPEN while using the app. Press Ctrl+C to stop.`n" -ForegroundColor Cyan

Set-Location $backend
& $python manage.py runserver 127.0.0.1:8000
