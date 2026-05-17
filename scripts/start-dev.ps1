$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")

if (-not (Test-Path (Join-Path $root ".env"))) {
  Copy-Item (Join-Path $root ".env.example") (Join-Path $root ".env")
  Write-Host "Arquivo .env criado. Edite RTSP_MAIN, RTSP_SUB e ADMIN_PASSWORD antes de usar com a camera real."
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\backend'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\frontend'; npm run dev"

Write-Host "Backend:  http://localhost:4000"
Write-Host "Frontend: http://localhost:3000"
