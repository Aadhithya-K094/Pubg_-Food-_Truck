<#
    Runs the PUBG Food Truck mobile app on a USB-connected Android phone.

    Why USB: this PC's Wi-Fi is a "Public" network, so Windows Firewall
    blocks inbound connections from your phone. `adb reverse` tunnels the
    phone's own localhost back to this PC over the USB cable, so no
    firewall change, admin rights, or shared Wi-Fi is needed.

    Prerequisites on the phone:
      Settings > About phone > tap "Build number" 7x  (enables Developer options)
      Settings > Developer options > USB debugging  = ON
      Plug in via USB, then accept the "Allow USB debugging?" prompt.

    Usage:  powershell -ExecutionPolicy Bypass -File tools\run-usb.ps1
#>

$ErrorActionPreference = "Stop"

$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) {
    $cmd = Get-Command adb -ErrorAction SilentlyContinue
    if ($cmd) { $adb = $cmd.Source } else { throw "adb not found. Install Android Platform Tools." }
}

Write-Host "`n[1/3] Looking for a connected device..." -ForegroundColor Cyan
& $adb start-server | Out-Null
$devices = (& $adb devices) | Select-Object -Skip 1 | Where-Object { $_ -match "\S" }

if (-not $devices) {
    Write-Host "  No device found." -ForegroundColor Red
    Write-Host "  - Plug the phone in with a data-capable USB cable"
    Write-Host "  - Enable Developer options + USB debugging"
    Write-Host "  - Accept the 'Allow USB debugging?' prompt on the phone"
    exit 1
}

foreach ($d in $devices) { Write-Host "  $d" -ForegroundColor Green }

if ($devices -match "unauthorized") {
    Write-Host "`n  Device is UNAUTHORIZED - unlock the phone and tap 'Allow' on the" -ForegroundColor Yellow
    Write-Host "  USB debugging prompt, then re-run this script." -ForegroundColor Yellow
    exit 1
}

Write-Host "`n[2/3] Reverse-forwarding ports over USB..." -ForegroundColor Cyan
# Phone's localhost:8000 -> this PC's 8000 (Django API)
& $adb reverse tcp:8000 tcp:8000 | Out-Null
# Phone's localhost:8081 -> this PC's 8081 (Metro bundler)
& $adb reverse tcp:8081 tcp:8081 | Out-Null
Write-Host "  active reverse tunnels:" -ForegroundColor Green
(& $adb reverse --list) | ForEach-Object { Write-Host "    $_" }

Write-Host "`n[3/3] Checking the API URL used by the app..." -ForegroundColor Cyan
$envFile = Join-Path $PSScriptRoot "..\mobile\.env"
$active = (Get-Content $envFile | Where-Object { $_ -match "^EXPO_PUBLIC_API_URL" })
Write-Host "  $active"
if ($active -notmatch "127\.0\.0\.1") {
    Write-Host "`n  For USB it must be 127.0.0.1, because the reverse tunnel makes" -ForegroundColor Yellow
    Write-Host "  the phone's own localhost point at this PC. Set it to:" -ForegroundColor Yellow
    Write-Host "    EXPO_PUBLIC_API_URL=http://127.0.0.1:8000/api" -ForegroundColor White
} else {
    Write-Host "  correct for USB." -ForegroundColor Green
}

Write-Host "`nReady. Now run these in two separate terminals:" -ForegroundColor Cyan
Write-Host "  backend :  cd backend ; venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000"
Write-Host "  mobile  :  cd mobile  ; npx expo start --localhost"
Write-Host "`nThen press 'a' in the Expo terminal to launch on the phone.`n"
