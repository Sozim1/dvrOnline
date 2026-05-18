$ErrorActionPreference = "Stop"

param(
  [string]$TaskName = "CameraNvrDvrStartup"
)

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Tarefa '$TaskName' removida."
} else {
  Write-Host "Tarefa '$TaskName' nao encontrada."
}
