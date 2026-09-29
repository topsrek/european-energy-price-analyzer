import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from worker.server import retry_delay_window


class RetryDelayWindowTest(unittest.TestCase):
    def test_provider_friendly_backoff_windows(self) -> None:
        tz = ZoneInfo("Europe/Vienna")

        self.assertEqual(retry_delay_window(datetime(2026, 8, 13, 13, 20, tzinfo=tz)), (12 * 60, 3 * 60))
        self.assertEqual(retry_delay_window(datetime(2026, 8, 13, 14, 0, tzinfo=tz)), (30 * 60, 10 * 60))
        self.assertEqual(retry_delay_window(datetime(2026, 8, 13, 18, 8, tzinfo=tz)), (2 * 60 * 60, 30 * 60))
        self.assertEqual(retry_delay_window(datetime(2026, 8, 14, 2, 0, tzinfo=tz)), (2 * 60 * 60, 30 * 60))


if __name__ == "__main__":
    unittest.main()
