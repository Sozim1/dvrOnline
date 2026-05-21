$ErrorActionPreference = "Stop"

param(
  [int]$Port = 3000
)

$ruleName = "Camera NVR DVR painel TCP $Port"

if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
  Write-Host "Regra de firewall ja existe: $ruleName"
  exit 0
}

New-NetFirewallRule `
  -DisplayName $ruleName `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort $Port | Out-Null

Write-Host "Porta TCP $Port liberada no firewall do Windows."
