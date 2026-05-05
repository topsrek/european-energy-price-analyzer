#!/usr/bin/env python3
"""Small EEPA worker API and scheduler.

This process is intentionally boring: a tiny stdlib HTTP API plus a daily
background update loop. Coolify can run it as a separate service next to the
static frontend.
"""

from __future__ import annotations

import json
import logging
import mimetypes
import os
import subprocess
import threading
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

ROOT = Path(__file__).resolve().parents[1]
DIST_ROOT = ROOT / "dist"
DEFAULT_PORT = 49173
DEFAULT_UPDATE_TIMEZONE = "Europe/Vienna"
DEFAULT_UPDATE_HOUR_LOCAL = 13
DEFAULT_UPDATE_MINUTE_LOCAL = 7
DEFAULT_COUNTRIES = "AT"
MIN_UPDATE_INTERVAL_SECONDS = 6 * 60 * 60

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("eepa-worker")


class WorkerState:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.last_update_started_at: str | None = None
        self.last_update_finished_at: str | None = None
        self.last_update_ok: bool | None = None
        self.last_update_message: str | None = None

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            return {
                "last_update_started_at": self.last_update_started_at,
                "last_update_finished_at": self.last_update_finished_at,
                "last_update_ok": self.last_update_ok,
                "last_update_message": self.last_update_message,
            }

    def mark_started(self) -> None:
        with self.lock:
            self.last_update_started_at = now_iso()
            self.last_update_ok = None
            self.last_update_message = "running"

    def mark_finished(self, ok: bool, message: str) -> None:
        with self.lock:
            self.last_update_finished_at = now_iso()
            self.last_update_ok = ok
            self.last_update_message = message


STATE = WorkerState()


