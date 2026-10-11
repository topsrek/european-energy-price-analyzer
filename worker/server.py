#!/usr/bin/env python3
"""Small EEPA web server, API and scheduler.

This process is intentionally boring: a tiny stdlib HTTP server that serves the
built frontend (dist/), the price binaries and a small JSON API, plus a daily
background update loop.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import mimetypes
import os
import random
import re
import shutil
import signal
import socket
import subprocess
import sys
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
# Price artifacts and their metadata as shipped in the image (or the checkout).
IMAGE_ARTIFACT_DIR = ROOT / "public"
IMAGE_METADATA_DIR = ROOT / "scripts" / "data"
DEFAULT_PORT = 49173
DEFAULT_UPDATE_TIMEZONE = "Europe/Vienna"
DEFAULT_UPDATE_HOUR_LOCAL = 13
DEFAULT_UPDATE_MINUTE_LOCAL = 7
DEFAULT_COUNTRIES = "AT,DE-LU,FR"
UPDATE_OVERLAP_DAYS = 1
SCHEDULER_POLL_SECONDS = 5 * 60
DEFAULT_COMMAND_TIMEOUT_SECONDS = 25 * 60
DEFAULT_COMMAND_RETRIES = 1
COMMAND_RETRY_DELAYS_SECONDS = (60, 180)
PUBLIC_BINARY_PATH_RE = re.compile(r"^/[a-z0-9-]+_electricity_prices(?:_15min)?\.bin$")
COUNTRY_CODE_RE = re.compile(r"^[A-Z]{2}(?:-[A-Z]{2})?$")
REQUEST_TIMEOUT_SECONDS = 15
# Whole request line + headers + body must arrive within this, however slowly the
# client trickles bytes; the per-read timeout alone let a slowloris hold a thread forever.
REQUEST_READ_DEADLINE_SECONDS = 10
DEFAULT_MAX_CONNECTIONS = 64
# Extra slots for loopback clients, so the container health check still gets
# through while public connections are at the cap.
LOOPBACK_RESERVED_CONNECTIONS = 4
ARTIFACT_NAME_RE = re.compile(r"^([a-z0-9-]+)_electricity_prices(_15min)?\.bin$")
INLINE_SCRIPT_RE = re.compile(r"<script\b([^>]*)>(.*?)</script\s*>", re.IGNORECASE | re.DOTALL)
SCRIPT_TYPE_RE = re.compile(r"""\btype\s*=\s*["']?([^"'\s>]+)""", re.IGNORECASE)
SCRIPT_SRC_RE = re.compile(r"\bsrc\s*=", re.IGNORECASE)
DEFAULT_FRAME_ANCESTORS = (
    "'self' https://machine-literacy.com https://www.machine-literacy.com http://localhost:5173"
)

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("eepa-worker")


def data_dir() -> Path | None:
    """Writable data root (e.g. a persistent volume), or None to use the image paths."""
    value = os.getenv("DATA_DIR", "").strip()
    return Path(value) if value else None


def artifact_dir() -> Path:
    root = data_dir()
    return root / "public" if root else IMAGE_ARTIFACT_DIR


def metadata_dir() -> Path:
    root = data_dir()
    return root / "metadata" if root else IMAGE_METADATA_DIR


def state_path() -> Path:
    return (data_dir() or DATA_ROOT) / "worker-state.json"


def quarantine_file(path: Path) -> None:
    """Move an unreadable file aside (kept for inspection) so it is not read again."""
    try:
        path.replace(path.with_name(f"{path.name}.corrupt"))
    except OSError:
        pass


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
        # Not loaded here: STATE is created at import time, before helpers such as
        # as_optional_str exist, and a failing import crash-looped the container
        # (2026-10-01..11). main() calls load() once DATA_DIR is settled.

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

    def load(self) -> None:
        with self.lock:
            self._load()

    def _load(self) -> None:
        path = state_path()
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return
        except (OSError, ValueError) as exc:
            # ValueError covers JSONDecodeError and UnicodeDecodeError (e.g. garbage left by
            # an unclean shutdown). The state is only bookkeeping: never let it stop startup.
            logger.warning("Ignoring unreadable worker state file %s: %s", path, exc)
            quarantine_file(path)
            return
        if not isinstance(payload, dict):
            logger.warning("Ignoring invalid worker state file %s", path)
            quarantine_file(path)
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
        path = state_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_suffix(".tmp")
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
        with tmp_path.open("w", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, indent=2, sort_keys=True))
            handle.flush()
            os.fsync(handle.fileno())
        tmp_path.replace(path)


