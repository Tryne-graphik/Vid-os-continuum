# Enregistre le lien videocontinuum:// pour l'utilisateur courant (HKCU, sans droits admin). Annuler : Remove-Item HKCU:\Software\Classes\videocontinuum -Recurse
$k = 'HKCU:\Software\Classes\videocontinuum'
New-Item $k -Force | Out-Null
Set-ItemProperty $k '(default)' 'URL:Video Continuum'
New-ItemProperty $k 'URL Protocol' -Value '' -Force | Out-Null
New-Item "$k\shell\open\command" -Force | Out-Null
$cmd = '"{0}" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{1}"' -f (Get-Command pwsh -ErrorAction SilentlyContinue).Source, "$PSScriptRoot\lanceur.ps1"
if ($cmd.StartsWith('"" ')) { $cmd = $cmd.Replace('"" ', '"powershell.exe" ') }
Set-ItemProperty "$k\shell\open\command" '(default)' $cmd
Write-Host "Enregistre : $cmd"
