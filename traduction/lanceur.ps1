# Lance serve.js en fenetre cachee (appele par le lien videocontinuum://start). Ne fait rien si le port 8787 est deja pris.
if (Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue) { exit 0 }
$env:DEEPSEEK_API_KEY = [Environment]::GetEnvironmentVariable('DEEPSEEK_API_KEY', 'User')
Start-Process node -ArgumentList 'serve.js' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
