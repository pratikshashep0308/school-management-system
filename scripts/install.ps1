<#
.SYNOPSIS
    TFS-EOS Delta Build — end-to-end installation.
#>
Write-Host "=============================================="
Write-Host " TFS-EOS Delta Build — installation"
Write-Host "=============================================="

& "$PSScriptRoot\check-prerequisites.ps1"; if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host ""
& "$PSScriptRoot\check-mongodb.ps1";       if ($LASTEXITCODE -ne 0) { exit 2 }

Write-Host ""
Write-Host "-- backend dependencies"
Push-Location backend; npm install --omit=dev; $rc = $LASTEXITCODE; Pop-Location
if ($rc -ne 0) { exit 3 }

Write-Host ""
Write-Host "-- frontend dependencies"
Push-Location frontend; npm install; $rc = $LASTEXITCODE; Pop-Location
if ($rc -ne 0) { exit 3 }

Write-Host ""
Write-Host "-- migrations"
& "$PSScriptRoot\migrate.ps1";     if ($LASTEXITCODE -ne 0) { exit 4 }
Write-Host ""
Write-Host "-- seed"
& "$PSScriptRoot\seed.ps1";        if ($LASTEXITCODE -ne 0) { exit 5 }
Write-Host ""
Write-Host "-- validation"
& "$PSScriptRoot\validate-db.ps1"; if ($LASTEXITCODE -ne 0) { exit 6 }

Write-Host ""
Write-Host "Installation complete. Start with .\scripts\start.ps1" -ForegroundColor Green
