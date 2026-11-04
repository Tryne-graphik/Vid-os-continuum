# Enregistre le lien videocontinuum:// pour l'utilisateur courant (HKCU, sans droits admin). Annuler : Remove-Item HKCU:\Software\Classes\videocontinuum -Recurse
$k = 'HKCU:\Software\Classes\videocontinuum'
New-Item $k -Force | Out-Null
Set-ItemProperty $k '(default)' 'URL:Video Continuum'
New-ItemProperty $k 'URL Protocol' -Value '' -Force | Out-Null
New-Item "$k\shell\open\command" -Force | Out-Null
# powershell.exe (5.1) : pwsh.exe est un alias du Store (WindowsApps) que le lancement par protocole n'execute pas.
$cmd = '"{0}\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{1}"' -f $env:SystemRoot, "$PSScriptRoot\lanceur.ps1"
Set-ItemProperty "$k\shell\open\command" '(default)' $cmd
Write-Host "Enregistre : $cmd"
