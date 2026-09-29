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
- `smoke_daily_update.py` - Manual smoke check (performs a real download)

### How It Works

1. **Overlap Refresh**: Re-fetches the requested window (last stored day plus slack) so partial days are completed and upstream corrections win
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

In production the worker (`worker/server.py`, started by the root `Dockerfile`) runs the
update on its own schedule (`UPDATE_HOUR_LOCAL`/`UPDATE_MINUTE_LOCAL` in `UPDATE_TIMEZONE`,
default 13:07 Europe/Vienna, after day-ahead prices are published). No external scheduler is needed.

For manual runs:

```bash
# Smoke-check the daily update (downloads and rewrites artifacts)
python smoke_daily_update.py

# Run the actual daily update
python daily_update.py
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
- **Network Usage**: Only the update window is downloaded

## 🎯 Next Steps

1. **Monitor** `/api/health` (`ok`, `stale_countries`) and the worker logs
2. **Verify data updates** in the web application
