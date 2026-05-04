#!/usr/bin/env python3
"""
Daily update script for EEPA country energy price data.
This script should be run daily to fetch the latest price data.
"""

import sys
import logging
from datetime import datetime, timedelta
from pathlib import Path

# Add the scripts directory to the path
sys.path.insert(0, str(Path(__file__).parent))

from smart_batch_downloader import SmartBatchDownloader

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('daily_update.log'),
        logging.StreamHandler()
    ]
)

def daily_update():
    """Run daily update for Austrian energy prices."""
    logger = logging.getLogger(__name__)
    
    logger.info("=" * 60)
    logger.info("DAILY UPDATE STARTED")
    logger.info("=" * 60)
    
    try:
        # Calculate yesterday's date (since today's data might not be complete yet)
        yesterday = datetime.now().date() - timedelta(days=1)
        
        logger.info(f"Fetching data for: {yesterday}")
        
        # Use the smart batch downloader for intelligent updates
        downloader = SmartBatchDownloader()
        
        # Analyze existing data first
        analysis = downloader.analyze_existing_data()
        existing_timestamps = analysis['existing_timestamps']
        
        # Find missing dates for yesterday
        missing_dates = downloader.find_missing_dates(yesterday, yesterday, existing_timestamps)
        
        if missing_dates:
            # Download missing data
            new_records = downloader.download_missing_dates(missing_dates)
            
            if new_records:
                # Get existing records from the analysis
                if analysis['total_records'] > 0:
                    with open(downloader.web_file, 'rb') as f:
                        data = f.read()
                    from smart_batch_downloader import OptimizedPriceDecoder
                    decoder = OptimizedPriceDecoder(data)
                    existing_records = decoder.decode_all()
                else:
                    existing_records = []
                
                # Merge and save
                downloader.merge_and_save_data(existing_records, new_records)
                result = True
            else:
                result = False
        else:
            result = False
        
        if result:
            logger.info("✅ Daily update completed successfully!")
            logger.info(f"Updated data for: {yesterday}")
        else:
            logger.info("ℹ️ No new data to update")
            
    except Exception as e:
        logger.error(f"❌ Daily update failed: {e}")
        return False
    
    logger.info("=" * 60)
    logger.info("DAILY UPDATE COMPLETED")
    logger.info("=" * 60)
    return True

if __name__ == "__main__":
    success = daily_update()
    sys.exit(0 if success else 1)