STATE = WorkerState()


class Handler(BaseHTTPRequestHandler):
    server_version = "EEPAWorker"
    sys_version = ""
    # Drop idle or slow clients instead of holding a thread open forever.
    timeout = REQUEST_TIMEOUT_SECONDS
    read_deadline_seconds = REQUEST_READ_DEADLINE_SECONDS

    def send_response(self, code: int, message: str | None = None) -> None:
        # The request has been read once we answer; from here on a slow client is
        # only bounded by the per-write timeout.
        self._stop_read_deadline()
        self._response_started = True
        super().send_response(code, message)

    def end_headers(self) -> None:
        for name, value in common_security_headers(getattr(self, "headers", None)):
            self.send_header(name, value)
        super().end_headers()

    def parse_request(self) -> bool:
        ok = super().parse_request()
        if self._read_aborted:
            # The shutdown made the header read end early; that is not a request.
            self.close_connection = True
            return False
        return ok

    def handle_one_request(self) -> None:
        self._response_started = False
        self._read_aborted = False
        self._deadline_lock = threading.Lock()
        self._deadline_timer: threading.Timer | None = threading.Timer(
            self.read_deadline_seconds, self._abort_slow_request
        )
        self._deadline_timer.daemon = True
        self._deadline_timer.start()
        try:
            super().handle_one_request()
        except (ConnectionError, TimeoutError):
            raise
        except Exception:
            logger.exception("Unhandled error while serving %s", getattr(self, "path", "?"))
            if self._response_started:
                # Status line and headers (maybe part of the body) are already out;
                # a second response would corrupt the stream, so just hang up.
                self.close_connection = True
                return
            try:
                self.send_json({"error": "internal_error"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            except OSError:
                self.close_connection = True
        finally:
            self._stop_read_deadline()

    def _stop_read_deadline(self) -> None:
        lock = getattr(self, "_deadline_lock", None)
        if lock is None:
            return
        with lock:
            if self._deadline_timer is not None:
                self._deadline_timer.cancel()
                self._deadline_timer = None

    def _abort_slow_request(self) -> None:
        with self._deadline_lock:
            if self._deadline_timer is None:
                return
            self._deadline_timer = None
            self._read_aborted = True
        logger.info("Dropping %s: request not received within %ss", self.address_string(), self.read_deadline_seconds)
        try:
            # Unblocks the pending read with EOF; the handler then closes normally.
            self.connection.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass

    def do_HEAD(self) -> None:
        path = self.normalized_path()
        public_binary = resolve_public_binary_path(path)
        if public_binary:
            self.send_file(public_binary, "application/octet-stream", head_only=True)
            return

        if path in {"/health", "/geoip", "/data-manifest"}:
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
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("invalid content length") from None
        if content_length <= 0:
            return {}
        if content_length > 4096:
            raise ValueError("request body too large")
        payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("request body must be a JSON object")
        return payload

    def handle_data_freshness(self) -> None:
        try:
            payload = self.read_json_body()
            country_code = str(payload.get("countryCode") or payload.get("country") or "AT").upper()
            if not COUNTRY_CODE_RE.fullmatch(country_code):
                raise ValueError("invalid country code")
            resolution = str(payload.get("resolution") or "hourly").lower()
            client_latest = first_nonempty(
                payload.get("latestTimestamp"),
                payload.get("latestDataPointDate"),
                payload.get("clientLatestTimestamp"),
            )

            if not client_latest:
                self.send_json({"error": "latest_timestamp_required"}, status=HTTPStatus.BAD_REQUEST)
                return
            try:
                parse_timestamp(client_latest)
            except (ValueError, OverflowError):
                # OverflowError: e.g. 9999-12-31T23:59:59-23:59 overflows on conversion to UTC.
                raise ValueError("invalid timestamp") from None

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
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_json({"error": "bad_request", "message": "invalid JSON body"}, status=HTTPStatus.BAD_REQUEST)
        except (ValueError, OverflowError) as exc:
            # Our own validation messages are safe to echo; parser internals are not.
            message = str(exc) if str(exc) in SAFE_ERROR_MESSAGES else "invalid request"
            self.send_json({"error": "bad_request", "message": message}, status=HTTPStatus.BAD_REQUEST)

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

        # Price data is only ever served from the live artifact directory. The build
        # copies public/*.bin into dist/, and those copies go stale after the first
        # refresh (reachable e.g. as /at_electricity_prices.bin/ with a trailing slash).
        if candidate.suffix == ".bin" or Path(request_path).suffix == ".bin":
            self.send_json({"error": "not_found"}, status=HTTPStatus.NOT_FOUND)
            return

        if not candidate.exists() or not candidate.is_file():
            # Only extension-less paths are client-side routes. Serving index.html for a
            # missing hashed asset (e.g. after a redeploy) would be cached as "JS" for a year.
            if request_path.startswith("/assets/") or Path(request_path).suffix:
                self.send_json({"error": "not_found"}, status=HTTPStatus.NOT_FOUND)
                return
            candidate = DIST_ROOT / "index.html"

        if not candidate.exists() or not candidate.is_file():
            self.send_json({"error": "not_found"}, status=HTTPStatus.NOT_FOUND)
            return

        body = candidate.read_bytes()
        content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        cache_control = "public, immutable, max-age=31536000" if request_path.startswith("/assets/") else "no-cache"

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        if candidate.suffix == ".html":
            self.send_header("Content-Security-Policy", content_security_policy())
        else:
            self.send_header("Content-Security-Policy", f"frame-ancestors {frame_ancestors()}")
        self.send_header("Cache-Control", cache_control)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head_only:
            self.wfile.write(body)


SAFE_ERROR_MESSAGES = {
    "invalid content length",
    "request body too large",
    "request body must be a JSON object",
    "invalid country code",
    "invalid timestamp",
}


def frame_ancestors() -> str:
    return os.getenv("FRAME_ANCESTORS", "").strip() or DEFAULT_FRAME_ANCESTORS


def common_security_headers(request_headers: Any) -> list[tuple[str, str]]:
    """Headers sent on every response (HTML, JSON, binaries and errors alike)."""
    headers = [
        ("X-Content-Type-Options", "nosniff"),
        ("Referrer-Policy", "strict-origin-when-cross-origin"),
        ("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()"),
    ]
    # No HSTS here: the TLS proxy sends a stronger one (includeSubDomains; preload), and
    # browsers honour only the first HSTS header, so a second one would weaken it.
    return headers


_script_hash_cache: dict[str, Any] = {"key": None, "hashes": []}
_script_hash_lock = threading.Lock()


def inline_script_hashes(html: str) -> list[str]:
    """CSP hash sources for the executable inline <script> blocks of a page.

    Data blocks (JSON-LD and other JSON types) are not executed, so CSP does not
    apply to them; scripts with src are covered by 'self'.
    """
    hashes = []
    for attributes, body in INLINE_SCRIPT_RE.findall(html):
        if SCRIPT_SRC_RE.search(attributes):
            continue
        type_match = SCRIPT_TYPE_RE.search(attributes)
        script_type = type_match.group(1).lower() if type_match else ""
        if script_type.endswith("json"):
            continue
        digest = hashlib.sha256(body.encode("utf-8")).digest()
        hashes.append(f"'sha256-{base64.b64encode(digest).decode('ascii')}'")
    return sorted(set(hashes))


def index_script_hashes() -> list[str]:
    """Hashes for dist/index.html, recomputed only when the file changes."""
    index_path = DIST_ROOT / "index.html"
    try:
        stat_result = index_path.stat()
        key = (stat_result.st_mtime_ns, stat_result.st_size)
    except OSError:
        return []
    with _script_hash_lock:
        if _script_hash_cache["key"] != key:
            try:
                html = index_path.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError) as exc:
                logger.warning("Cannot read %s for CSP script hashes: %s", index_path, exc)
                return []
            _script_hash_cache["key"] = key
            _script_hash_cache["hashes"] = inline_script_hashes(html)
        return list(_script_hash_cache["hashes"])


def content_security_policy() -> str:
    # Radix and recharts set inline style attributes, so styles need 'unsafe-inline'.
    # The contact links open mailto: via window.location, not a form submission.
    extra_connect = os.getenv("CSP_CONNECT_SRC", "").strip()
    directives = [
        "default-src 'self'",
        " ".join(["script-src 'self'", *index_script_hashes()]),
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        f"connect-src 'self'{' ' + extra_connect if extra_connect else ''}",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        f"frame-ancestors {frame_ancestors()}",
    ]
    return "; ".join(directives)


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

    country = valid_country_code(country)
    if country:
        return {"country_code": country, "source": "edge-header"}

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
            country = valid_country_code(country)
            if country:
                return {"country_code": country, "source": "provider"}
        except (OSError, urllib.error.URLError, json.JSONDecodeError, AttributeError) as exc:
            logger.warning("GeoIP provider failed: %s", exc)

    return {"country_code": None, "source": "unavailable"}


def valid_country_code(value: Any) -> str | None:
    """Upper-cased country code, or None for anything that is not one (e.g. "XX<script>")."""
    if not isinstance(value, str):
        return None
    candidate = value.strip().upper()
    return candidate if COUNTRY_CODE_RE.fullmatch(candidate) else None


def first_nonempty(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def resolve_public_binary_path(path: str) -> Path | None:
    if not PUBLIC_BINARY_PATH_RE.fullmatch(path):
        return None

    candidate = artifact_dir() / path.lstrip("/")
    if not candidate.exists() or not candidate.is_file():
        return None

    return candidate


def load_data_manifest() -> dict[str, Any]:
    manifest_path = ROOT / "data" / "manifest.json"
    if not manifest_path.exists():
        return {"countries": [], "updated_at": None}
    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        logger.warning("Failed to parse data manifest: %s", manifest_path)
        return {"countries": [], "updated_at": None}


def get_latest_data_timestamp(country_code: str, resolution: str) -> str | None:
    country = country_code.lower()
    if resolution in {"interval", "quarterhourly", "15min"}:
        suffixes = ["electricity_prices_15min_metadata.json"]
    else:
        suffixes = ["electricity_prices_metadata.json"]

    for suffix in suffixes:
        file_name = f"{country}_{suffix}"
        latest = metadata_last_timestamp(metadata_dir() / file_name)
        if latest:
            return latest

    return None


def artifact_matches_metadata(binary_path: Path, metadata_path: Path) -> bool:
    """True if the binary has the size its metadata records (catches truncated/damaged files)."""
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        expected = metadata.get("file_info", {}).get("file_size")
        actual = binary_path.stat().st_size
    except (OSError, ValueError, AttributeError):
        return False
    if not isinstance(expected, int) or expected != actual:
        logger.warning("%s is %s bytes but its metadata says %s; treating it as damaged", binary_path, actual, expected)
        return False
    return True


def metadata_last_timestamp(metadata_path: Path) -> str | None:
    """data_coverage.last_timestamp of a metadata file, or None if missing/unreadable."""
    if not metadata_path.exists():
        return None
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        latest = metadata.get("data_coverage", {}).get("last_timestamp")
    except (OSError, ValueError, AttributeError):
        logger.warning("Failed to parse metadata file: %s", metadata_path)
        return None
    return latest if isinstance(latest, str) and latest else None


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
    # Start from whichever dataset is further behind, otherwise a lagging 15-minute
    # file can fall outside the window and its merge refuses to write forever.
    latest_timestamps = [
        get_latest_data_timestamp(country_code, resolution) for resolution in ("hourly", "interval")
    ]
    if not all(latest_timestamps):
        return target_date, target_date
    latest_timestamp = min(latest_timestamps, key=parse_timestamp)

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
    try:
        return parse_timestamp(latest_timestamp).astimezone(tz).date()
    except ValueError:
        logger.warning("Invalid last_timestamp for %s %s: %r", country_code, resolution, latest_timestamp)
        return None


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
        try:
            now_local = datetime.now(update_timezone())
            stale_details = stale_country_details(now_local)

            if stale_details and next_retry_due(datetime.now(timezone.utc)) and not STATE.is_running():
                expected_date = expected_latest_date(now_local)
                reason = f"catch-up to {expected_date.isoformat()} for {', '.join(stale_details)}"
                run_update(reason=reason, expected_date=expected_date)
        except Exception:
            # Never let the scheduler thread die; updates would silently stop until restart.
            logger.exception("Scheduler iteration failed")
            if STATE.is_running():
                STATE.mark_finished("error", "scheduler error (see logs)")

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

    failed: list[str] = []
    for country in countries:
        try:
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
        except Exception:
            # Keep going so one failing country does not block the others.
            logger.exception("Daily update failed for %s", country)
            failed.append(country)
        time.sleep(30)

    if failed:
        # Details stay in the logs; /health is public and should not leak commands or paths.
        STATE.mark_finished("error", f"update failed for {','.join(failed)} (see logs)")
        return

    remaining_stale = stale_country_details(datetime.now(update_timezone()))
    if remaining_stale:
        message = f"waiting for upstream data: {', '.join(remaining_stale)}"
        logger.info("Update completed but data is still behind %s: %s", expected_date, remaining_stale)
        STATE.mark_finished("pending", message)
        return

    STATE.mark_finished("ok", f"updated {','.join(countries)}")


def copy_file_atomic(source: Path, target: Path) -> None:
    tmp_path = target.with_name(f".{target.name}.seed.tmp")
    shutil.copyfile(source, tmp_path)
    tmp_path.replace(target)


def seed_data_dir() -> None:
    """Fill DATA_DIR (a persistent volume) from the artifacts baked into the image.

    An artifact is copied when the volume lacks it or holds older data than the
    image (by metadata last_timestamp), so a fresh volume starts from the committed
    data and a volume that has been refreshed since is never rolled back by a
    redeploy. If the directory is unusable the worker falls back to the image
    copies, which is exactly how it behaves without a volume.
    """
    root = data_dir()
    if root is None:
        return

    try:
        target_artifacts = artifact_dir()
        target_metadata = metadata_dir()
        target_artifacts.mkdir(parents=True, exist_ok=True)
        target_metadata.mkdir(parents=True, exist_ok=True)

        for image_binary in sorted(IMAGE_ARTIFACT_DIR.glob("*.bin")):
            if not ARTIFACT_NAME_RE.fullmatch(image_binary.name):
                continue
            metadata_name = f"{image_binary.stem}_metadata.json"
            image_metadata = IMAGE_METADATA_DIR / metadata_name
            target_binary = target_artifacts / image_binary.name
            target_metadata_path = target_metadata / metadata_name

            image_latest = metadata_last_timestamp(image_metadata)
            target_latest = (
                metadata_last_timestamp(target_metadata_path)
                if target_binary.exists() and artifact_matches_metadata(target_binary, target_metadata_path)
                else None
            )
            if target_latest and (not image_latest or parse_timestamp(target_latest) >= parse_timestamp(image_latest)):
                logger.info("Keeping %s from %s (through %s)", image_binary.name, root, target_latest)
                continue

            # Binary first, then metadata, as in the pipeline.
            copy_file_atomic(image_binary, target_binary)
            if image_metadata.exists():
                copy_file_atomic(image_metadata, target_metadata_path)
            logger.info(
                "Seeded %s into %s from the image (image through %s, volume had %s)",
                image_binary.name,
                root,
                image_latest,
                target_latest or "nothing",
            )
    except (OSError, ValueError, OverflowError) as exc:
        logger.error("DATA_DIR=%s is not usable (%s); serving the image copies without persistence", root, exc)
        # Subprocesses inherit the environment, so this also points the refresh
        # scripts back at the image paths.
        os.environ.pop("DATA_DIR", None)


def max_connections() -> int:
    try:
        return max(1, int(os.getenv("MAX_CONNECTIONS", str(DEFAULT_MAX_CONNECTIONS))))
    except ValueError:
        return DEFAULT_MAX_CONNECTIONS


class BoundedThreadingHTTPServer(ThreadingHTTPServer):
    """ThreadingHTTPServer with a cap on concurrently handled connections.

    The stock server starts a thread per connection without limit. Over the cap a
    connection gets an immediate 503 and is closed. Loopback clients (the
    container health check) get a few reserved slots of their own.
    """

    daemon_threads = True
    BUSY_RESPONSE = (
        b"HTTP/1.0 503 Service Unavailable\r\n"
        b"Content-Type: text/plain\r\n"
        b"Content-Length: 5\r\n"
        b"Retry-After: 5\r\n"
        b"Connection: close\r\n\r\n"
        b"busy\n"
    )

    def __init__(self, server_address: Any, handler_class: Any, connection_limit: int | None = None) -> None:
        self.connection_limit = connection_limit or max_connections()
        self._public_slots = threading.BoundedSemaphore(self.connection_limit)
        self._loopback_slots = threading.BoundedSemaphore(LOOPBACK_RESERVED_CONNECTIONS)
        super().__init__(server_address, handler_class)

    def _acquire_slot(self, client_address: Any) -> threading.BoundedSemaphore | None:
        if self._public_slots.acquire(blocking=False):
            return self._public_slots
        host = client_address[0] if isinstance(client_address, tuple) and client_address else ""
        if host in {"127.0.0.1", "::1", "::ffff:127.0.0.1"} and self._loopback_slots.acquire(blocking=False):
            return self._loopback_slots
        return None

    def process_request(self, request: Any, client_address: Any) -> None:
        slot = self._acquire_slot(client_address)
        if slot is None:
            logger.warning("Connection limit (%s) reached; rejecting %s", self.connection_limit, client_address)
            try:
                # Never block the accept loop on a client that is not reading.
                request.setblocking(False)
                request.send(self.BUSY_RESPONSE)
            except OSError:
                pass
            self.shutdown_request(request)
            return

        thread = threading.Thread(
            target=self._handle_with_slot,
            args=(request, client_address, slot),
            daemon=self.daemon_threads,
        )
        try:
            thread.start()
        except RuntimeError:
            # Could not start a thread (resource exhaustion): drop this connection
            # rather than taking the whole accept loop down.
            slot.release()
            logger.exception("Could not start a handler thread for %s", client_address)
            self.shutdown_request(request)

    def handle_error(self, request: Any, client_address: Any) -> None:
        # Clients hanging up mid-response are routine; don't dump a traceback for them.
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionError, TimeoutError)):
            logger.debug("Connection from %s ended early: %s", client_address, exc)
            return
        logger.exception("Error while handling a request from %s", client_address)

    def _handle_with_slot(self, request: Any, client_address: Any, slot: threading.BoundedSemaphore) -> None:
        try:
            self.process_request_thread(request, client_address)
        finally:
            slot.release()


