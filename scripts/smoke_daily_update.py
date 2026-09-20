#!/usr/bin/env python3
"""
Manual smoke check for the daily update.

This performs a real download and rewrites the price artifacts, so it is not a
unit test and is deliberately not named test_* -- pytest would otherwise collect
it and hit the network as a side effect of running the suite.

Run it by hand:  python smoke_daily_update.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from daily_update import daily_update


def run_smoke_check():
    """Run a real daily update and report whether it succeeded."""
    print("🧪 Running daily update smoke check...")
    print("=" * 50)

    try:
        success = daily_update()
        if success:
            print("✅ Daily update smoke check completed successfully!")
            return True

        print("❌ Daily update smoke check failed!")
        return False
    except Exception as e:
        print(f"❌ Daily update smoke check failed with error: {e}")
        return False


if __name__ == "__main__":
    sys.exit(0 if run_smoke_check() else 1)
