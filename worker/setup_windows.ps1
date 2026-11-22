<#
.SYNOPSIS
    Registers Windows Task Scheduler jobs for DalalPulse automated morning (8:15 AM IST)
    and evening (4:15 PM IST) runs, plus an on-startup background watcher.
.DESCRIPTION
    DalalPulse Hybrid Local-GPU & Cloud NSE Retail Sentiment Radar
#>

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$PythonExe = (Get-Command python).Source
$PipelineScript = Join-Path $ProjectRoot "worker\pipeline.py"
$WatcherScript = Join-Path $ProjectRoot "worker\watcher.py"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  DalalPulse Windows Automation Setup" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Project Root : $ProjectRoot"
Write-Host "Python Exe   : $PythonExe"
Write-Host "Pipeline     : $PipelineScript"
Write-Host "Watcher      : $WatcherScript"
Write-Host ""

# Helper to register or update a task
function Register-DalalPulseTask {
    param(
        [string]$TaskName,
        [string]$Arguments,
        [string]$Time, # HH:mm
        [string]$Description
    )

    $Action = New-ScheduledTaskAction -Execute $PythonExe -Argument $Arguments -WorkingDirectory (Join-Path $ProjectRoot "worker")
    $Trigger = New-ScheduledTaskTrigger -Daily -At $Time
    $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)

    # Unregister existing if present
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

    Register-ScheduledTask -TaskName $TaskName `
        -Action $Action `
        -Trigger $Trigger `
        -Settings $Settings `
        -Description $Description | Out-Null

    Write-Host "[+] Registered $TaskName at $Time (IST)" -ForegroundColor Green
}

# 1. Morning Pre-Market Radar (8:15 AM IST)
Register-DalalPulseTask `
    -TaskName "DalalPulse_MorningRadar" `
    -Arguments "`"$PipelineScript`" scheduled_morning" `
    -Time "08:15" `
    -Description "DalalPulse Pre-Market Retail Sentiment Radar (8:15 AM IST)"

# 2. Evening Post-Market Radar (4:15 PM IST)
Register-DalalPulseTask `
    -TaskName "DalalPulse_EveningRadar" `
    -Arguments "`"$PipelineScript`" scheduled_evening" `
    -Time "16:15" `
    -Description "DalalPulse Post-Market Retail Sentiment Radar (4:15 PM IST)"

# 3. Background Watcher Task (Runs on User Logon)
$WatcherAction = New-ScheduledTaskAction -Execute $PythonExe -Argument "`"$WatcherScript`"" -WorkingDirectory (Join-Path $ProjectRoot "worker")
$WatcherTrigger = New-ScheduledTaskTrigger -AtLogOn
$WatcherSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 365)

Unregister-ScheduledTask -TaskName "DalalPulse_Watcher" -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName "DalalPulse_Watcher" `
    -Action $WatcherAction `
    -Trigger $WatcherTrigger `
    -Settings $WatcherSettings `
    -Description "DalalPulse Cloud-to-Local Watcher for Mobile PWA Triggers" | Out-Null

Write-Host "[+] Registered DalalPulse_Watcher at User Logon" -ForegroundColor Green

Write-Host "`nSetup complete! You can inspect or run tasks at any time using Windows Task Scheduler or:" -ForegroundColor Cyan
Write-Host "  Start-ScheduledTask -TaskName 'DalalPulse_MorningRadar'" -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName 'DalalPulse_Watcher'" -ForegroundColor Yellow
