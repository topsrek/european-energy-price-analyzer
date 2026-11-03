"""Unit tests for the Python data pipeline (no network access).

Run with:  python3 -m unittest discover -s tests -p 'test_*.py'
"""

import json
import logging
import os
import stat
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import build_interval_dataset  # noqa: E402
import metadata_manager  # noqa: E402
import price_downloader  # noqa: E402
import smart_batch_downloader as sbd  # noqa: E402


def utc(*args):
    return datetime(*args, tzinfo=timezone.utc)


def hourly_series(start, hours, price=lambda i: 10.0 + i):
    return [(start + timedelta(hours=i), price(i)) for i in range(hours)]


def encode(records):
    return sbd.OptimizedEnergyPriceEncoder().encode_price_data(records)


def as_payload(records):
    return (
        [int(timestamp.timestamp()) for timestamp, _ in records],
        [price for _, price in records],
    )


class PipelineTestCase(unittest.TestCase):
    def setUp(self):
        logging.disable(logging.CRITICAL)
        self.addCleanup(logging.disable, logging.NOTSET)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        self.public_dir = self.tmp / "public"
        self.metadata_dir = self.tmp / "data"
        self.public_dir.mkdir()
        self.metadata_dir.mkdir()
        self.web_file = self.public_dir / "at_electricity_prices.bin"
        self.metadata_file = self.metadata_dir / "at_electricity_prices_metadata.json"

        real_class = sbd.SmartBatchDownloader
        patcher = mock.patch.object(
            sbd,
            "SmartBatchDownloader",
            side_effect=lambda country: real_class(
                country, public_dir=str(self.public_dir), metadata_dir=str(self.metadata_dir)
            ),
        )
        patcher.start()
        self.addCleanup(patcher.stop)

        sleep_patcher = mock.patch("time.sleep")
        sleep_patcher.start()
        self.addCleanup(sleep_patcher.stop)

    def mock_download(self, result):
        """Patch the API call; result is a value or a callable(start, end)."""
        side_effect = result if callable(result) else (lambda *_: result)
        patcher = mock.patch.object(
            sbd.EnergyPriceDownloader,
            "download_date_range_data",
            autospec=True,
            side_effect=lambda _self, start, end: side_effect(start, end),
        )
        mocked = patcher.start()
        self.addCleanup(patcher.stop)
        return mocked

    def stored_records(self):
        return sbd.OptimizedPriceDecoder(self.web_file.read_bytes()).decode_all()


class TruncatedLongRecordTest(unittest.TestCase):
    def test_both_decoders_raise_on_truncated_long_record(self):
        data = encode(hourly_series(utc(2025, 6, 1), 24, price=lambda i: -10.0))[:-1]
        for decoder in (sbd.OptimizedPriceDecoder, build_interval_dataset.IntervalPriceDecoder):
            with self.subTest(decoder=decoder.__name__), self.assertRaises(ValueError):
                decoder(data).decode_all()


class HourlyCorruptArtifactTest(PipelineTestCase):
    """H1: a damaged artifact must never be replaced by just the fetch window."""

    def assert_refused_untouched(self, original: bytes, argv):
        download = self.mock_download(as_payload(hourly_series(utc(2025, 6, 1), 24)))
        self.assertNotEqual(sbd.main(argv), 0)
        self.assertEqual(self.web_file.read_bytes(), original)
        self.assertFalse(self.metadata_file.exists())
        download.assert_not_called()

    def test_headerless_file_exits_nonzero_and_is_untouched(self):
        self.web_file.write_bytes(b"\x01\x02")
        self.assert_refused_untouched(b"\x01\x02", ["AT", "2025-06-01", "2025-06-01"])

    def test_file_decoding_to_no_records_exits_nonzero(self):
        header_only = encode(hourly_series(utc(2025, 6, 1), 1))[:4]
        self.web_file.write_bytes(header_only)
        self.assert_refused_untouched(header_only, ["AT", "2025-06-01", "2025-06-01"])

    def test_truncated_file_smaller_than_metadata_count_is_not_overwritten(self):
        original = encode(hourly_series(utc(2025, 6, 1), 48))
        self.web_file.write_bytes(original)
        self.metadata_file.write_text(json.dumps({"data_coverage": {"total_records": 500}}))
        self.mock_download(as_payload(hourly_series(utc(2025, 6, 2), 24, price=lambda i: 99.0)))

        self.assertNotEqual(sbd.main(["AT", "2025-06-02", "2025-06-02"]), 0)
        self.assertEqual(self.web_file.read_bytes(), original)

    def test_unchanged_truncated_series_is_refused(self):
        records = hourly_series(utc(2025, 6, 1), 23)
        self.web_file.write_bytes(encode(records))
        self.metadata_file.write_text(json.dumps({"data_coverage": {"total_records": 24}}))
        self.mock_download(as_payload(records))
        self.assertNotEqual(sbd.main(["AT", "2025-06-01", "2025-06-01"]), 0)

    def test_rebuild_flag_allows_replacing_a_damaged_file(self):
        self.web_file.write_bytes(b"\x01\x02")
        self.mock_download(as_payload(hourly_series(utc(2025, 6, 1), 24)))

        self.assertEqual(sbd.main(["AT", "2025-06-01", "2025-06-01", "--rebuild"]), 0)
        self.assertEqual(len(self.stored_records()), 24)


