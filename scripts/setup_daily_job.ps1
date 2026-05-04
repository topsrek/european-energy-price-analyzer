# PowerShell script to set up daily Austrian energy price updates
# Run this script as Administrator to create the scheduled task

param(
    [string]$TaskName = "AustrianEnergyPriceUpdate",
    [string]$ScriptPath = "D:\DEV\austrian-energy-insight\scripts\daily_update.py",
    [string]$PythonPath = "python"
)

Write-Host "Setting up daily Austrian energy price update job..." -ForegroundColor Green

# Get the current directory
$CurrentDir = Get-Location
$ScriptDir = Split-Path $ScriptPath -Parent

# Create the action (command to run)
$Action = New-ScheduledTaskAction -Execute $PythonPath -Argument $ScriptPath -WorkingDirectory $ScriptDir

# Create the trigger (run daily at 2:00 AM)
$Trigger = New-ScheduledTaskTrigger -Daily -At "02:00"

# Create the settings
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# Create the task
try {
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Daily update of Austrian energy price data"
    Write-Host "✅ Scheduled task '$TaskName' created successfully!" -ForegroundColor Green
    Write-Host "   - Runs daily at 2:00 AM" -ForegroundColor Yellow
    Write-Host "   - Script: $ScriptPath" -ForegroundColor Yellow
    Write-Host "   - Working directory: $ScriptDir" -ForegroundColor Yellow
} catch {
    Write-Host "❌ Failed to create scheduled task: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Make sure you're running this script as Administrator" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "To manage the task:" -ForegroundColor Cyan
Write-Host "   - View: Get-ScheduledTask -TaskName '$TaskName'" -ForegroundColor White
Write-Host "   - Run now: Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor White
Write-Host "   - Delete: Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:$false" -ForegroundColor White
Write-Host "   - Or use Task Scheduler GUI: taskschd.msc" -ForegroundColor White