def install_shutdown_handler(server: ThreadingHTTPServer) -> None:
    """Stop cleanly on SIGTERM/SIGINT.

    As PID 1 in the container Python ignores SIGTERM unless a handler is installed, so
    `docker stop` (deploys, host reboots) used to end in SIGKILL after 10s, possibly in
    the middle of a data or state write. shutdown() must run outside the thread that is
    blocked in serve_forever().
    """

    def handle(signum: int, _frame: Any) -> None:
        logger.info("Received %s, shutting down", signal.Signals(signum).name)
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, handle)
    signal.signal(signal.SIGINT, handle)


def main() -> None:
    port = int(os.getenv("PORT", str(DEFAULT_PORT)))
    # A damaged data volume or state file must never keep the server from starting: after
    # the unclean reboot on 2026-10-01 the worker exited with code 1 on every start for 10 days.
    try:
        seed_data_dir()
    except Exception:
        logger.exception("Seeding DATA_DIR failed; serving the image copies")
        os.environ.pop("DATA_DIR", None)
    try:
        # DATA_DIR may have changed (seeded or dropped), so read the state from where it now lives.
        STATE.load()
    except Exception:
        logger.exception("Loading the worker state failed; starting with a fresh state")
    logger.info("Serving price data from %s (metadata in %s)", artifact_dir(), metadata_dir())

    server = BoundedThreadingHTTPServer(("0.0.0.0", port), Handler)
    install_shutdown_handler(server)
    if os.getenv("RUN_SCHEDULER", "true").lower() == "true":
        threading.Thread(target=scheduler_loop, daemon=True).start()

    logger.info("EEPA worker listening on port %s (max %s connections)", port, server.connection_limit)
    server.serve_forever()
    server.server_close()
    logger.info("EEPA worker stopped")


if __name__ == "__main__":
    main()
