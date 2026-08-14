<#
.SYNOPSIS
    Runs TFS-EOS migrations in order.
.DESCRIPTION
    Refuses to start if MongoDB is unreachable or lacks transaction support.
    Migration 002 is effectively irreversible: `results` carries no date of its
    own, so a mis-stamped academicYearId cannot be recovered afterwards.

    Required environment:
      TFS_ACADEMIC_YEAR_START, TFS_ACADEMIC_YEAR_END   (no defaults)
    Optional:
      TFS_ACADEMIC_YEAR_NAME (default 2026-27), TFS_DRY_RUN=1
#>
Write-Host "== TFS-EOS migrations =="

& "$PSScriptRoot\check-mongodb.ps1"
if ($LASTEXITCODE -ne 0) { Write-Host "Aborting: MongoDB check failed." -ForegroundColor Red; exit 2 }

if (-not $env:TFS_ACADEMIC_YEAR_START -or -not $env:TFS_ACADEMIC_YEAR_END) {
    Write-Host ""
    Write-Host "ERROR: TFS_ACADEMIC_YEAR_START and TFS_ACADEMIC_YEAR_END are required." -ForegroundColor Red
    Write-Host "       They are school-specific and deliberately not defaulted;"
    Write-Host "       they also drive timetable term validation (GAP-CAL-003)."
    Write-Host ""
    Write-Host '  $env:TFS_ACADEMIC_YEAR_START="2026-04-01"; $env:TFS_ACADEMIC_YEAR_END="2027-03-31"'
    Write-Host '  .\scripts\migrate.ps1'
    exit 1
}

Write-Host ""
Write-Host "-- 001 academic year and calendar"
& mongosh $env:MONGO_URI --quiet --file database\migrations\001-academic-year-and-calendar.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "-- 002 academicYearId stamping (pre-flight gate runs first)"
& mongosh $env:MONGO_URI --quiet --file database\migrations\002-academic-year-id-stamping.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "-- indexes"
& mongosh $env:MONGO_URI --quiet --file database\indexes\create-indexes.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Migrations complete. Run .\scripts\validate-db.ps1 to verify." -ForegroundColor Green
