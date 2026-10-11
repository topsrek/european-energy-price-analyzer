import base64
import hashlib
import http.client
import json
import logging
import os
import socket
import tempfile
import threading
import time
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



INDEX_HTML = """<!DOCTYPE html>
<html><head>
<script>document.documentElement.dataset.theme = "dark";</script>
<script type="application/ld+json">{"@type": "WebSite"}</script>
<script type="module" crossorigin src="/assets/index.js"></script>
</head><body><div id="root"></div></body></html>
"""
THEME_SCRIPT = 'document.documentElement.dataset.theme = "dark";'


class HttpServerTestCase(unittest.TestCase):
    """Runs the real handler on an ephemeral port against temporary directories."""

    connection_limit = 8
    loopback_reserve = server.LOOPBACK_RESERVED_CONNECTIONS

    def setUp(self):
        logging.disable(logging.CRITICAL)
        self.addCleanup(logging.disable, logging.NOTSET)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)

        self.dist = self.tmp / "dist"
        self.dist.mkdir()
        (self.dist / "index.html").write_text(INDEX_HTML, encoding="utf-8")
        # The stale build copy that must never be served.
        (self.dist / "at_electricity_prices.bin").write_bytes(b"stale")

        self.data_dir = self.tmp / "storage"
        (self.data_dir / "public").mkdir(parents=True)
        (self.data_dir / "metadata").mkdir(parents=True)
        (self.data_dir / "public" / "at_electricity_prices.bin").write_bytes(b"live")
        (self.data_dir / "metadata" / "at_electricity_prices_metadata.json").write_text(
            json.dumps({"data_coverage": {"last_timestamp": "2026-06-03T21:00:00+00:00"}})
        )

        for patcher in (
            mock.patch.object(server, "DIST_ROOT", self.dist),
            mock.patch.dict(os.environ, {"DATA_DIR": str(self.data_dir), "CORS_ORIGIN": "*"}),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

        self.httpd = server.BoundedThreadingHTTPServer(
            ("127.0.0.1", 0), server.Handler, connection_limit=self.connection_limit
        )
        self.httpd._loopback_slots = threading.BoundedSemaphore(self.loopback_reserve) if self.loopback_reserve else threading.Semaphore(0)
        self.port = self.httpd.server_address[1]
        thread = threading.Thread(target=self.httpd.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)
        thread.start()
        self.addCleanup(self.httpd.server_close)
        self.addCleanup(self.httpd.shutdown)

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            conn.request(method, path, body=body, headers=headers or {})
            response = conn.getresponse()
            return response.status, {k.lower(): v for k, v in response.getheaders()}, response.read()
        finally:
            conn.close()

    def post_json(self, path, payload):
        body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        return self.request("POST", path, body=body, headers={"Content-Type": "application/json"})


class StaticAndBinaryRoutesTest(HttpServerTestCase):
    def test_binary_path_regex(self):
        self.assertTrue(server.PUBLIC_BINARY_PATH_RE.fullmatch("/at_electricity_prices.bin"))
        self.assertTrue(server.PUBLIC_BINARY_PATH_RE.fullmatch("/de-lu_electricity_prices_15min.bin"))
        for path in ("/at_electricity_prices.bin/", "/../at_electricity_prices.bin", "/AT_electricity_prices.bin",
                     "/at_electricity_prices.bin\n", "/x/at_electricity_prices.bin"):
            self.assertIsNone(server.PUBLIC_BINARY_PATH_RE.fullmatch(path), path)

    def test_live_artifact_is_served_from_the_data_dir(self):
        for path in ("/at_electricity_prices.bin", "/api/at_electricity_prices.bin"):
            status, headers, body = self.request("GET", path)
            self.assertEqual((status, body), (200, b"live"), path)
            self.assertEqual(headers["x-content-type-options"], "nosniff")

    def test_trailing_slash_does_not_reach_the_stale_dist_copy(self):
        for path in ("/at_electricity_prices.bin/", "/api/at_electricity_prices.bin/", "/fr_electricity_prices.bin"):
            status, headers, body = self.request("GET", path)
            self.assertEqual(status, 404, path)
            self.assertNotIn(b"stale", body)
            self.assertEqual(headers["x-content-type-options"], "nosniff")

    def test_health_is_200(self):
        status, headers, body = self.request("GET", "/health")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["service"], "eepa-worker")
        self.assertEqual(headers["cache-control"], "no-store")

    def test_html_gets_a_full_csp_with_the_inline_script_hash(self):
        status, headers, body = self.request("GET", "/at")
        self.assertEqual(status, 200)
        self.assertIn(b'id="root"', body)
        csp = headers["content-security-policy"]
        expected_hash = base64.b64encode(hashlib.sha256(THEME_SCRIPT.encode()).digest()).decode()
        self.assertIn(f"script-src 'self' 'sha256-{expected_hash}'", csp)
        self.assertEqual(csp.count("sha256-"), 1, "JSON-LD and src scripts need no hash")
        for directive in ("default-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'self'",
                          "style-src 'self' 'unsafe-inline'", "connect-src 'self'"):
            self.assertIn(directive, csp)
        self.assertEqual(headers["x-content-type-options"], "nosniff")
        self.assertNotIn("strict-transport-security", headers)

    def test_no_hsts_from_worker(self):
        # The TLS proxy owns HSTS; a weaker duplicate from the worker would take precedence.
        _, headers, _ = self.request("GET", "/health", headers={"X-Forwarded-Proto": "https"})
        self.assertNotIn("strict-transport-security", headers)

    def test_json_404_has_security_headers(self):
        status, headers, _ = self.request("POST", "/nope", body=b"{}")
        self.assertEqual(status, 404)
        self.assertEqual(headers["x-content-type-options"], "nosniff")
        self.assertIn("referrer-policy", headers)

    def test_geoip_header_is_validated(self):
        _, _, body = self.request("GET", "/geoip", headers={"CF-IPCountry": "at"})
        self.assertEqual(json.loads(body)["country_code"], "AT")
        with mock.patch.dict(os.environ, {"GEOIP_PROVIDER_URL": ""}):
            _, _, body = self.request("GET", "/geoip", headers={"CF-IPCountry": "<script>alert(1)</script>"})
        self.assertIsNone(json.loads(body)["country_code"])


