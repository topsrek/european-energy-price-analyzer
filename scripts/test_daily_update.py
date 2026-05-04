#!/usr/bin/env python3
"""
Test script for daily update functionality.
This simulates what the daily job will do.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from daily_update import daily_update

def test_daily_update():
    """Test the daily update functionality."""
    print("🧪 Testing daily update functionality...")
    print("=" * 50)
    
    try:
        success = daily_update()
        if success:
            print("✅ Daily update test completed successfully!")
            return True
        else:
            print("❌ Daily update test failed!")
            return False
    except Exception as e:
        print(f"❌ Daily update test failed with error: {e}")
        return False

if __name__ == "__main__":
    test_daily_update()
