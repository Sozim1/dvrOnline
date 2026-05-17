$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Arquivo .env criado a partir de .env.example. Edite as URLs RTSP e a senha antes de rodar."
}

Write-Host "Instalando dependencias do backend..."
Push-Location "backend"
npm install
Pop-Location

Write-Host "Instalando dependencias do frontend..."
Push-Location "frontend"
npm install
Pop-Location

Write-Host "Setup concluido."
