import os
import unittest
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent))
import server

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import build_interval_dataset
from build_interval_dataset import find_gaps
from smart_batch_downloader import trim_to_utc_midnight_start
import daily_update
from price_downloader import MAX_RETRY_AFTER_SECONDS, retry_delay_from_response


class DataFreshnessTest(unittest.TestCase):
    def test_client_data_is_stale_when_server_has_newer_data(self):
        self.assertFalse(
            server.is_client_data_fresh(
                "2026-06-02T00:00:00+00:00",
                "2026-06-03T21:00:00+00:00",
            )
        )

    def test_client_data_is_fresh_when_it_matches_server_data(self):
        self.assertTrue(
            server.is_client_data_fresh(
                "2026-06-03T21:00:00+00:00",
                "2026-06-03T21:00:00+00:00",
            )
        )

    def test_client_data_is_fresh_when_it_is_newer_than_server_data(self):
        self.assertTrue(
            server.is_client_data_fresh(
                "2026-06-04T00:00:00+00:00",
                "2026-06-03T21:00:00+00:00",
            )
        )


class UpdateWindowTest(unittest.TestCase):
    """The last stored day is usually partial, so the window must re-cover it.

    Resuming at latest_date + 1 left a permanent hole, and because the artifact
    encodes records positionally that hole shifted every later timestamp earlier.
    """

    def test_window_reaches_back_over_the_last_stored_day(self):
        with mock.patch.object(server, "get_latest_data_timestamp", return_value="2026-05-06T21:45:00+00:00"):
            start_date, end_date = server.update_window("AT")

        self.assertLessEqual(start_date, date(2026, 5, 6))
        self.assertGreater(end_date, start_date)

    def test_window_falls_back_to_target_when_no_data_exists(self):
        with mock.patch.object(server, "get_latest_data_timestamp", return_value=None):
            start_date, end_date = server.update_window("AT")

        self.assertEqual(start_date, end_date)


class GapDetectionTest(unittest.TestCase):
    STEP = timedelta(minutes=15)

    def _series(self, *minute_offsets):
        base = datetime(2026, 5, 6, 21, 0, tzinfo=timezone.utc)
        return [(base + timedelta(minutes=m), 10.0) for m in minute_offsets]

    def test_contiguous_series_has_no_gaps(self):
        self.assertEqual(find_gaps(self._series(0, 15, 30, 45), self.STEP), [])

    def test_missing_slot_is_reported(self):
        gaps = find_gaps(self._series(0, 15, 45), self.STEP)
        self.assertEqual(len(gaps), 1)
        self.assertEqual(gaps[0][0], datetime(2026, 5, 6, 21, 15, tzinfo=timezone.utc))

    def test_the_real_two_hour_hole_is_caught(self):
        # Exactly the May 6 22:00-23:45Z hole that shifted every later timestamp.
        series = self._series(0, 45 + 15 + 120)
        self.assertEqual(len(find_gaps(series, self.STEP)), 1)


class IntervalWindowClippingTest(unittest.TestCase):
    """Upstream days are local, not UTC.

    Asking for start=2026-05-07 answers from 2026-05-06T22:00Z. Clipping the
    response at UTC midnight discarded 22:00-23:45Z, which is exactly the stretch
    that bridges back to a stored artifact ending 21:45Z.
    """

    def test_local_day_lead_in_is_kept(self):
        fake_now = datetime(2026, 5, 7, tzinfo=timezone.utc)
        payload = {
            # 22:00Z on May 6 is inside upstream's "May 7" local day.
            "unix_seconds": [
                int((fake_now - timedelta(hours=2) + timedelta(minutes=15 * i)).timestamp())
                for i in range(8)
            ],
            "price": [10.0 + i for i in range(8)],
        }

        with mock.patch.object(build_interval_dataset, "fetch_chunk_payload", return_value=payload):
            records = build_interval_dataset.fetch_interval_records(
                "AT", date(2026, 5, 7), date(2026, 5, 7)
            )

        kept = {timestamp for timestamp, _ in records}
        self.assertIn(datetime(2026, 5, 6, 22, 0, tzinfo=timezone.utc), kept)
        self.assertIn(datetime(2026, 5, 6, 23, 45, tzinfo=timezone.utc), kept)