class Handler(BaseHTTPRequestHandler):
    server_version = "EEPAWorker/0.1"

    def do_HEAD(self) -> None:
        path = self.normalized_path()
        if path in {
            "/at_electricity_prices.bin",
            "/at_electricity_prices_backup.bin",
            "/at_electricity_prices_15min.bin",
        }:
            self.send_file(ROOT / "public" / path.lstrip("/"), "application/octet-stream", head_only=True)
            return

        if path in {"/health", "/geoip", "/data-manifest", "/data-freshness"}:
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return

        self.send_static(head_only=True)

    def do_GET(self) -> None:
        path = self.normalized_path()
        if path == "/health":
            self.send_json(
                {
                    "ok": True,
                    "service": "eepa-worker",
                    "time": now_iso(),
                    "state": STATE.snapshot(),
                }
            )
            return

        if path == "/geoip":
            self.send_json(resolve_geoip(self.headers))
            return

        if path == "/data-manifest":
            self.send_json(load_data_manifest())
            return

        if path in {
            "/at_electricity_prices.bin",
            "/at_electricity_prices_backup.bin",
            "/at_electricity_prices_15min.bin",
        }:
            self.send_file(ROOT / "public" / path.lstrip("/"), "application/octet-stream")
            return

        self.send_static()

    def do_POST(self) -> None:
        path = self.normalized_path()
        if path == "/data-freshness":
            self.handle_data_freshness()
            return

        self.send_json({"error": "not_found"}, status=HTTPStatus.NOT_FOUND)

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", os.getenv("CORS_ORIGIN", "*"))
        self.send_header("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def normalized_path(self) -> str:
        path = self.path.split("?", 1)[0]
        if path.startswith("/api/"):
            return path[4:]
        return path

    def log_message(self, fmt: str, *args: Any) -> None:
        logger.info("%s - %s", self.address_string(), fmt % args)

    def send_json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", os.getenv("CORS_ORIGIN", "*"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self) -> dict[str, Any]:
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            return {}
        if content_length > 4096:
            raise ValueError("request body too large")
        return json.loads(self.rfile.read(content_length).decode("utf-8"))

    def handle_data_freshness(self) -> None:
        try:
            payload = self.read_json_body()
            country_code = str(payload.get("countryCode") or payload.get("country") or "AT").upper()
            resolution = str(payload.get("resolution") or "hourly").lower()
            client_latest = first_nonempty(
                payload.get("latestTimestamp"),
                payload.get("latestDataPointDate"),
                payload.get("clientLatestTimestamp"),
            )

            if not client_latest:
                self.send_json({"error": "latest_timestamp_required"}, status=HTTPStatus.BAD_REQUEST)
                return

            server_latest = get_latest_data_timestamp(country_code, resolution)
            if not server_latest:
                self.send_json(
                    {
                        "fresh": False,
                        "countryCode": country_code,
                        "resolution": resolution,
                        "serverLatestTimestamp": None,
                        "clientLatestTimestamp": client_latest,
                    }
                )
                return

            fresh = parse_timestamp(client_latest) >= parse_timestamp(server_latest)
            self.send_json(
                {
                    "fresh": fresh,
                    "countryCode": country_code,
                    "resolution": resolution,
                    "serverLatestTimestamp": server_latest,
                    "clientLatestTimestamp": client_latest,
                }
            )
        except (json.JSONDecodeError, ValueError) as exc:
            self.send_json({"error": "bad_request", "message": str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def send_file(self, path: Path, content_type: str, head_only: bool = False) -> None:
        if not path.exists() or not path.is_file():
            self.send_json({"error": "not_found"}, status=HTTPStatus.NOT_FOUND)
            return

        body = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "public, max-age=300")
        self.send_header("Access-Control-Allow-Origin", os.getenv("CORS_ORIGIN", "*"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def send_static(self, head_only: bool = False) -> None:
        request_path = self.path.split("?", 1)[0]
        relative_path = request_path.lstrip("/") or "index.html"
        candidate = (DIST_ROOT / relative_path).resolve()

        try:
            candidate.relative_to(DIST_ROOT.resolve())
        except ValueError:
            self.send_json({"error": "not_found"}, status=HTTPStatus.NOT_FOUND)
            return

        if not candidate.exists() or not candidate.is_file():
            candidate = DIST_ROOT / "index.html"

        if not candidate.exists() or not candidate.is_file():
            self.send_json({"error": "not_found"}, status=HTTPStatus.NOT_FOUND)
            return

        body = candidate.read_bytes()
        content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        cache_control = "public, immutable, max-age=31536000" if "/assets/" in request_path else "no-cache"

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", cache_control)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head_only:
            self.wfile.write(body)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def resolve_geoip(headers: Any) -> dict[str, Any]:
    country = first_nonempty(
        headers.get("CF-IPCountry"),
        headers.get("X-Vercel-IP-Country"),
        headers.get("X-Country-Code"),
    )

    if country:
        return {"country_code": country.upper(), "source": "edge-header"}

    provider_url = os.getenv("GEOIP_PROVIDER_URL", "").strip()
    if provider_url:
        try:
            request = urllib.request.Request(
                provider_url,
                headers={"User-Agent": "European-Energy-Price-Analyzer/0.1"},
            )
            with urllib.request.urlopen(request, timeout=3) as response:
                payload = json.loads(response.read().decode("utf-8"))
            country = first_nonempty(
                payload.get("country_code"),
                payload.get("countryCode"),
                payload.get("country"),
            )
            if country:
                return {"country_code": str(country).upper(), "source": "provider"}
        except (OSError, urllib.error.URLError, json.JSONDecodeError) as exc:
            logger.warning("GeoIP provider failed: %s", exc)

    return {"country_code": None, "source": "unavailable"}


def first_nonempty(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def load_data_manifest() -> dict[str, Any]:
    manifest_path = ROOT / "data" / "manifest.json"
    if not manifest_path.exists():
        return {"countries": [], "updated_at": None}
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def get_latest_data_timestamp(country_code: str, resolution: str) -> str | None:
    country = country_code.lower()
    if resolution in {"interval", "quarterhourly", "15min"}:
        suffixes = ["electricity_prices_15min_metadata.json"]
    else:
        suffixes = ["electricity_prices_metadata.json"]

    for suffix in suffixes:
        file_name = f"{country}_{suffix}"
        for metadata_dir in (ROOT / "scripts" / "data", ROOT / "scripts" / "metadata", ROOT / "public"):
            metadata_path = metadata_dir / file_name
            if not metadata_path.exists():
                continue

            try:
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                logger.warning("Failed to parse metadata file: %s", metadata_path)
                continue

            latest = metadata.get("data_coverage", {}).get("last_timestamp")
            if isinstance(latest, str) and latest:
                return latest

    return None


def parse_timestamp(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def update_timezone() -> ZoneInfo:
    timezone_name = os.getenv("UPDATE_TIMEZONE", DEFAULT_UPDATE_TIMEZONE)
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        logger.warning("Unknown UPDATE_TIMEZONE=%s, falling back to UTC", timezone_name)
        return ZoneInfo("UTC")


def update_window(country_code: str) -> tuple[date, date]:
    tz = update_timezone()
    target_date = datetime.now(tz).date() + timedelta(days=1)
    latest_timestamp = get_latest_data_timestamp(country_code, "hourly")

    if not latest_timestamp:
        return target_date, target_date

    latest_date = parse_timestamp(latest_timestamp).astimezone(tz).date()
    start_date = latest_date + timedelta(days=1)
    if start_date > target_date:
        start_date = target_date

    return start_date, target_date


def scheduler_loop() -> None:
    last_run_monotonic = 0.0

    while True:
        update_hour = int(os.getenv("UPDATE_HOUR_LOCAL", str(DEFAULT_UPDATE_HOUR_LOCAL)))
        update_minute = int(os.getenv("UPDATE_MINUTE_LOCAL", str(DEFAULT_UPDATE_MINUTE_LOCAL)))
        now = datetime.now(update_timezone())
        should_run = (
            now.hour == update_hour
            and update_minute <= now.minute < update_minute + 10
        )
        enough_time_elapsed = time.monotonic() - last_run_monotonic > MIN_UPDATE_INTERVAL_SECONDS

        if should_run and enough_time_elapsed:
            last_run_monotonic = time.monotonic()
            run_update()

        time.sleep(300)


def run_update() -> None:
    STATE.mark_started()
    countries = [
        country.strip().upper()
        for country in os.getenv("COUNTRIES", DEFAULT_COUNTRIES).split(",")
        if country.strip()
    ]

    try:
        for country in countries:
            start_date, end_date = update_window(country)
            hourly_command = [
                "python3",
                str(ROOT / "scripts" / "smart_batch_downloader.py"),
                country,
                start_date.isoformat(),
                end_date.isoformat(),
            ]
            interval_command = [
                "python3",
                str(ROOT / "scripts" / "build_interval_dataset.py"),
                country,
                start_date.isoformat(),
                end_date.isoformat(),
            ]
            logger.info("Running daily update for %s from %s to %s", country, start_date, end_date)
            subprocess.run(hourly_command, cwd=ROOT, check=True, timeout=60 * 30)
            subprocess.run(interval_command, cwd=ROOT, check=True, timeout=60 * 30)
            time.sleep(30)

        STATE.mark_finished(True, f"updated {','.join(countries)}")
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        logger.exception("Daily update failed")
        STATE.mark_finished(False, str(exc))


def main() -> None:
    port = int(os.getenv("PORT", str(DEFAULT_PORT)))
    if os.getenv("RUN_SCHEDULER", "true").lower() == "true":
        threading.Thread(target=scheduler_loop, daemon=True).start()

    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    logger.info("EEPA worker listening on port %s", port)
    server.serve_forever()


if __name__ == "__main__":
    main()
