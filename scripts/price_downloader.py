#!/usr/bin/env python3
"""
EEPA energy price API client.

Downloads price data for a bidding zone and date range from the
energy-charts.info API. The artifacts themselves are written by
smart_batch_downloader.py (hourly) and build_interval_dataset.py (15-minute).
"""

import time
import requests
from datetime import datetime, date, timezone
from email.utils import parsedate_to_datetime
from typing import List, Tuple, Optional
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# The upstream limiter answers 429 with Retry-After (typically ~7s). Cap it so a
# hostile or malformed value cannot park a refresh for hours.
MAX_RETRY_AFTER_SECONDS = 300


def retry_delay_from_response(response, fallback_seconds):
    """Seconds to wait before retrying, honouring Retry-After when present.

    The API rate limits aggressively and says exactly how long to wait. Ignoring
    that meant either retrying too early (another 429) or backing off far longer
    than asked, which pushed refreshes towards the command timeout.
    """
    if response is None:
        return fallback_seconds

    raw = response.headers.get('Retry-After')
    if not raw:
        return fallback_seconds

    raw = raw.strip()
    try:
        seconds = float(raw)
    except ValueError:
        try:
            retry_at = parsedate_to_datetime(raw)
        except (TypeError, ValueError):
            return fallback_seconds

        if retry_at is None:
            return fallback_seconds
        if retry_at.tzinfo is None:
            retry_at = retry_at.replace(tzinfo=timezone.utc)
        seconds = (retry_at - datetime.now(timezone.utc)).total_seconds()

    if seconds != seconds or seconds < 0:  # NaN or negative
        return fallback_seconds

    return min(seconds, MAX_RETRY_AFTER_SECONDS)


def is_retryable_error(exc: BaseException) -> bool:
    """Whether a failed request is worth repeating.

    Only transient failures qualify: rate limiting (429), server errors (5xx) and
    connection problems or timeouts. A 4xx such as a bad bidding zone will fail
    identically on every attempt, and retrying it only burned minutes of backoff
    against the worker's command timeout.
    """
    if isinstance(exc, requests.exceptions.HTTPError):
        response = exc.response
        if response is None:
            return False
        return response.status_code == 429 or response.status_code >= 500

    return isinstance(
        exc,
        (
            requests.exceptions.ConnectionError,
            requests.exceptions.Timeout,
            requests.exceptions.ChunkedEncodingError,
        ),
    )


class EnergyPriceDownloader:
    """Downloads energy price data from energy-charts.info."""

    BASE_URL = "https://api.energy-charts.info/price"
    RETRY_DELAYS_SECONDS = (5, 15, 30, 60)
    REQUEST_TIMEOUT_SECONDS = 30

    def __init__(self, country_code: str = "AT"):
        self.country_code = country_code.upper()
        self.session = requests.Session()
        self.session.headers.update({
            'accept': 'application/json',
            'User-Agent': 'European-Energy-Price-Analyzer/0.1'
        })

    def download_date_range_data(self, start_date: date, end_date: date) -> Optional[Tuple[List[int], List[float]]]:
        """Download price data for a date range.

        Returns (timestamps, prices) on success -- possibly empty when upstream
        has not published anything for the range yet -- or None on failure.
        Transient failures are retried, honouring Retry-After.
        """
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")
        url = f"{self.BASE_URL}?bzn={self.country_code}&start={start_str}&end={end_str}"
        max_attempts = len(self.RETRY_DELAYS_SECONDS) + 1

        for attempt in range(1, max_attempts + 1):
            response = None
            try:
                logger.info(f"Downloading data for {start_str} to {end_str} (attempt {attempt}/{max_attempts})")

                response = self.session.get(url, timeout=self.REQUEST_TIMEOUT_SECONDS)
                response.raise_for_status()
                data = response.json()
            except requests.exceptions.RequestException as e:
                if not is_retryable_error(e):
                    logger.error(f"Request failed with a non-retryable error: {e}")
                    return None
                if attempt >= max_attempts:
                    logger.error(f"Request failed (attempt {attempt}): {e}")
                    break

                wait_seconds = retry_delay_from_response(response, self.RETRY_DELAYS_SECONDS[attempt - 1])
                logger.warning(f"Request failed (attempt {attempt}): {e}. Retrying in {wait_seconds:.0f} seconds...")
                time.sleep(wait_seconds)
                continue
            except ValueError as e:
                # A 200 with a body that is not JSON is not a transient condition.
                logger.error(f"Invalid JSON response for {start_str} to {end_str}: {e}")
                return None

            if not isinstance(data, dict) or 'unix_seconds' not in data or 'price' not in data:
                logger.error("Invalid response format - missing required fields")
                return None

            if data.get('deprecated', False):
                logger.warning(f"API endpoint is deprecated for {start_str} to {end_str}")

            timestamps = data['unix_seconds'] or []
            prices = data['price'] or []

            if len(timestamps) != len(prices):
                logger.error("Timestamp and price arrays have different lengths")
                return None

            logger.info(f"Successfully downloaded {len(timestamps)} price records for {start_str} to {end_str}")
            return timestamps, prices

        logger.error(f"Failed to download data for {start_str} to {end_str} after {max_attempts} attempts")
        return None

    def close(self):
        """Clean up resources."""
        self.session.close()