class DataFreshnessHttpTest(HttpServerTestCase):
    def test_fresh_request(self):
        status, _, body = self.post_json("/api/data-freshness", {"countryCode": "AT", "latestTimestamp": "2026-06-03T21:00:00Z"})
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["fresh"])

    def test_body_over_limit_is_rejected(self):
        status, _, body = self.post_json("/data-freshness", b"{" + b" " * 5000 + b"}")
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["message"], "request body too large")

    def test_overflowing_timestamp_is_a_400_not_a_500(self):
        status, _, body = self.post_json(
            "/data-freshness", {"countryCode": "AT", "latestTimestamp": "9999-12-31T23:59:59-23:59"}
        )
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["message"], "invalid timestamp")

    def test_garbage_timestamp_and_country(self):
        status, _, body = self.post_json("/data-freshness", {"countryCode": "AT", "latestTimestamp": "yesterday"})
        self.assertEqual((status, json.loads(body)["message"]), (400, "invalid timestamp"))
        status, _, body = self.post_json("/data-freshness", {"countryCode": "AT\n", "latestTimestamp": "2026-01-01"})
        self.assertEqual((status, json.loads(body)["message"]), (400, "invalid country code"))


class ErrorAfterHeadersTest(HttpServerTestCase):
    def test_no_second_response_after_headers_were_sent(self):
        def broken_get(handler):
            handler.send_response(200)
            handler.send_header("Content-Length", "100")
            handler.end_headers()
            handler.wfile.write(b"partial")
            raise RuntimeError("boom")

        with mock.patch.object(server.Handler, "do_GET", broken_get):
            with socket.create_connection(("127.0.0.1", self.port), timeout=5) as sock:
                sock.sendall(b"GET / HTTP/1.0\r\n\r\n")
                raw = b""
                while chunk := sock.recv(4096):
                    raw += chunk

        self.assertEqual(raw.count(b"HTTP/1.0 "), 1)
        self.assertNotIn(b"internal_error", raw)


