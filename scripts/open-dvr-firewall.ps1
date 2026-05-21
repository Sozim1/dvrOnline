param(
  [int]$Port = 3000,
  [int]$WebRtcUdpPort = 8189
)

$ErrorActionPreference = "Stop"

$ruleName = "Camera NVR DVR painel TCP $Port"

if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
  Write-Host "Regra de firewall ja existe: $ruleName"
} else {
  New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $Port | Out-Null

  Write-Host "Porta TCP $Port liberada no firewall do Windows."
}

$webrtcRuleName = "Camera NVR DVR WebRTC UDP $WebRtcUdpPort"

if (Get-NetFirewallRule -DisplayName $webrtcRuleName -ErrorAction SilentlyContinue) {
  Write-Host "Regra de firewall ja existe: $webrtcRuleName"
} else {
  New-NetFirewallRule `
    -DisplayName $webrtcRuleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol UDP `
    -LocalPort $WebRtcUdpPort | Out-Null

  Write-Host "Porta UDP $WebRtcUdpPort liberada no firewall do Windows para WebRTC."
}
