# Keeps the Jodoh agent (npm start) online: restarts it if it crashes or the box
# reboots. The SDK already reconnects the WebSocket on network blips (ws.js
# ping/pong + backoff), so this only supervises the PROCESS.
#
# One WS connection per SDK key is allowed — a second agent process trips a
# "policy violation (duplicate key)" and one drops. So a named mutex enforces a
# single supervisor; don't also run `npm start`/`npm run health` by hand while
# this is up (prove-hire is HTTP-only and is safe to run alongside).
#
# Run now:        powershell -ExecutionPolicy Bypass -File scripts\keepalive.ps1
# Survive reboot: register as a logon task (once), then it self-heals forever:
#   schtasks /create /tn JodohAgent /sc onlogon /rl highest /f ^
#     /tr "powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%CD%\scripts\keepalive.ps1\""
#   schtasks /run /tn JodohAgent      # start it now without waiting for a logon
#   schtasks /delete /tn JodohAgent /f # stop supervising

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot   # scripts\.. -> repo root

$created = $false
$mutex = New-Object System.Threading.Mutex($true, "Global\JodohAgentKeepalive", [ref]$created)
if (-not $created) {
  Write-Host "keepalive: another supervisor already holds the lock — exiting."
  exit 0
}

Write-Host "keepalive: supervising 'npm start' in $repo (Ctrl+C to stop)"
while ($true) {
  $p = Start-Process -FilePath "npm.cmd" -ArgumentList "start" -WorkingDirectory $repo -NoNewWindow -PassThru -Wait
  Write-Host "keepalive: agent exited (code $($p.ExitCode)) at $(Get-Date -Format o) — restarting in 5s"
  Start-Sleep -Seconds 5
}
