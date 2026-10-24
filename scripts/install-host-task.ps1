#Requires -RunAsAdministrator
param(
  [string]$TaskName = 'AlEntlaq POS Host'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$node = (Get-Command node -ErrorAction Stop).Source

foreach ($required in @('.env.local', '.next\BUILD_ID', 'scripts\start-access-server.js')) {
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $required))) {
    throw "Missing $required. Create .env.local and run 'pnpm build' before installing the startup task."
  }
}

$logDirectory = Join-Path $projectRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$logFile = Join-Path $logDirectory 'host.log'

$command = "cd /d `"$projectRoot`" && `"$node`" scripts\start-access-server.js >> `"$logFile`" 2>&1"
$action = New-ScheduledTaskAction -Execute $env:ComSpec -Argument "/c $command" -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Host "Installed scheduled task '$TaskName'. It starts the POS host at every Windows startup."
Write-Host "Logs: $logFile"
Write-Host "Start now with: Start-ScheduledTask -TaskName '$TaskName'"
