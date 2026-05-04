#!/usr/bin/env python3
"""Small EEPA worker API and scheduler.

This process is intentionally boring: a tiny stdlib HTTP API plus a daily
background update loop. Coolify can run it as a separate service next to the
static frontend.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PORT = 49173
DEFAULT_UPDATE_HOUR_UTC = 3
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
        if self.path in {"/at_electricity_prices.bin", "/at_electricity_prices_backup.bin"}:
            self.send_file(ROOT / "public" / self.path.lstrip("/"), "application/octet-stream", head_only=True)
            return

        if self.path in {"/health", "/geoip", "/data-manifest"}:
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return

        self.send_response(HTTPStatus.NOT_FOUND)
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_json(
                {
                    "ok": True,
                    "service": "eepa-worker",
                    "time": now_iso(),
                    "state": STATE.snapshot(),
                }
            )
            return

        if self.path == "/geoip":
            self.send_json(resolve_geoip(self.headers))
            return

        if self.path == "/data-manifest":
            self.send_json(load_data_manifest())
            return

        if self.path in {"/at_electricity_prices.bin", "/at_electricity_prices_backup.bin"}:
            self.send_file(ROOT / "public" / self.path.lstrip("/"), "application/octet-stream")
            return

        self.send_json({"error": "not_found"}, status=HTTPStatus.NOT_FOUND)

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


def scheduler_loop() -> None:
    last_run_monotonic = 0.0

    while True:
        update_hour = int(os.getenv("UPDATE_HOUR_UTC", str(DEFAULT_UPDATE_HOUR_UTC)))
        now = datetime.now(timezone.utc)
        should_run = now.hour == update_hour and now.minute < 10
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
    yesterday = datetime.now(timezone.utc).date() - timedelta(days=1)

    try:
        for country in countries:
            command = [
                "python3",
                str(ROOT / "scripts" / "smart_batch_downloader.py"),
                country,
                yesterday.isoformat(),
                yesterday.isoformat(),
            ]
            logger.info("Running daily update for %s", country)
            subprocess.run(command, cwd=ROOT, check=True, timeout=60 * 30)
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
