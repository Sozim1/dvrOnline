param(
  [string]$TaskName = "CameraNvrDvrStartup"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$startScript = Resolve-Path (Join-Path $PSScriptRoot "start-dvr.ps1")

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`"" `
  -WorkingDirectory $root

$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Inicia o Camera NVR Docker Compose ao entrar no Windows." `
  -Force | Out-Null

Write-Host "Tarefa '$TaskName' instalada."
Write-Host "Ela executa: $startScript"
Write-Host "Teste agora com: Start-ScheduledTask -TaskName '$TaskName'"
