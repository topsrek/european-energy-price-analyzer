# Daily Update System for Austrian Energy Prices

This system automatically fetches the latest Austrian energy price data daily to keep your dataset current.

## 📊 Current Dataset Status

- **Total Records**: 60,431 real market prices
- **Date Range**: 2018-09-30 to 2025-08-21 (6.9 years)
- **File Size**: 121,479 bytes (~121KB)
- **Price Range**: -500.00 to 919.64 EUR/MWh
- **Data Quality**: All authentic market data, no placeholders

## 🔄 Daily Update System

### Files
- `daily_update.py` - Main daily update script
- `setup_daily_job.ps1` - PowerShell script to set up Windows Task Scheduler
- `smoke_daily_update.py` - Manual smoke check (performs a real download)

### How It Works

1. **Intelligent Updates**: Only downloads missing data (no duplicates)
2. **Automatic Merging**: Combines new data with existing dataset
3. **Error Handling**: Robust retry logic with exponential backoff
4. **Logging**: Detailed logs saved to `daily_update.log`
5. **Both Resolutions**: Refreshes the hourly and the 15-minute artifact
6. **Self-healing Window**: The range starts from where the stored artifacts end,
   not from yesterday, so a missed run still catches up in one go

### Countries

Set `COUNTRIES` (comma separated) or pass them as arguments; defaults to `AT`:

```bash
COUNTRIES=AT,DE-LU,FR python daily_update.py
python daily_update.py AT DE-LU
```

### Setup Instructions

#### Option 1: Windows Task Scheduler (Recommended)

1. **Run as Administrator**:
   ```powershell
   # Navigate to scripts directory
   cd D:\DEV\european-energy-price-analyzer\scripts
   
   # Run the setup script
   .\setup_daily_job.ps1
   ```

2. **Verify Setup**:
   ```powershell
   # Check if task was created
   Get-ScheduledTask -TaskName "AustrianEnergyPriceUpdate"
   
   # Test run the task
   Start-ScheduledTask -TaskName "AustrianEnergyPriceUpdate"
   ```

#### Option 2: Manual Testing

```bash
# Smoke-check the daily update (downloads and rewrites artifacts)
python smoke_daily_update.py

# Run the actual daily update
python daily_update.py
```

### Task Scheduler Details

- **Task Name**: `AustrianEnergyPriceUpdate`
- **Schedule**: Daily at 2:00 AM
- **Script**: `daily_update.py`
- **Working Directory**: `D:\DEV\european-energy-price-analyzer\scripts`
- **Log File**: `daily_update.log`

### Management Commands

```powershell
# View task details
Get-ScheduledTask -TaskName "AustrianEnergyPriceUpdate"

# Run task immediately
Start-ScheduledTask -TaskName "AustrianEnergyPriceUpdate"

# Stop running task
Stop-ScheduledTask -TaskName "AustrianEnergyPriceUpdate"

# Delete task
Unregister-ScheduledTask -TaskName "AustrianEnergyPriceUpdate" -Confirm:$false

# View task history
Get-ScheduledTask -TaskName "AustrianEnergyPriceUpdate" | Get-ScheduledTaskInfo
```

### Log Files

- `daily_update.log` - Daily update execution logs
- `smart_batch_downloader.log` - Detailed download logs (if enabled)

### Troubleshooting

#### Common Issues

1. **Permission Denied**:
   - Run PowerShell as Administrator
   - Check file permissions on script directory

2. **Python Not Found**:
   - Ensure Python is in PATH
   - Update `PythonPath` parameter in setup script

3. **Task Fails to Start**:
   - Check Windows Event Viewer for errors
   - Verify script path is correct
   - Test script manually first

#### Manual Recovery

If the automated system fails, you can manually update:

```bash
# Download latest data
python smart_batch_downloader.py 2025-08-20 2025-08-21

# Or run daily update manually
python daily_update.py
```

### Data Integrity

- ✅ **No Duplicates**: Smart merging prevents duplicate records
- ✅ **UTC Storage**: All timestamps stored in UTC
- ✅ **No Placeholders**: Only real market data, no fake values
- ✅ **Automatic Validation**: Checks data integrity before saving

### Performance

- **Download Speed**: ~1-2 seconds per day of data
- **File Growth**: ~2 bytes per record (ultra-efficient)
- **Memory Usage**: Minimal (streaming downloads)
- **Network Usage**: Only downloads missing data

## 🎯 Next Steps

1. **Set up the daily job** using the PowerShell script
2. **Test the system** with the test script
3. **Monitor logs** for the first few days
4. **Verify data updates** in your web application

Your EEPA data system will now automatically stay current with the latest market data.
