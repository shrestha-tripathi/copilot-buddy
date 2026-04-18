# Sample Windows scheduled-task install. Run from an elevated PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
#
# Replace -BinPath and -ExtensionId before running.

param(
  [string]$BinPath = "$env:USERPROFILE\bin\copilot-buddy.exe",
  [string]$ExtensionId = "YOUR_EXTENSION_ID",
  [int]$Port = 8770
)

$action = New-ScheduledTaskAction `
  -Execute $BinPath `
  -Argument "--port $Port --origins chrome-extension://$ExtensionId"

$trigger = New-ScheduledTaskTrigger -AtLogOn

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable

Register-ScheduledTask `
  -TaskName "CopilotBuddy" `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Copilot Buddy daemon (Go) for the Chrome side-panel extension" `
  -Force

Start-ScheduledTask -TaskName "CopilotBuddy"
Write-Host "Registered + started 'CopilotBuddy' scheduled task."
