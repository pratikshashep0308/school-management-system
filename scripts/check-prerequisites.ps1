<#
.SYNOPSIS
    Verifies runtime tooling for TFS-EOS. Exit 0 ok, 1 missing prerequisite.
#>
Write-Host "== TFS-EOS prerequisites =="
$fail = $false

function Need($cmd, $label, $hint) {
    if (Get-Command $cmd -ErrorAction SilentlyContinue) {
        $v = (& $cmd --version 2>&1 | Select-Object -First 1)
        Write-Host "   OK    $label — $v"
    } else {
        Write-Host "   MISS  $label — $hint" -ForegroundColor Yellow
        $script:fail = $true
    }
}

Need node    "Node.js" "install Node 18 or later"
Need npm     "npm"     "ships with Node.js"
Need mongosh "mongosh" "https://www.mongodb.com/docs/mongodb-shell/"

if (Get-Command node -ErrorAction SilentlyContinue) {
    $major = [int](& node -p "process.versions.node.split('.')[0]")
    if ($major -lt 18) {
        Write-Host "   FAIL  Node.js 18 or later is required (found major $major)" -ForegroundColor Red
        $fail = $true
    }
}

if (Test-Path "backend\.env") {
    Write-Host "   OK    backend\.env present"
} else {
    Write-Host "   MISS  backend\.env — copy backend\.env.example and set MONGO_URI" -ForegroundColor Yellow
    $fail = $true
}

Write-Host ""
if ($fail) { Write-Host "Prerequisites FAILED." -ForegroundColor Red; exit 1 }
Write-Host "Prerequisites PASSED." -ForegroundColor Green
exit 0
