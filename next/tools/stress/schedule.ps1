# Registers (does NOT run) a Windows Task Scheduler job "Waraq stress" that runs the full stress pipeline every night
# at 02:00, and starts it late if the PC was off, only while the PC is idle and on mains power. Needs no administrator
# rights (current user). The result is .stress-cache\stress-report.md; the log is .stress-cache\nightly.log.
#   powershell -ExecutionPolicy Bypass -File tools\stress\schedule.ps1 [-At 02:00] [-Remove]
param([string]$At = '02:00', [switch]$Remove)
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$name = 'Waraq stress'
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue; "Removed '$name'."; return }
$node = (Get-Command node -ErrorAction Stop).Source
$cmd = "/c `"cd /d `"$root`" && `"$node`" tools\stress\run.mjs --deep > .stress-cache\nightly.log 2>&1`""
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $cmd -WorkingDirectory "$root"
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfIdle -IdleDuration (New-TimeSpan -Minutes 10) -IdleWaitTimeout (New-TimeSpan -Hours 4) -DontStopOnIdleEnd -DisallowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 3)
New-Item -ItemType Directory -Force (Join-Path $root '.stress-cache') | Out-Null
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Description 'Waraq stress pipeline (tools/stress/run.mjs): no tokens; read .stress-cache/stress-report.md' -Force | Out-Null
"Registered '$name' daily at $At (idle, on mains). Not run. Run now: Start-ScheduledTask -TaskName '$name'. Remove: -Remove."