class SlowClientTest(HttpServerTestCase):
    def test_trickled_headers_hit_the_read_deadline(self):
        with mock.patch.object(server.Handler, "read_deadline_seconds", 0.5), \
                mock.patch.object(server.Handler, "do_GET") as do_get:
            with socket.create_connection(("127.0.0.1", self.port), timeout=5) as sock:
                started = time.monotonic()
                sock.sendall(b"GET / HTTP/1.1\r\n")
                closed = False
                # Keep trickling well inside the per-read timeout.
                for _ in range(20):
                    try:
                        sock.sendall(b"X-A: b\r\n")
                        sock.settimeout(0.2)
                        if sock.recv(1) == b"":
                            closed = True
                            break
                    except socket.timeout:
                        continue
                    except OSError:
                        closed = True
                        break
            time.sleep(0.1)
        self.assertTrue(closed)
        self.assertLess(time.monotonic() - started, 3)
        # The cut-short header block must not be dispatched as a request.
        do_get.assert_not_called()


class ConnectionCapTest(HttpServerTestCase):
    connection_limit = 1
    loopback_reserve = 0

    def test_connections_over_the_cap_get_a_quick_503(self):
        idle = socket.create_connection(("127.0.0.1", self.port), timeout=5)
        self.addCleanup(idle.close)
        time.sleep(0.2)  # let the server accept it and take the only slot

        status, _, body = self.request("GET", "/health")
        self.assertEqual((status, body), (503, b"busy\n"))

        idle.close()
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            status, _, _ = self.request("GET", "/health")
            if status == 200:
                break
            time.sleep(0.05)
        self.assertEqual(status, 200)

    def test_loopback_has_reserved_slots(self):
        httpd = self.httpd
        httpd._loopback_slots = threading.BoundedSemaphore(1)
        self.assertIs(httpd._acquire_slot(("10.0.0.1", 1)), httpd._public_slots)
        self.assertIsNone(httpd._acquire_slot(("10.0.0.2", 1)))
        self.assertIs(httpd._acquire_slot(("127.0.0.1", 1)), httpd._loopback_slots)
        self.assertIsNone(httpd._acquire_slot(("127.0.0.1", 1)))


