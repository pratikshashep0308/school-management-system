<#
.SYNOPSIS
    Grants the new TFS-EOS module keys in the permission matrix.
    Non-destructive: an existing grant is never lowered or overwritten.
#>
Write-Host "== TFS-EOS seed =="
if (-not $env:MONGO_URI) { Write-Host "ERROR: MONGO_URI is required." -ForegroundColor Red; exit 1 }
& mongosh $env:MONGO_URI --quiet --file database\seed\seed-module-keys.js
exit $LASTEXITCODE
