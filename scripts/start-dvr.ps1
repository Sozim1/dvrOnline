$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if (-not (Test-Path (Join-Path $root ".env"))) {
  Copy-Item (Join-Path $root ".env.example") (Join-Path $root ".env")
  Write-Host "Arquivo .env criado. Edite RTSP_MAIN, RTSP_SUB, ADMIN_PASSWORD e storage antes de iniciar o DVR."
  exit 1
}

$dockerReady = $false
for ($attempt = 1; $attempt -le 24; $attempt++) {
  docker info *> $null
  if ($LASTEXITCODE -eq 0) {
    $dockerReady = $true
    break
  }
  Start-Sleep -Seconds 5
}

if (-not $dockerReady) {
  throw "Docker nao ficou pronto em ate 2 minutos. Abra o Docker Desktop e execute o script novamente."
}

docker compose up -d
docker compose ps

Write-Host ""
Write-Host "DVR iniciado."
Write-Host "Painel local: http://localhost:3000"
