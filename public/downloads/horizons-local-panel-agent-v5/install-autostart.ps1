$ErrorActionPreference = 'Stop'
$taskName = 'Horizons Local Panel Agent'
$launcher = Join-Path $PSScriptRoot 'start-agent.cmd'

if (-not (Test-Path $launcher)) { throw "Arquivo não encontrado: $launcher" }

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ('/c ""{0}""' -f $launcher)
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 365)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Mantém a ponte local do Horizons ativa após entrar no Windows.' -Force | Out-Null

Write-Host "Pronto. A tarefa '$taskName' iniciará automaticamente ao entrar no Windows."
Write-Host 'Para remover depois, execute: Unregister-ScheduledTask -TaskName "Horizons Local Panel Agent" -Confirm:$false'