class IntervalCorruptArtifactTest(PipelineTestCase):
    """H1 for the 15-minute builder: <4 byte files used to decode to []."""

    def setUp(self):
        super().setUp()
        for name, value in (("PUBLIC_DIR", self.public_dir), ("METADATA_DIR", self.metadata_dir)):
            patcher = mock.patch.object(build_interval_dataset, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.interval_file = self.public_dir / "at_electricity_prices_15min.bin"

    def test_tiny_file_exits_nonzero_and_is_untouched(self):
        self.interval_file.write_bytes(b"\x00")
        with mock.patch.object(build_interval_dataset, "fetch_interval_records") as fetch:
            self.assertNotEqual(build_interval_dataset.main(["AT", "2026-05-06", "2026-05-07"]), 0)
            fetch.assert_not_called()
        self.assertEqual(self.interval_file.read_bytes(), b"\x00")
        self.assertFalse((self.metadata_dir / "at_electricity_prices_15min_metadata.json").exists())

    def test_unchanged_truncated_interval_series_is_refused(self):
        records = [(utc(2025, 10, 1) + timedelta(minutes=15*i), 10.0) for i in range(95)]
        self.interval_file.write_bytes(encode(records))
        path = self.metadata_dir / "at_electricity_prices_15min_metadata.json"
        path.write_text(json.dumps({"data_coverage": {"total_records": 96}}))
        with mock.patch.object(build_interval_dataset, "fetch_interval_records", return_value=records):
            self.assertNotEqual(build_interval_dataset.main(["AT", "2025-10-01", "2025-10-01"]), 0)

    def test_new_quarter_hours_win_over_stored_ones(self):
        start = utc(2026, 5, 6)
        stored = [(start + timedelta(minutes=15 * i), 10.0) for i in range(96)]
        self.interval_file.write_bytes(encode(stored))
        fresh = [(start + timedelta(minutes=15 * i), 20.0) for i in range(192)]

        with mock.patch.object(build_interval_dataset, "fetch_interval_records", return_value=fresh):
            self.assertEqual(build_interval_dataset.main(["AT", "2026-05-06", "2026-05-07"]), 0)

        records = build_interval_dataset.IntervalPriceDecoder(self.interval_file.read_bytes()).decode_all()
        self.assertEqual(len(records), 192)
        self.assertTrue(all(price == 20.0 for _, price in records))


class GapRefusalTest(PipelineTestCase):
    def test_gapped_upstream_exits_nonzero_without_artifact(self):
        records = hourly_series(utc(2020, 1, 1), 48)
        del records[12]
        self.mock_download(as_payload(records))
        self.assertNotEqual(sbd.main(["AT", "2020-01-01", "2020-01-02", "--rebuild"]), 0)
        self.assertFalse(self.web_file.exists())


class MetadataReconciliationTest(PipelineTestCase):
    def setUp(self):
        super().setUp()
        for name, value in (("PUBLIC_DIR", self.public_dir), ("METADATA_DIR", self.metadata_dir)):
            patcher = mock.patch.object(build_interval_dataset, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.interval_file = self.public_dir / "at_electricity_prices_15min.bin"

    def test_unchanged_series_repairs_missing_or_stale_metadata(self):
        for interval in (False, True):
            records = [(utc(2025, 10, 1) + timedelta(minutes=(15 if interval else 60)*i), 10.0) for i in range(24)]
            binary = self.interval_file if interval else self.web_file
            path = self.metadata_dir / ("at_electricity_prices_15min_metadata.json" if interval else "at_electricity_prices_metadata.json")
            binary.write_bytes(encode(records))
            for stale in (None, {"data_coverage": {"total_records": 1, "last_timestamp": "wrong"}, "file_info": {"file_size": 1}}):
                with self.subTest(interval=interval, stale=stale):
                    path.unlink(missing_ok=True)
                    if stale is not None:
                        path.write_text(json.dumps(stale))
                    if interval:
                        with mock.patch.object(build_interval_dataset, "fetch_interval_records", return_value=records):
                            self.assertEqual(build_interval_dataset.main(["AT", "2025-10-01", "2025-10-01"]), 0)
                    else:
                        with mock.patch.object(sbd.EnergyPriceDownloader, "download_date_range_data", return_value=as_payload([(t + timedelta(minutes=m), v) for t,v in records for m in (0,15,30,45)])):
                            self.assertEqual(sbd.main(["AT", "2025-10-01", "2025-10-01"]), 0)
                    metadata = json.loads(path.read_text())
                    self.assertEqual(metadata["data_coverage"]["total_records"], len(records))
                    self.assertEqual(metadata["data_coverage"]["first_timestamp"], records[0][0].isoformat())
                    self.assertEqual(metadata["data_coverage"]["last_timestamp"], records[-1][0].isoformat())
                    self.assertEqual(metadata["file_info"]["file_size"], binary.stat().st_size)
                    self.assertEqual(binary.read_bytes(), encode(records))


class QuarterHourAggregationTest(unittest.TestCase):
    """H3: the hourly price is the mean of the four quarter-hours."""

    def quarters(self, hour, prices):
        return [(hour + timedelta(minutes=15 * i), price) for i, price in enumerate(prices)]

    def test_complete_hour_becomes_the_mean(self):
        hour = utc(2026, 5, 6, 10)
        hourly, incomplete = sbd.aggregate_to_hourly(self.quarters(hour, [10.0, 20.0, 30.0, 40.0]))
        self.assertEqual(hourly, [(hour, 25.0)])
        self.assertEqual(incomplete, [])

    def test_incomplete_hour_is_skipped_not_written_from_the_first_quarter(self):
        full = utc(2026, 5, 6, 10)
        partial = utc(2026, 5, 6, 11)
        records = self.quarters(full, [1.0, 2.0, 3.0, 4.0]) + self.quarters(partial, [50.0, 60.0, 70.0])
        hourly, incomplete = sbd.aggregate_to_hourly(records)
        self.assertEqual(hourly, [(full, 2.5)])
        self.assertEqual(incomplete, [partial])

    def test_lone_top_of_hour_after_switch_is_incomplete_when_quarters_exist(self):
        full = utc(2026, 5, 6, 10)
        lone = utc(2026, 5, 6, 11)
        hourly, incomplete = sbd.aggregate_to_hourly(self.quarters(full, [1.0, 2.0, 3.0, 4.0]) + [(lone, 9.0)])
        self.assertEqual(hourly, [(full, 2.5)])
        self.assertEqual(incomplete, [lone])

    def test_all_first_quarters_after_switch_are_incomplete(self):
        records = self.quarters(utc(2025, 10, 1), [10.0, None, None, None])
        self.assertEqual(sbd.aggregate_to_hourly(records), ([], [utc(2025, 10, 1)]))

    def test_pre_switch_hourly_data_is_unchanged(self):
        records = hourly_series(utc(2025, 9, 29, 0), 46)
        hourly, incomplete = sbd.aggregate_to_hourly(records)
        self.assertEqual(hourly, records)
        self.assertEqual(incomplete, [])

    def test_series_spanning_the_switch(self):
        before = hourly_series(utc(2025, 9, 30, 20), 2)  # 20:00Z, 21:00Z hourly
        after = self.quarters(utc(2025, 9, 30, 22), [4.0, 8.0, 12.0, 16.0])
        hourly, incomplete = sbd.aggregate_to_hourly(before + after)
        self.assertEqual(hourly, before + [(utc(2025, 9, 30, 22), 10.0)])
        self.assertEqual(incomplete, [])

    def test_download_window_aggregates_upstream_quarter_hours(self):
        logging.disable(logging.CRITICAL)
        self.addCleanup(logging.disable, logging.NOTSET)
        start = utc(2026, 5, 6)
        upstream = [(start + timedelta(minutes=15 * i), float(i)) for i in range(96 + 3)]  # 3 extra quarters

        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(
            sbd.EnergyPriceDownloader, "download_date_range_data", return_value=as_payload(upstream)
        ):
            downloader = sbd.SmartBatchDownloader("AT", public_dir=tmp, metadata_dir=tmp)
            hourly = downloader.download_window(date(2026, 5, 6), date(2026, 5, 7))

        self.assertEqual(len(hourly), 24)
        self.assertEqual(hourly[0], (start, 1.5))  # mean of 0, 1, 2, 3
        self.assertEqual(hourly[-1], (utc(2026, 5, 6, 23), 93.5))


class OverlapRefetchTest(PipelineTestCase):
    """M1: stored days are re-fetched, partial days complete, new values win."""

    def test_partial_last_day_is_completed_and_corrections_land(self):
        day1 = utc(2025, 6, 1)
        # Day 1 complete, day 2 partial (only 00:00-09:00 stored).
        self.web_file.write_bytes(encode(hourly_series(day1, 34, price=lambda i: 10.0)))
        upstream = hourly_series(day1, 48, price=lambda i: 50.0)  # corrected + completed
        download = self.mock_download(as_payload(upstream))

        self.assertEqual(sbd.main(["AT", "2025-06-01", "2025-06-02"]), 0)

        # The already-covered day was requested too.
        requested = [(call.args[1], call.args[2]) for call in download.call_args_list]
        self.assertEqual(requested, [(date(2025, 6, 1), date(2025, 6, 2))])

        records = self.stored_records()
        self.assertEqual(len(records), 48)
        self.assertEqual(records[-1][0], utc(2025, 6, 2, 23))
        self.assertTrue(all(price == 50.0 for _, price in records))

        metadata = json.loads(self.metadata_file.read_text())
        self.assertEqual(metadata["data_coverage"]["total_records"], 48)
        self.assertEqual(metadata["data_coverage"]["last_timestamp"], "2025-06-02T23:00:00+00:00")
        self.assertEqual(metadata["file_info"]["file_size"], self.web_file.stat().st_size)
        self.assertIsNotNone(datetime.fromisoformat(metadata["file_info"]["last_updated"]).utcoffset())

    def test_history_outside_the_window_is_kept(self):
        self.web_file.write_bytes(encode(hourly_series(utc(2025, 5, 1), 24 * 31, price=lambda i: 1.0)))
        self.mock_download(as_payload(hourly_series(utc(2025, 5, 31), 48, price=lambda i: 2.0)))

        self.assertEqual(sbd.main(["AT", "2025-05-31", "2025-06-01"]), 0)

        records = self.stored_records()
        self.assertEqual(len(records), 24 * 32)
        self.assertEqual(records[0], (utc(2025, 5, 1), 1.0))
        self.assertEqual(records[-1], (utc(2025, 6, 1, 23), 2.0))

    def test_merge_prefers_new_records(self):
        ts = utc(2025, 6, 1)
        merged = sbd.merge_records([(ts, 1.0)], [(ts, 2.0), (ts + timedelta(hours=1), 3.0)])
        self.assertEqual(merged, [(ts, 2.0), (ts + timedelta(hours=1), 3.0)])


class FirstQuarterOverwriteTest(PipelineTestCase):
    def test_null_quarters_do_not_overwrite_hourly_means(self):
        start = utc(2025, 10, 1)
        original = encode(hourly_series(start, 24, price=lambda i: 25.0))
        self.web_file.write_bytes(original)
        self.mock_download(as_payload([(start + timedelta(minutes=15*i), 10.0 if i % 4 == 0 else None) for i in range(96)]))
        self.assertEqual(sbd.main(["AT", "2025-10-01", "2025-10-01"]), 0)
        self.assertEqual(self.web_file.read_bytes(), original)


class EmptyAndFailedDownloadTest(PipelineTestCase):
    """L7: nothing published yet is not an error; a failed download is."""

    def setUp(self):
        super().setUp()
        self.original = encode(hourly_series(utc(2025, 6, 1), 24))
        self.web_file.write_bytes(self.original)

    def test_unpublished_day_exits_zero_without_writing(self):
        self.mock_download(([], []))
        self.assertEqual(sbd.main(["AT", "2025-06-02", "2025-06-02"]), 0)
        self.assertEqual(self.web_file.read_bytes(), self.original)
        self.assertEqual(json.loads(self.metadata_file.read_text())["data_coverage"]["total_records"], 24)

    def test_download_failure_exits_nonzero(self):
        self.mock_download(None)
        self.assertEqual(sbd.main(["AT", "2025-06-02", "2025-06-02"]), 1)
        self.assertEqual(self.web_file.read_bytes(), self.original)


class AtomicWriteTest(unittest.TestCase):
    """M5: readers see either the old or the new file, never a torn one."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = Path(tmp.name)
        self.path = self.dir / "artifact.bin"

    def test_writes_content_and_leaves_no_temp_files(self):
        metadata_manager.atomic_write_bytes(self.path, b"new")
        self.assertEqual(self.path.read_bytes(), b"new")
        self.assertEqual(os.listdir(self.dir), ["artifact.bin"])

    @unittest.skipIf(os.name == "nt", "POSIX file modes")
    def test_new_file_gets_the_default_mode(self):
        metadata_manager.atomic_write_bytes(self.path, b"new")
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), metadata_manager.DEFAULT_FILE_MODE)

    @unittest.skipIf(os.name == "nt", "POSIX file modes")
    def test_existing_permissions_are_preserved(self):
        self.path.write_bytes(b"old")
        os.chmod(self.path, 0o640)
        metadata_manager.atomic_write_bytes(self.path, b"new")
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o640)

    def test_failure_keeps_the_old_file_and_cleans_up(self):
        self.path.write_bytes(b"old")
        with mock.patch.object(metadata_manager.os, "replace", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                metadata_manager.atomic_write_bytes(self.path, b"new")
        self.assertEqual(self.path.read_bytes(), b"old")
        self.assertEqual(os.listdir(self.dir), ["artifact.bin"])

    def test_data_is_fsynced_before_the_rename(self):
        order = []
        real_fsync, real_replace = os.fsync, os.replace
        with mock.patch.object(metadata_manager.os, "fsync", side_effect=lambda fd: (order.append("fsync"), real_fsync(fd))), \
                mock.patch.object(metadata_manager.os, "replace", side_effect=lambda a, b: (order.append("replace"), real_replace(a, b))):
            metadata_manager.atomic_write_text(self.path, "hello")
        self.assertEqual(order[:2], ["fsync", "replace"])
        self.assertEqual(self.path.read_text(), "hello")


class RetryPolicyTest(unittest.TestCase):
    """L6: only 429, 5xx and connection problems are retried."""

    @staticmethod
    def response(status, body=None, headers=None):
        resp = requests.Response()
        resp.status_code = status
        resp._content = json.dumps(body or {}).encode()
        resp.headers.update(headers or {})
        resp.url = "https://example.invalid"
        return resp

    def http_error(self, status):
        return requests.exceptions.HTTPError(response=self.response(status))

    def test_classification(self):
        self.assertTrue(price_downloader.is_retryable_error(self.http_error(429)))
        self.assertTrue(price_downloader.is_retryable_error(self.http_error(503)))
        self.assertTrue(price_downloader.is_retryable_error(requests.exceptions.ConnectionError()))
        self.assertTrue(price_downloader.is_retryable_error(requests.exceptions.ReadTimeout()))
        self.assertFalse(price_downloader.is_retryable_error(self.http_error(400)))
        self.assertFalse(price_downloader.is_retryable_error(self.http_error(404)))

    def test_hourly_client_does_not_retry_4xx(self):
        logging.disable(logging.CRITICAL)
        self.addCleanup(logging.disable, logging.NOTSET)
        downloader = price_downloader.EnergyPriceDownloader("AT")
        with mock.patch.object(downloader.session, "get", return_value=self.response(400)) as get, \
                mock.patch("time.sleep") as sleep:
            self.assertIsNone(downloader.download_date_range_data(date(2026, 5, 6), date(2026, 5, 6)))
        self.assertEqual(get.call_count, 1)
        sleep.assert_not_called()

    def test_hourly_client_retries_429_honouring_retry_after(self):
        logging.disable(logging.CRITICAL)
        self.addCleanup(logging.disable, logging.NOTSET)
        downloader = price_downloader.EnergyPriceDownloader("AT")
        ok = self.response(200, {"unix_seconds": [1], "price": [2.0]})
        limited = self.response(429, headers={"Retry-After": "7"})
        with mock.patch.object(downloader.session, "get", side_effect=[limited, ok]) as get, \
                mock.patch("time.sleep") as sleep:
            self.assertEqual(downloader.download_date_range_data(date(2026, 5, 6), date(2026, 5, 6)), ([1], [2.0]))
        self.assertEqual(get.call_count, 2)
        sleep.assert_called_once_with(7.0)

    def test_interval_client_does_not_retry_4xx(self):
        logging.disable(logging.CRITICAL)
        self.addCleanup(logging.disable, logging.NOTSET)
        session = mock.Mock()
        session.get.return_value = self.response(404)
        with mock.patch("time.sleep") as sleep:
            with self.assertRaises(RuntimeError):
                build_interval_dataset.fetch_chunk_payload(session, "AT", date(2026, 5, 6), date(2026, 5, 6))
        self.assertEqual(session.get.call_count, 1)
        sleep.assert_not_called()

    def test_interval_client_retries_5xx(self):
        logging.disable(logging.CRITICAL)
        self.addCleanup(logging.disable, logging.NOTSET)
        session = mock.Mock()
        session.get.side_effect = [self.response(502), self.response(200, {"unix_seconds": [], "price": []})]
        with mock.patch("time.sleep"):
            payload = build_interval_dataset.fetch_chunk_payload(session, "AT", date(2026, 5, 6), date(2026, 5, 6))
        self.assertEqual(payload, {"unix_seconds": [], "price": []})
        self.assertEqual(session.get.call_count, 2)



class EncoderModeBoundaryTest(unittest.TestCase):
    """Prices that round to 163.84 must use the long form, not be clamped to 163.83."""

    def setUp(self):
        logging.disable(logging.CRITICAL)
        self.addCleanup(logging.disable, logging.NOTSET)

    def round_trip(self, prices):
        records = hourly_series(utc(2026, 7, 31), len(prices), price=lambda i: prices[i])
        return [price for _, price in sbd.OptimizedPriceDecoder(encode(records)).decode_all()]

    def test_values_rounding_to_16384_cents_survive(self):
        # 163.8375 is exactly the AT 2026-07-31 23:00Z hourly mean that was stored as 163.83.
        self.assertEqual(self.round_trip([163.8375, 163.835, 163.839, 163.84]), [163.84] * 4)

    def test_short_form_range_and_neighbours(self):
        prices = [0.0, 0.01, 163.83, 163.834, 163.85, 1000.0, -0.5, -163.84, 3000.0]
        self.assertEqual(self.round_trip(prices), [0.0, 0.01, 163.83, 163.83, 163.85, 1000.0, -0.5, -163.84, 3000.0])

    def test_short_form_is_still_used_below_the_limit(self):
        encoder = sbd.OptimizedEnergyPriceEncoder()
        encoder.write_price_record(163.83)
        self.assertEqual(encoder.bit_position, 15)
        encoder = sbd.OptimizedEnergyPriceEncoder()
        encoder.write_price_record(163.8375)
        self.assertEqual(encoder.bit_position, 21)


class HourlyIntervalConsistencyTest(PipelineTestCase):
    """The hourly artifact must equal the mean of the 15-minute one where both exist."""

    def setUp(self):
        super().setUp()
        for name, value in (("PUBLIC_DIR", self.public_dir), ("METADATA_DIR", self.metadata_dir)):
            patcher = mock.patch.object(build_interval_dataset, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.start = utc(2025, 11, 12)
        self.quarters = [(self.start + timedelta(minutes=15 * i), float(i % 4)) for i in range(96)]

    def test_matching_series_has_no_mismatches(self):
        hourly = hourly_series(self.start, 24, price=lambda i: 1.5)
        self.assertEqual(build_interval_dataset.hourly_interval_mismatches(hourly, self.quarters), [])

    def test_half_cent_rounding_is_tolerated(self):
        quarters = [(ts, 163.8375 if ts.hour == 0 else 1.0) for ts, _ in self.quarters]
        hourly = hourly_series(self.start, 24, price=lambda i: 163.84 if i == 0 else 1.0)
        self.assertEqual(build_interval_dataset.hourly_interval_mismatches(hourly, quarters), [])

    def test_stale_hour_is_reported_and_logged(self):
        # Exactly the FR 2025-11-12 09:00Z case: one artifact missed an upstream correction.
        hourly = hourly_series(self.start, 24, price=lambda i: 2.09 if i == 9 else 1.5)
        self.web_file.write_bytes(encode(hourly))

        logging.disable(logging.NOTSET)
        with self.assertLogs(build_interval_dataset.logger, level="WARNING") as logs:
            mismatches = build_interval_dataset.check_hourly_consistency("AT", self.quarters)

        self.assertEqual([hour for hour, _, _ in mismatches], [utc(2025, 11, 12, 9)])
        self.assertIn("1 hour(s)", logs.output[0])

    def test_hours_without_all_quarters_are_skipped(self):
        hourly = hourly_series(self.start, 25, price=lambda i: 99.0 if i == 24 else 1.5)
        self.assertEqual(build_interval_dataset.hourly_interval_mismatches(hourly, self.quarters), [])

    def test_builder_runs_the_check_after_writing(self):
        self.web_file.write_bytes(encode(hourly_series(self.start, 24, price=lambda i: 1.5)))
        with mock.patch.object(build_interval_dataset, "fetch_interval_records", return_value=self.quarters), \
                mock.patch.object(build_interval_dataset, "check_hourly_consistency", return_value=[]) as check:
            self.assertEqual(build_interval_dataset.main(["AT", "2025-11-12", "2025-11-12"]), 0)
        check.assert_called_once()
        self.assertEqual(len(check.call_args.args[1]), 96)


class DataDirTest(unittest.TestCase):
    """DATA_DIR moves artifacts and metadata onto a persistent volume."""

    def test_defaults_are_the_repository_paths(self):
        with mock.patch.dict(os.environ, {"DATA_DIR": ""}):
            self.assertEqual(metadata_manager.artifact_dir(), metadata_manager.REPO_ROOT / "public")
            self.assertEqual(metadata_manager.metadata_dir(), metadata_manager.REPO_ROOT / "scripts" / "data")

    def test_data_dir_is_honoured(self):
        with mock.patch.dict(os.environ, {"DATA_DIR": "/srv/eepa"}):
            self.assertEqual(metadata_manager.artifact_dir(), Path("/srv/eepa/public"))
            self.assertEqual(metadata_manager.metadata_dir(), Path("/srv/eepa/metadata"))
            with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(os.environ, {"DATA_DIR": tmp}):
                downloader = sbd.SmartBatchDownloader("AT")
                self.assertEqual(downloader.web_file, Path(tmp) / "public" / "at_electricity_prices.bin")
                self.assertEqual(downloader.metadata.metadata_file.parent, Path(tmp) / "metadata")
                downloader.close()


class CommittedArtifactsTest(unittest.TestCase):
    """The artifacts in the repository decode cleanly and agree with their metadata."""

    REPO = Path(__file__).resolve().parents[1]

    def setUp(self):
        logging.disable(logging.CRITICAL)
        self.addCleanup(logging.disable, logging.NOTSET)

    def load(self, name, step):
        data = (self.REPO / "public" / f"{name}.bin").read_bytes()
        decoder = sbd.OptimizedPriceDecoder if step == timedelta(hours=1) else build_interval_dataset.IntervalPriceDecoder
        records = decoder(data).decode_all()
        metadata = json.loads((self.REPO / "scripts" / "data" / f"{name}_metadata.json").read_text(encoding="utf-8"))
        return data, records, metadata

    def test_series_are_contiguous_and_match_their_metadata(self):
        for country in ("at", "de-lu", "fr"):
            series = {}
            for suffix, step in (("", timedelta(hours=1)), ("_15min", timedelta(minutes=15))):
                name = f"{country}_electricity_prices{suffix}"
                with self.subTest(artifact=name):
                    data, records, metadata = self.load(name, step)
                    coverage = metadata["data_coverage"]
                    self.assertEqual(build_interval_dataset.find_gaps(records, step), [])
                    self.assertEqual(records[0][0].time(), datetime.min.time())
                    self.assertEqual(coverage["total_records"], len(records))
                    self.assertEqual(coverage["first_timestamp"], records[0][0].isoformat())
                    self.assertEqual(coverage["last_timestamp"], records[-1][0].isoformat())
                    self.assertEqual(coverage["covered_dates"], sorted({ts.date().isoformat() for ts, _ in records}))
                    self.assertEqual(metadata["file_info"]["file_size"], len(data))
                    series[suffix] = records
            with self.subTest(country=country, check="hourly is the quarter-hour mean"):
                self.assertEqual(build_interval_dataset.hourly_interval_mismatches(series[""], series["_15min"]), [])

    def test_committed_prices_match_upstream_literals(self):
        # Energy Charts /price, fetched 2026-11-03; timestamps are UTC.
        samples = [
            ('at', '', '2019-06-04T00:00:00+00:00', 31.86),
            ('at', '', '2020-06-04T00:00:00+00:00', 19.61),
            ('at', '', '2021-06-04T00:00:00+00:00', 60.04),
            ('at', '', '2022-06-04T00:00:00+00:00', 166.92),
            ('at', '', '2023-06-04T00:00:00+00:00', 72.51),
            ('at', '', '2024-06-04T00:00:00+00:00', 96.17),
            ('at', '', '2025-06-04T00:00:00+00:00', 71.36),
            ('at', '', '2018-10-04T00:00:00+00:00', 60.68),
            ('at', '', '2025-10-26T00:00:00+00:00', 87.1),
            ('at', '_15min', '2025-10-26T00:00:00+00:00', 98.06),
            ('at', '_15min', '2025-10-26T00:15:00+00:00', 90.9),
            ('at', '', '2026-03-29T00:00:00+00:00', 110.36),
            ('at', '_15min', '2026-03-29T00:00:00+00:00', 113.47),
            ('at', '_15min', '2026-03-29T00:15:00+00:00', 109.23),
            ('de-lu', '', '2025-07-04T00:00:00+00:00', 101.31),
            ('de-lu', '', '2025-09-23T00:00:00+00:00', 89.73),
            ('de-lu', '', '2025-10-26T00:00:00+00:00', 3.19),
            ('de-lu', '_15min', '2025-10-26T00:00:00+00:00', 3.99),
            ('de-lu', '_15min', '2025-10-26T00:15:00+00:00', 3.33),
            ('de-lu', '', '2026-03-29T00:00:00+00:00', 107.7),
            ('de-lu', '_15min', '2026-03-29T00:00:00+00:00', 112.05),
            ('de-lu', '_15min', '2026-03-29T00:15:00+00:00', 107.51),
            ('fr', '', '2025-07-04T00:00:00+00:00', 85.37),
            ('fr', '', '2025-09-23T00:00:00+00:00', 1.5),
            ('fr', '', '2025-10-26T00:00:00+00:00', 16.0),
            ('fr', '_15min', '2025-10-26T00:00:00+00:00', 43.68),
            ('fr', '_15min', '2025-10-26T00:15:00+00:00', 10.88),
            ('fr', '', '2026-03-29T00:00:00+00:00', 89.84),
            ('fr', '_15min', '2026-03-29T00:00:00+00:00', 102.51),
            ('fr', '_15min', '2026-03-29T00:15:00+00:00', 96.0),
        ]
        decoded = {}
        for cc, suffix, timestamp, expected in samples:
            name = f"{cc}_electricity_prices{suffix}"
            if name not in decoded:
                _, records, _ = self.load(name, timedelta(minutes=15 if suffix else 60))
                decoded[name] = dict(records)
            with self.subTest(artifact=name, timestamp=timestamp):
                self.assertAlmostEqual(decoded[name][datetime.fromisoformat(timestamp)], expected, places=2)

    def test_at_hourly_starts_with_the_at_bidding_zone(self):
        # The AT zone starts 2018-09-30 22:00Z; the first UTC midnight after it is 2018-10-01.
        _, records, _ = self.load("at_electricity_prices", timedelta(hours=1))
        self.assertEqual(records[0][0], utc(2018, 10, 1))


if __name__ == "__main__":
    unittest.main()
