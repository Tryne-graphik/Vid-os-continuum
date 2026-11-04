# Lance le service de sous-titres a l'ouverture de session Windows (HKCU\...\Run, sans droits admin).
# Retirer : .\installer-demarrage-auto.ps1 -Retirer
param([switch]$Retirer)
$k = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
if ($Retirer) { Remove-ItemProperty $k 'VideoContinuumSousTitres' -ErrorAction SilentlyContinue; Write-Host 'Demarrage automatique retire.'; return }
$cmd = '"{0}\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{1}"' -f $env:SystemRoot, "$PSScriptRoot\lanceur.ps1"
Set-ItemProperty $k 'VideoContinuumSousTitres' $cmd
Write-Host "Demarrage automatique active : $cmd"
