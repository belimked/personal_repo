# Run on 63 as Administrator: install or update the xiaohe-asr service
# Usage: powershell -ExecutionPolicy Bypass -File install.ps1 -Token <shared-secret> [-AllowFrom 10.3.19.65]
param(
  [Parameter(Mandatory=$true)][string]$Token,
  [string]$AllowFrom = "10.3.19.65",
  [int]$Port = 11226
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$Svc = "xiaohe-asr"
$Dir = "F:\asr\service"
$Py = "F:\asr\venv-funasr\Scripts\python.exe"
$Nssm = "F:\asr\tools\nssm.exe"

New-Item -ItemType Directory -Force "$Dir\logs", "$Dir\tmp", "F:\asr\tools" | Out-Null
Copy-Item -Force "$PSScriptRoot\server.py" "$Dir\server.py"

# NSSM
if (-not (Test-Path $Nssm)) {
  $zip = "F:\asr\tools\nssm.zip"
  Invoke-WebRequest "https://nssm.cc/release/nssm-2.24.zip" -OutFile $zip -UseBasicParsing -TimeoutSec 120
  Expand-Archive $zip "F:\asr\tools\nssm-x" -Force
  Copy-Item "F:\asr\tools\nssm-x\nssm-2.24\win64\nssm.exe" $Nssm
  Remove-Item -Recurse -Force $zip, "F:\asr\tools\nssm-x"
}

# Service
if (Get-Service $Svc -ErrorAction SilentlyContinue) { & $Nssm stop $Svc | Out-Null }
else { & $Nssm install $Svc $Py "$Dir\server.py" | Out-Null }
& $Nssm set $Svc Application $Py | Out-Null
& $Nssm set $Svc AppParameters "$Dir\server.py" | Out-Null
& $Nssm set $Svc AppDirectory $Dir | Out-Null
& $Nssm set $Svc DisplayName "Xiaohe ASR (FunASR)" | Out-Null
& $Nssm set $Svc Start SERVICE_AUTO_START | Out-Null
& $Nssm set $Svc AppEnvironmentExtra "ASR_TOKEN=$Token" "ASR_PORT=$Port" "ASR_ALLOW=$AllowFrom,127.0.0.1" "MODELSCOPE_CACHE=F:\asr\model-cache" "PYTHONIOENCODING=utf-8" "PYTHONUNBUFFERED=1" | Out-Null
& $Nssm set $Svc AppStdout "$Dir\logs\service.log" | Out-Null
& $Nssm set $Svc AppStderr "$Dir\logs\service.log" | Out-Null
& $Nssm set $Svc AppRotateFiles 1 | Out-Null
& $Nssm set $Svc AppRotateOnline 1 | Out-Null
& $Nssm set $Svc AppRotateBytes 10485760 | Out-Null
& $Nssm set $Svc AppExit Default Restart | Out-Null
& $Nssm set $Svc AppRestartDelay 10000 | Out-Null
& $Nssm set $Svc AppThrottle 30000 | Out-Null

# Firewall: allow only the backend host
$Rule = "xiaohe-asr-$Port"
Get-NetFirewallRule -DisplayName $Rule -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $Rule -Direction Inbound -Protocol TCP -LocalPort $Port -RemoteAddress $AllowFrom -Action Allow -Profile Any | Out-Null

# Power: never sleep or hibernate on AC
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
# Windows Update active hours 8-23 (no auto restart in this window)
$wu = "HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings"
New-Item -Force $wu -ErrorAction SilentlyContinue | Out-Null
Set-ItemProperty $wu ActiveHoursStart 8
Set-ItemProperty $wu ActiveHoursEnd 23

& $Nssm start $Svc | Out-Null
Write-Output "installed; waiting for model load"
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep 3
  try { $r = Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 3; Write-Output ("health: " + ($r | ConvertTo-Json -Compress)); exit 0 } catch {}
}
Write-Output "health check timeout; see $Dir\logs\service.log"
exit 1
