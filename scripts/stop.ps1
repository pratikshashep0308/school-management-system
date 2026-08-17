<#
.SYNOPSIS
    Stops the TFS-EOS application.
#>
if (Get-Command pm2 -ErrorAction SilentlyContinue) { pm2 stop ecosystem.config.js }
Write-Host "Stopped."
