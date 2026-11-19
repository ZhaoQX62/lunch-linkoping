# Creates (or replaces) the Windows scheduled task that starts the menu update on weekday mornings.
# Run once:   powershell -NoProfile -ExecutionPolicy Bypass -File tools\install-task.ps1
# Remove:     Unregister-ScheduledTask -TaskName 'Lunch Linkoping - update menus' -Confirm:$false

$ErrorActionPreference = 'Stop'
$TaskName = 'Lunch Linkoping - update menus'
$Script   = Join-Path $PSScriptRoot 'trigger-menu-update.ps1'
# Local (Swedish) time. Monday: three checks, since many restaurants publish the new week's
# menu late in the morning. Tuesday to Friday: one check is enough.
$MondayTimes  = '09:00', '10:30', '12:00'
$WeekdayTimes = '09:00'

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Script`""

$triggers = @(
  foreach ($t in $MondayTimes)  { New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At $t }
  foreach ($t in $WeekdayTimes) { New-ScheduledTaskTrigger -Weekly -DaysOfWeek Tuesday, Wednesday, Thursday, Friday -At $t }
)

# StartWhenAvailable: if the PC was asleep/off at a set time, run as soon as it's back.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew

# Runs as you, only while you're logged in (needed to read your saved Git login).
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings `
  -Principal $principal -Description 'Starts the GitHub workflow that refreshes Lunch Linkoping menus.' -Force | Out-Null

Get-ScheduledTask -TaskName $TaskName | Get-ScheduledTaskInfo | Select-Object TaskName, NextRunTime
