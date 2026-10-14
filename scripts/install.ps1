# Notch Porch installer for Windows (per-user, no admin needed).
#   irm https://raw.githubusercontent.com/shubhamcodess/notch-porch/main/scripts/install.ps1 | iex
$ErrorActionPreference = 'Stop'
$url = 'https://github.com/shubhamcodess/notch-porch/releases/latest/download/Notch-Porch-Setup-x64.exe'
$tmp = Join-Path $env:TEMP 'Notch-Porch-Setup-x64.exe'
Write-Host 'Downloading Notch Porch...'
Invoke-WebRequest -Uri $url -OutFile $tmp
Write-Host 'Installing...'
Start-Process -FilePath $tmp -ArgumentList '/S' -Wait
Remove-Item $tmp -Force
Write-Host 'Done. Notch Porch is in your system tray.'
