<#
.SYNOPSIS
    Read-only database validation. Exit 0 pass, 1 fail.
#>
if (-not $env:MONGO_URI) { Write-Host "ERROR: MONGO_URI is required." -ForegroundColor Red; exit 1 }
& mongosh $env:MONGO_URI --quiet --file database\validation\validate-db.js
exit $LASTEXITCODE
