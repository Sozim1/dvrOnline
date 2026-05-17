$ErrorActionPreference = "Stop"

Write-Host "Verificando FFmpeg..."
ffmpeg -version | Select-Object -First 1

Write-Host "Verificando FFprobe..."
ffprobe -version | Select-Object -First 1

Write-Host "OK: FFmpeg e FFprobe encontrados no PATH."
