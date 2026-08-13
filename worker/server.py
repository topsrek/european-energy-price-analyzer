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
import random
import re
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
DATA_ROOT = ROOT / "data"
STATE_PATH = DATA_ROOT / "worker-state.json"
DEFAULT_PORT = 49173
DEFAULT_UPDATE_TIMEZONE = "Europe/Vienna"
DEFAULT_UPDATE_HOUR_LOCAL = 13
DEFAULT_UPDATE_MINUTE_LOCAL = 7
DEFAULT_COUNTRIES = "AT"
UPDATE_OVERLAP_DAYS = 1
SCHEDULER_POLL_SECONDS = 5 * 60
DEFAULT_COMMAND_TIMEOUT_SECONDS = 25 * 60
DEFAULT_COMMAND_RETRIES = 1
COMMAND_RETRY_DELAYS_SECONDS = (60, 180)
PUBLIC_BINARY_PATH_RE = re.compile(r"^/[a-z0-9-]+_electricity_prices(?:_backup|_15min)?\.bin$")

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
        self.last_update_status: str = "idle"
        self.last_update_reason: str | None = None
        self.last_successful_update_finished_at: str | None = None
        self.consecutive_update_failures = 0
        self.next_retry_not_before: str | None = None
        self._load()

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            return {
                "last_update_started_at": self.last_update_started_at,
                "last_update_finished_at": self.last_update_finished_at,
                "last_update_ok": self.last_update_ok,
                "last_update_message": self.last_update_message,
                "last_update_status": self.last_update_status,
                "last_update_reason": self.last_update_reason,
                "last_successful_update_finished_at": self.last_successful_update_finished_at,
                "consecutive_update_failures": self.consecutive_update_failures,
                "next_retry_not_before": self.next_retry_not_before,
            }

    def mark_started(self, reason: str) -> None:
        with self.lock:
            self.last_update_started_at = now_iso()
            self.last_update_ok = None
            self.last_update_message = "running"
            self.last_update_status = "running"
            self.last_update_reason = reason
            self.next_retry_not_before = None
            self._persist_locked()

    def mark_finished(self, status: str, message: str, retry_after_seconds: int | None = None) -> None:
        with self.lock:
            finished_at = now_iso()
            self.last_update_finished_at = finished_at
            self.last_update_status = status
            self.last_update_ok = status == "ok"
            self.last_update_message = message
            if status == "ok":
                self.last_successful_update_finished_at = finished_at
                self.consecutive_update_failures = 0
                self.next_retry_not_before = None
            else:
                self.consecutive_update_failures += 1
                retry_delay = retry_after_seconds or retry_delay_seconds()
                self.next_retry_not_before = iso_after_seconds(retry_delay)
            self._persist_locked()

    def is_running(self) -> bool:
        with self.lock:
            return self.last_update_status == "running"

    def _load(self) -> None:
        try:
            payload = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return
        except json.JSONDecodeError as exc:
            logger.warning("Ignoring invalid worker state file %s: %s", STATE_PATH, exc)
            return

        self.last_update_started_at = as_optional_str(payload.get("last_update_started_at"))
        self.last_update_finished_at = as_optional_str(payload.get("last_update_finished_at"))
        self.last_update_ok = payload.get("last_update_ok") if isinstance(payload.get("last_update_ok"), bool) else None
        self.last_update_message = as_optional_str(payload.get("last_update_message"))
        self.last_update_status = as_optional_str(payload.get("last_update_status")) or "idle"
        self.last_update_reason = as_optional_str(payload.get("last_update_reason"))
        self.last_successful_update_finished_at = as_optional_str(payload.get("last_successful_update_finished_at"))
        consecutive_failures = payload.get("consecutive_update_failures")
        if isinstance(consecutive_failures, int) and consecutive_failures >= 0:
            self.consecutive_update_failures = consecutive_failures
        self.next_retry_not_before = as_optional_str(payload.get("next_retry_not_before"))
        if self.last_update_status == "running":
            self.last_update_status = "error"
            self.last_update_ok = False
            self.last_update_message = "interrupted by restart"

    def _persist_locked(self) -> None:
        DATA_ROOT.mkdir(parents=True, exist_ok=True)
        tmp_path = STATE_PATH.with_suffix(".tmp")
        payload = {
            "last_update_started_at": self.last_update_started_at,
            "last_update_finished_at": self.last_update_finished_at,
            "last_update_ok": self.last_update_ok,
            "last_update_message": self.last_update_message,
            "last_update_status": self.last_update_status,
            "last_update_reason": self.last_update_reason,
            "last_successful_update_finished_at": self.last_successful_update_finished_at,
            "consecutive_update_failures": self.consecutive_update_failures,
            "next_retry_not_before": self.next_retry_not_before,
        }
        tmp_path.write_text(
            json.dumps(payload, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        tmp_path.replace(STATE_PATH)


STATE = WorkerState()


class Handler(BaseHTTPRequestHandler):
    server_version = "EEPAWorker/0.1"

    def do_HEAD(self) -> None:
        path = self.normalized_path()
        public_binary = resolve_public_binary_path(path)
        if public_binary:
            self.send_file(public_binary, "application/octet-stream", head_only=True)
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
            # Deliberately still HTTP 200 when data is stale: the process is serving
            # fine, and a non-200 would make the orchestrator restart-loop the
            # container over a data problem it cannot fix by restarting. Monitoring
            # should alert on "ok": false / "stale_countries" instead.
            stale = stale_country_details(datetime.now(update_timezone()))
            self.send_json(
                {
                    "ok": not stale,
                    "service": "eepa-worker",
                    "time": now_iso(),
                    "stale_countries": stale,
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

        public_binary = resolve_public_binary_path(path)
        if public_binary:
            self.send_file(public_binary, "application/octet-stream")
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

            fresh = is_client_data_fresh(client_latest, server_latest)
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


def iso_after_seconds(seconds: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).replace(microsecond=0).isoformat()


def as_optional_str(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


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


def resolve_public_binary_path(path: str) -> Path | None:
    if not PUBLIC_BINARY_PATH_RE.match(path):
        return None

    candidate = ROOT / "public" / path.lstrip("/")
    if not candidate.exists() or not candidate.is_file():
        return None

    return candidate


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


def is_client_data_fresh(client_latest: str, server_latest: str) -> bool:
    return parse_timestamp(server_latest) <= parse_timestamp(client_latest)


def retry_delay_window(now: datetime) -> tuple[int, int]:
    update_hour = int(os.getenv("UPDATE_HOUR_LOCAL", str(DEFAULT_UPDATE_HOUR_LOCAL)))
    update_minute = int(os.getenv("UPDATE_MINUTE_LOCAL", str(DEFAULT_UPDATE_MINUTE_LOCAL)))
    scheduled_time = now.replace(hour=update_hour, minute=update_minute, second=0, microsecond=0)
    if now < scheduled_time:
        scheduled_time -= timedelta(days=1)
    elapsed = now - scheduled_time

    if elapsed < timedelta(minutes=23):
        return 12 * 60, 3 * 60
    if elapsed < timedelta(hours=5):
        return 30 * 60, 10 * 60
    return 2 * 60 * 60, 30 * 60


def retry_delay_seconds() -> int:
    base, jitter = retry_delay_window(datetime.now(update_timezone()))
    return base + random.randint(0, jitter)


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

    # Re-fetch the last stored day (plus a day of slack) instead of resuming after
    # it. The final stored day is usually partial, because the update runs before
    # upstream has published every interval of it. Resuming at latest_date + 1 left
    # that day permanently short, and the binary format encodes records positionally,
    # so a hole silently shifts every later timestamp earlier.
    latest_date = parse_timestamp(latest_timestamp).astimezone(tz).date()
    start_date = latest_date - timedelta(days=UPDATE_OVERLAP_DAYS)
    if start_date > target_date:
        start_date = target_date

    return start_date, target_date


def countries_to_update() -> list[str]:
    return [
        country.strip().upper()
        for country in os.getenv("COUNTRIES", DEFAULT_COUNTRIES).split(",")
        if country.strip()
    ]


def expected_latest_date(now: datetime) -> date:
    update_hour = int(os.getenv("UPDATE_HOUR_LOCAL", str(DEFAULT_UPDATE_HOUR_LOCAL)))
    update_minute = int(os.getenv("UPDATE_MINUTE_LOCAL", str(DEFAULT_UPDATE_MINUTE_LOCAL)))
    scheduled_time = now.replace(hour=update_hour, minute=update_minute, second=0, microsecond=0)
    if now >= scheduled_time:
        return now.date() + timedelta(days=1)
    return now.date()


def latest_data_date(country_code: str, resolution: str, tz: ZoneInfo) -> date | None:
    latest_timestamp = get_latest_data_timestamp(country_code, resolution)
    if not latest_timestamp:
        return None
    return parse_timestamp(latest_timestamp).astimezone(tz).date()


def stale_country_details(now: datetime) -> list[str]:
    tz = update_timezone()
    expected_date = expected_latest_date(now)
    details: list[str] = []

    for country in countries_to_update():
        hourly_date = latest_data_date(country, "hourly", tz)
        interval_date = latest_data_date(country, "interval", tz)
        if hourly_date is None or hourly_date < expected_date or interval_date is None or interval_date < expected_date:
            details.append(
                f"{country}(hourly={hourly_date or 'none'},interval={interval_date or 'none'},expected={expected_date})"
            )

    return details


def next_retry_due(now_utc: datetime) -> bool:
    snapshot = STATE.snapshot()
    next_retry = as_optional_str(snapshot.get("next_retry_not_before"))
    if not next_retry:
        return True
    return now_utc >= parse_timestamp(next_retry)


def scheduler_loop() -> None:
    while True:
        now_local = datetime.now(update_timezone())
        stale_details = stale_country_details(now_local)

        if stale_details and next_retry_due(datetime.now(timezone.utc)) and not STATE.is_running():
            expected_date = expected_latest_date(now_local)
            reason = f"catch-up to {expected_date.isoformat()} for {', '.join(stale_details)}"
            run_update(reason=reason, expected_date=expected_date)

        time.sleep(SCHEDULER_POLL_SECONDS)


def run_command(command: list[str], label: str) -> None:
    timeout_seconds = int(os.getenv("UPDATE_COMMAND_TIMEOUT_SECONDS", str(DEFAULT_COMMAND_TIMEOUT_SECONDS)))
    max_attempts = max(1, int(os.getenv("UPDATE_COMMAND_RETRIES", str(DEFAULT_COMMAND_RETRIES))))

    for attempt in range(1, max_attempts + 1):
        try:
            logger.info("Running %s (attempt %s/%s): %s", label, attempt, max_attempts, " ".join(command))
            subprocess.run(command, cwd=ROOT, check=True, timeout=timeout_seconds)
            return
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            if attempt >= max_attempts:
                raise

            retry_delay = COMMAND_RETRY_DELAYS_SECONDS[min(attempt - 1, len(COMMAND_RETRY_DELAYS_SECONDS) - 1)]
            logger.warning("%s failed on attempt %s/%s: %s. Retrying in %ss.", label, attempt, max_attempts, exc, retry_delay)
            time.sleep(retry_delay)


def run_update(*, reason: str, expected_date: date) -> None:
    STATE.mark_started(reason)
    countries = countries_to_update()

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
            run_command(hourly_command, f"{country} hourly refresh")
            run_command(interval_command, f"{country} interval refresh")
            time.sleep(30)

        remaining_stale = stale_country_details(datetime.now(update_timezone()))
        if remaining_stale:
            message = f"waiting for upstream data: {', '.join(remaining_stale)}"
            logger.info("Update completed but data is still behind %s: %s", expected_date, remaining_stale)
            STATE.mark_finished("pending", message)
            return

        STATE.mark_finished("ok", f"updated {','.join(countries)}")
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        logger.exception("Daily update failed")
        STATE.mark_finished("error", str(exc))


def main() -> None:
    port = int(os.getenv("PORT", str(DEFAULT_PORT)))
    if os.getenv("RUN_SCHEDULER", "true").lower() == "true":
        threading.Thread(target=scheduler_loop, daemon=True).start()

    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    logger.info("EEPA worker listening on port %s", port)
    server.serve_forever()


if __name__ == "__main__":
    main()
