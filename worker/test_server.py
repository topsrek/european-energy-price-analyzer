import unittest
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent))
import server

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_interval_dataset import find_gaps


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


if __name__ == "__main__":
    unittest.main()
