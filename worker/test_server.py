import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server


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


if __name__ == "__main__":
    unittest.main()
