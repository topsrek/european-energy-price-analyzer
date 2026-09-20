#!/usr/bin/env python3
"""
Daily update script for EEPA country energy price data.
This script should be run daily to fetch the latest price data.

It drives the same two entry points the worker uses, so a scheduled run and a
containerised run produce identical artifacts. Countries come from the COUNTRIES
environment variable (comma separated) or from the command line.
"""

import json
import logging
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent

# Add the scripts directory to the path
sys.path.insert(0, str(SCRIPTS_DIR))

logger = logging.getLogger(__name__)


def configure_logging():
    """Set up console and file logging.

    Called when an update actually runs rather than at import time, so importing
    this module does not create a log file as a side effect.
    """
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler('daily_update.log'),
            logging.StreamHandler()
        ]
    )

DEFAULT_COUNTRIES = "AT"

# Re-cover the previous day as well. The most recent stored day is usually partial,
# because the update runs before upstream has published all of it, and the artifact
# format cannot represent a hole -- it would read back as a shift.
OVERLAP_DAYS = 1


def countries_to_update(argv=None):
    """Countries from the command line, else COUNTRIES, else Austria."""
    if argv:
        raw = ",".join(argv)
    else:
        raw = os.getenv("COUNTRIES", DEFAULT_COUNTRIES)

    return [country.strip().upper() for country in raw.split(",") if country.strip()]


def latest_stored_date(country_code):
    """Oldest 'last timestamp' across a country's artifacts, as a UTC date.

    Taking the oldest means the window covers whichever resolution has fallen
    furthest behind, so a catch-up cannot leave one of them with a hole.
    """
    latest = None

    for suffix in ("electricity_prices_metadata.json", "electricity_prices_15min_metadata.json"):
        path = SCRIPTS_DIR / "data" / f"{country_code.lower()}_{suffix}"
        if not path.exists():
            continue

        try:
            coverage = json.loads(path.read_text(encoding="utf-8")).get("data_coverage", {})
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning(f"Ignoring unreadable metadata {path.name}: {exc}")
            continue

        last_timestamp = coverage.get("last_timestamp")
        if not isinstance(last_timestamp, str) or not last_timestamp:
            continue

        parsed = datetime.fromisoformat(last_timestamp.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        parsed_date = parsed.astimezone(timezone.utc).date()

        latest = parsed_date if latest is None else min(latest, parsed_date)

    return latest


def update_window(country_code):
    """Window to refresh: from where the artifacts end, through tomorrow.

    Anchoring on the stored data rather than on 'yesterday' means a run that has
    been missed for a while still catches up in one go, instead of appending a
    fresh island and leaving a hole the artifact format cannot represent.
    """
    # Tomorrow, so the run picks up day-ahead prices once they are published.
    end_date = datetime.now(timezone.utc).date() + timedelta(days=1)
    latest = latest_stored_date(country_code)

    if latest is None:
        return end_date, end_date

    return min(latest - timedelta(days=OVERLAP_DAYS), end_date), end_date


def run_script(script_name, country_code, start_date, end_date):
    """Run one refresh script, returning True when it succeeded."""
    command = [
        sys.executable,
        str(SCRIPTS_DIR / script_name),
        country_code,
        start_date.isoformat(),
        end_date.isoformat(),
    ]

    logger.info(f"Running {script_name} for {country_code} ({start_date} to {end_date})")
    result = subprocess.run(command, cwd=SCRIPTS_DIR.parent)

    if result.returncode != 0:
        logger.error(f"{script_name} failed for {country_code} (exit {result.returncode})")
        return False

    return True


def daily_update(countries=None):
    """Run the daily update for every configured country."""
    countries = countries or countries_to_update()
    configure_logging()

    logger.info("=" * 60)
    logger.info("DAILY UPDATE STARTED")
    logger.info("=" * 60)

    failed = []
    for country_code in countries:
        start_date, end_date = update_window(country_code)
        hourly_ok = run_script("smart_batch_downloader.py", country_code, start_date, end_date)
        interval_ok = run_script("build_interval_dataset.py", country_code, start_date, end_date)

        if not (hourly_ok and interval_ok):
            failed.append(country_code)

    if failed:
        logger.error(f"❌ Daily update failed for: {', '.join(failed)}")
    else:
        logger.info(f"✅ Daily update completed successfully for: {', '.join(countries)}")

    logger.info("=" * 60)
    logger.info("DAILY UPDATE COMPLETED")
    logger.info("=" * 60)

    return not failed


if __name__ == "__main__":
    success = daily_update(countries_to_update(sys.argv[1:]))
    sys.exit(0 if success else 1)
