<#
.SYNOPSIS
    Verifies the target MongoDB deployment before any migration runs.
.DESCRIPTION
    INSTALLATION/RUNTIME MODE. Not a build prerequisite.
    Exit codes: 0 ok, 1 MONGO_URI missing, 2 unreachable, 3 no transaction support.
#>
$ErrorActionPreference = 'Stop'
Write-Host "== TFS-EOS MongoDB check =="

if (-not $env:MONGO_URI) {
    Write-Host "ERROR: MONGO_URI is required." -ForegroundColor Red
    Write-Host "       Copy backend\.env.example to backend\.env and set MONGO_URI."
    Write-Host "       The application never falls back to a default localhost URI —"
    Write-Host "       a silent fallback would write to an unintended database."
    exit 1
}

if (-not (Get-Command mongosh -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: mongosh not found on PATH." -ForegroundColor Red
    Write-Host "       Install MongoDB Shell: https://www.mongodb.com/docs/mongodb-shell/"
    exit 2
}

Write-Host "-- connectivity"
& mongosh $env:MONGO_URI --quiet --eval 'db.adminCommand({ping:1})' | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: MongoDB is unreachable. Installation cannot continue." -ForegroundColor Red
    Write-Host "       Check the URI, network access, and (for Atlas) the IP allowlist."
    exit 2
}
Write-Host "   connected"

$version = & mongosh $env:MONGO_URI --quiet --eval 'db.version()'
Write-Host "-- server version: $version"

Write-Host "-- transaction capability"
# Approved decision D-004 requires promotion to run in a single multi-document
# transaction. Unavailable on a standalone mongod. A SINGLE-NODE replica set is
# sufficient — no additional hardware needed.
$setName = & mongosh $env:MONGO_URI --quiet --eval 'try { const s = rs.status(); print(s.set || ""); } catch (e) { print(""); }'
$setName = ($setName | Out-String).Trim()

if ([string]::IsNullOrWhiteSpace($setName)) {
    Write-Host "ERROR: this deployment is not a replica set, so multi-document" -ForegroundColor Red
    Write-Host "       transactions are unavailable. Promotion (D-004) cannot run safely:"
    Write-Host "       a partial promotion would leave Student.class and Class.students[]"
    Write-Host "       disagreeing, with no way to tell which is correct."
    Write-Host ""
    Write-Host "       Fix (single-node is enough, no data migration required):"
    Write-Host "         1. start mongod with --replSet rs0"
    Write-Host "         2. mongosh --eval 'rs.initiate()'"
    Write-Host "         3. add ?replicaSet=rs0 to MONGO_URI"
    Write-Host "       MongoDB Atlas clusters are replica sets by default."
    exit 3
}
Write-Host "   replica set: $setName — transactions available"
Write-Host ""
Write-Host "MongoDB check PASSED." -ForegroundColor Green
exit 0