class SeedDataDirTest(unittest.TestCase):
    """A persistent volume starts from the image data and is never rolled back."""

    def setUp(self):
        logging.disable(logging.CRITICAL)
        self.addCleanup(logging.disable, logging.NOTSET)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        self.image_public = self.tmp / "image" / "public"
        self.image_metadata = self.tmp / "image" / "metadata"
        self.image_public.mkdir(parents=True)
        self.image_metadata.mkdir(parents=True)
        self.volume = self.tmp / "volume"
        self.volume.mkdir()
        self.write("image", "at_electricity_prices", b"image", "2026-06-03T21:00:00+00:00")
        (self.image_public / "favicon.bin").write_bytes(b"not an artifact")
        for patcher in (
            mock.patch.object(server, "IMAGE_ARTIFACT_DIR", self.image_public),
            mock.patch.object(server, "IMAGE_METADATA_DIR", self.image_metadata),
            mock.patch.dict(os.environ, {"DATA_DIR": str(self.volume)}),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def write(self, where, stem, body, last_timestamp):
        public = self.image_public if where == "image" else self.volume / "public"
        metadata = self.image_metadata if where == "image" else self.volume / "metadata"
        public.mkdir(parents=True, exist_ok=True)
        metadata.mkdir(parents=True, exist_ok=True)
        (public / f"{stem}.bin").write_bytes(body)
        (metadata / f"{stem}_metadata.json").write_text(json.dumps({
            "data_coverage": {"last_timestamp": last_timestamp},
            "file_info": {"file_size": len(body)},
        }))

    def volume_binary(self):
        return (self.volume / "public" / "at_electricity_prices.bin").read_bytes()

    def test_empty_volume_is_seeded(self):
        server.seed_data_dir()
        self.assertEqual(self.volume_binary(), b"image")
        self.assertEqual(
            server.metadata_last_timestamp(self.volume / "metadata" / "at_electricity_prices_metadata.json"),
            "2026-06-03T21:00:00+00:00",
        )
        self.assertFalse((self.volume / "public" / "favicon.bin").exists())

    def test_newer_volume_data_is_kept(self):
        self.write("volume", "at_electricity_prices", b"volume", "2026-06-10T21:00:00+00:00")
        server.seed_data_dir()
        self.assertEqual(self.volume_binary(), b"volume")

    def test_older_volume_data_is_replaced(self):
        self.write("volume", "at_electricity_prices", b"volume", "2026-06-01T21:00:00+00:00")
        server.seed_data_dir()
        self.assertEqual(self.volume_binary(), b"image")

    def test_damaged_newer_volume_binary_is_replaced(self):
        # A truncated binary (size differs from its metadata) is reseeded instead of served.
        self.write("volume", "at_electricity_prices", b"volume", "2026-06-10T21:00:00+00:00")
        (self.volume / "public" / "at_electricity_prices.bin").write_bytes(b"vol")
        server.seed_data_dir()
        self.assertEqual(self.volume_binary(), b"image")

    def test_unusable_volume_falls_back_to_the_image(self):
        blocker = self.tmp / "file-not-dir"
        blocker.write_text("x")
        with mock.patch.dict(os.environ, {"DATA_DIR": str(blocker)}):
            server.seed_data_dir()
            self.assertNotIn("DATA_DIR", os.environ)
            self.assertEqual(server.artifact_dir(), self.image_public)


class StartupRobustnessTest(unittest.TestCase):
    """Garbage left by an unclean shutdown must never keep the worker from starting."""

    def setUp(self):
        logging.disable(logging.CRITICAL)
        self.addCleanup(logging.disable, logging.NOTSET)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.state = Path(tmp.name) / "worker-state.json"
        patcher = mock.patch.object(server, "state_path", return_value=self.state)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_undecodable_or_invalid_state_is_ignored_and_moved_aside(self):
        for content in (b"\xff\xfe\x00garbage", b"\x00" * 64, b'{"last_update_status": "ru', b"null", b"[1, 2]"):
            with self.subTest(content=content):
                self.state.write_bytes(content)
                state = server.WorkerState()
                state.load()
                self.assertEqual(state.last_update_status, "idle")
                self.assertFalse(self.state.exists())
                self.assertTrue(self.state.with_name("worker-state.json.corrupt").exists())

    def test_state_round_trip(self):
        state = server.WorkerState()
        state.mark_started("test")
        state.mark_finished("ok", "done")
        reloaded = server.WorkerState()
        reloaded.load()
        self.assertEqual(reloaded.last_update_status, "ok")
        self.assertEqual(reloaded.last_update_message, "done")


class GracefulShutdownTest(unittest.TestCase):
    def test_restart_with_state_file_starts_and_sigterm_stops_promptly(self):
        import signal
        import subprocess

        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        # A valid state file from a previous run must not break startup (it crash-looped
        # the worker after the 2026-10-01 reboot: NameError at import time).
        data_dir = tempfile.TemporaryDirectory()
        self.addCleanup(data_dir.cleanup)
        (Path(data_dir.name) / "worker-state.json").write_text(json.dumps({
            "last_update_status": "running",
            "last_update_ok": True,
            "consecutive_update_failures": 2,
        }))
        env = {**os.environ, "PORT": str(port), "RUN_SCHEDULER": "false", "DATA_DIR": data_dir.name}
        process = subprocess.Popen(
            [sys.executable, str(Path(server.__file__))],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.addCleanup(lambda: process.poll() is None and process.kill())
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            try:
                socket.create_connection(("127.0.0.1", port), timeout=0.5).close()
                break
            except OSError:
                time.sleep(0.1)
        else:
            self.fail("worker did not start")

        started = time.monotonic()
        process.send_signal(signal.SIGTERM)
        self.assertEqual(process.wait(timeout=5), 0)
        self.assertLess(time.monotonic() - started, 3)


if __name__ == "__main__":
    unittest.main()
