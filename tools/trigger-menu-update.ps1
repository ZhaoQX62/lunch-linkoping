# Asks GitHub to run the "Update lunch menus" workflow right away.
# Run by Windows Task Scheduler on weekday mornings (see tools\install-task.ps1), because
# GitHub's own schedule starts hours late on small repos.
#
# Uses the GitHub login Git Credential Manager already has for this PC; no token is stored here.
# Log: %LOCALAPPDATA%\LunchLinkoping\trigger.log

$ErrorActionPreference = 'Stop'
$Repo     = 'ZhaoQX62/lunch-linkoping'
$Workflow = 'update-menus.yml'
$User     = 'ZhaoQX62'

$logDir = Join-Path $env:LOCALAPPDATA 'LunchLinkoping'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir 'trigger.log'
function Write-Log($msg) {
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $logFile -Value $line -Encoding UTF8
  # keep the log short
  $all = Get-Content -Path $logFile -Encoding UTF8
  if ($all.Count -gt 300) { $all | Select-Object -Last 200 | Set-Content -Path $logFile -Encoding UTF8 }
}

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

  # Ask Git Credential Manager for the saved github.com login, without ever showing a prompt.
  $env:GCM_INTERACTIVE = 'never'
  $request = "protocol=https`nhost=github.com`nusername=$User`n`n"
  $answer = $request | git credential fill 2>$null
  $token = ($answer | Where-Object { $_ -like 'password=*' } | Select-Object -First 1) -replace '^password=', ''
  if (-not $token) { throw 'No saved GitHub login found in Git Credential Manager (sign in once with a git push).' }

  $headers = @{
    Authorization = "Bearer $token"
    Accept        = 'application/vnd.github+json'
    'User-Agent'  = 'lunch-linkoping-trigger'
  }
  Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/json' `
    -Uri "https://api.github.com/repos/$Repo/actions/workflows/$Workflow/dispatches" `
    -Body '{"ref":"main"}' | Out-Null
  Write-Log 'OK    workflow started'
} catch {
  Write-Log ('FAIL  ' + $_.Exception.Message)
  exit 1
}