class MidnightAlignmentTest(unittest.TestCase):
    """The header stores a date, so the decoder starts at that date's UTC midnight.

    A series beginning mid-day reads back shifted by the offset, and the gap check
    cannot see it because the records themselves are perfectly contiguous.
    """

    def _quarter_hours(self, start, count):
        return [(start + timedelta(minutes=15 * i), 10.0) for i in range(count)]

    def test_midnight_series_is_untouched(self):
        records = self._quarter_hours(datetime(2025, 10, 1, tzinfo=timezone.utc), 4)
        self.assertEqual(trim_to_utc_midnight_start(records), records)

    def test_local_day_lead_in_is_trimmed(self):
        # Exactly the 2025-09-30T22:00Z lead-in a from-scratch rebuild pulls in.
        records = self._quarter_hours(datetime(2025, 9, 30, 22, 0, tzinfo=timezone.utc), 12)
        trimmed = trim_to_utc_midnight_start(records)

        self.assertEqual(trimmed[0][0], datetime(2025, 10, 1, tzinfo=timezone.utc))
        self.assertEqual(len(trimmed), 4)

    def test_series_that_never_hits_midnight_is_rejected(self):
        records = self._quarter_hours(datetime(2025, 9, 30, 22, 0, tzinfo=timezone.utc), 4)
        with self.assertRaises(ValueError):
            trim_to_utc_midnight_start(records)


class DailyUpdateWindowTest(unittest.TestCase):
    """The scheduled script must catch up, not append a fresh island.

    Anchoring on "yesterday" meant a missed run merged recent data onto a much
    older artifact, leaving a hole the format cannot represent.
    """

    def test_window_reaches_back_to_where_the_artifacts_end(self):
        with mock.patch.object(daily_update, "latest_stored_date", return_value=date(2026, 5, 6)):
            start_date, end_date = daily_update.update_window("AT")

        self.assertLessEqual(start_date, date(2026, 5, 6))
        self.assertGreater(end_date, date(2026, 5, 6))

    def test_window_collapses_when_nothing_is_stored(self):
        with mock.patch.object(daily_update, "latest_stored_date", return_value=None):
            start_date, end_date = daily_update.update_window("AT")

        self.assertEqual(start_date, end_date)

    def test_countries_come_from_arguments_then_environment(self):
        self.assertEqual(daily_update.countries_to_update(["at", "de-lu"]), ["AT", "DE-LU"])

        with mock.patch.dict(os.environ, {"COUNTRIES": "fr, at"}):
            self.assertEqual(daily_update.countries_to_update(), ["FR", "AT"])


class RetryAfterTest(unittest.TestCase):
    """The limiter answers 429 with Retry-After and we have to obey it.

    The old fixed delays either retried before the window had passed (earning
    another 429) or waited far longer than asked, pushing refreshes towards the
    command timeout.
    """

    class _Response:
        def __init__(self, headers):
            self.headers = headers

    def test_seconds_form_is_honoured(self):
        # Exactly what the API sends: "retry-after: 7".
        response = self._Response({"Retry-After": "7"})
        self.assertEqual(retry_delay_from_response(response, 61), 7)

    def test_missing_header_falls_back(self):
        self.assertEqual(retry_delay_from_response(self._Response({}), 61), 61)

    def test_no_response_falls_back(self):
        self.assertEqual(retry_delay_from_response(None, 61), 61)

    def test_garbage_value_falls_back(self):
        response = self._Response({"Retry-After": "soon"})
        self.assertEqual(retry_delay_from_response(response, 61), 61)

    def test_absurd_value_is_capped(self):
        response = self._Response({"Retry-After": "999999"})
        self.assertEqual(retry_delay_from_response(response, 61), MAX_RETRY_AFTER_SECONDS)

    def test_http_date_form_is_supported(self):
        retry_at = datetime.now(timezone.utc) + timedelta(seconds=30)
        response = self._Response({"Retry-After": retry_at.strftime("%a, %d %b %Y %H:%M:%S GMT")})
        self.assertGreater(retry_delay_from_response(response, 61), 0)
        self.assertLessEqual(retry_delay_from_response(response, 61), 31)

    def test_past_http_date_falls_back(self):
        retry_at = datetime.now(timezone.utc) - timedelta(seconds=30)
        response = self._Response({"Retry-After": retry_at.strftime("%a, %d %b %Y %H:%M:%S GMT")})
        self.assertEqual(retry_delay_from_response(response, 61), 61)


if __name__ == "__main__":
    unittest.main()
