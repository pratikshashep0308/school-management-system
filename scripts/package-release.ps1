<#
.SYNOPSIS
    Builds the TFS-EOS installable ZIP and optionally copies it to a destination.
.DESCRIPTION
    NO PATH IS HARDCODED. The destination comes from -OutDir, or from
    $env:TFS_RELEASE_OUTPUT_DIR, or defaults to .\dist inside the repository.
    A build artifact that embeds one person's home directory is not portable,
    leaks the machine layout of whoever ran it, and breaks for every other
    operator.
.EXAMPLE
    .\scripts\package-release.ps1
    .\scripts\package-release.ps1 -OutDir "D:\Releases"
    .\scripts\package-release.ps1 -OutDir "$env:USERPROFILE\Desktop\TFS-EOS"
#>
param(
    [string]$OutDir  = $(if ($env:TFS_RELEASE_OUTPUT_DIR) { $env:TFS_RELEASE_OUTPUT_DIR } else { ".\dist" }),
    [string]$Version = $(if ($env:TFS_RELEASE_VERSION) { $env:TFS_RELEASE_VERSION } else { "1.0.0-rc1" })
)

$name = "TFS-EOS-DELTA-BUILD-v$Version"
Write-Host "== Packaging $name =="

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$OutDir = (Resolve-Path $OutDir).Path

$stage = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
$dest  = Join-Path $stage $name
New-Item -ItemType Directory -Path $dest -Force | Out-Null

try {
    Write-Host "-- staging"
    $exclude = @('node_modules', '.git', 'BUILD-EVIDENCE', 'dist', 'build')
    foreach ($item in @('backend','frontend','database','scripts','config')) {
        if (Test-Path $item) {
            Copy-Item $item -Destination $dest -Recurse -Force `
                -Exclude $exclude -ErrorAction SilentlyContinue
        }
    }
    Get-ChildItem -Path $dest -Recurse -Force -Include '.env' | Remove-Item -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Path $dest -Recurse -Force -Directory -Include 'node_modules' |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

    New-Item -ItemType Directory -Path (Join-Path $dest 'docs') -Force | Out-Null
    foreach ($doc in @('INSTALLATION-GUIDE.md','HOLIDAY-CALENDAR-GUIDE.md','BUILD-JOURNAL.md','FINAL-BUILD-VERIFICATION.md','BUILD-MANIFEST.json')) {
        if (Test-Path $doc) { Copy-Item $doc -Destination (Join-Path $dest 'docs') -Force }
    }
    if (Test-Path 'backend\.env.example') { Copy-Item 'backend\.env.example' -Destination (Join-Path $dest '.env.example') -Force }

    Write-Host "-- secret scan"
    # Placeholders are permitted; real credentials are not.
    $creds = Get-ChildItem $dest -Recurse -File |
        Select-String -Pattern 'mongodb(\+srv)?://[A-Za-z0-9._%<>-]+:[^@\s"''{]+@' -AllMatches |
        Where-Object { $_.Matches.Value -notmatch 'USERNAME:PASSWORD|<[A-Za-z]+>:<[A-Za-z]+>|USER:PASS' }
    if ($creds) {
        Write-Host "ERROR: a real credential was found in the staged package. Aborting." -ForegroundColor Red
        $creds | Select-Object -First 5 | ForEach-Object { Write-Host "  $($_.Path)" }
        exit 2
    }

    Write-Host "-- local path scan"
    $paths = Get-ChildItem $dest -Recurse -File |
        Select-String -Pattern 'C:\\Users\\[A-Za-z]' -List
    if ($paths) {
        Write-Host "ERROR: hardcoded local path found in staged package. Aborting." -ForegroundColor Red
        $paths | Select-Object -First 5 | ForEach-Object { Write-Host "  $($_.Path)" }
        exit 3
    }

    Write-Host "-- archiving"
    $zip = Join-Path $OutDir "$name-FINAL.zip"
    if (Test-Path $zip) { Remove-Item $zip -Force }
    Compress-Archive -Path $dest -DestinationPath $zip -Force

    $sha = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
    "$sha  $(Split-Path $zip -Leaf)" | Set-Content "$zip.sha256"

    Write-Host ""
    Write-Host "Package : $zip" -ForegroundColor Green
    Write-Host "SHA-256 : $sha"
}
finally {
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue }
}
