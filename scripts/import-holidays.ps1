<#
.SYNOPSIS
    Populates the Holiday collection from a JSON or CSV file.
.DESCRIPTION
    Until the calendar management screens ship (GAP-CAL-008), this is how a
    school defines its holidays. Without them the attendance block is Sunday-only.
.EXAMPLE
    .\scripts\import-holidays.ps1 holidays.json
    .\scripts\import-holidays.ps1 holidays.csv -Extra "--dry-run"
#>
param(
    [Parameter(Mandatory=$true, Position=0)][string]$File,
    [Parameter(ValueFromRemainingArguments=$true)][string[]]$Extra
)
if (-not $env:MONGO_URI) { Write-Host "ERROR: MONGO_URI is required." -ForegroundColor Red; exit 1 }
node database\seed\import-holidays.js --file $File @Extra
exit $LASTEXITCODE
