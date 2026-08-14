<#
.SYNOPSIS
    Starts the TFS-EOS application.
#>
if (-not (Test-Path "backend\.env")) {
    Write-Host "ERROR: backend\.env not found. Copy backend\.env.example." -ForegroundColor Red
    exit 1
}
if ((Get-Command pm2 -ErrorAction SilentlyContinue) -and (Test-Path "ecosystem.config.js")) {
    Write-Host "Starting via PM2..."
    pm2 start ecosystem.config.js
} else {
    Write-Host "Starting backend (foreground)..."
    Push-Location backend; npm start; Pop-Location
}
