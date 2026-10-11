#!/usr/bin/env python3
"""
Metadata Manager for Energy Price Database

Manages metadata files that track what data is included in each country's
binary database file. This allows us to efficiently manage multiple countries
and track data coverage.
"""

import contextlib
import json
import logging
import os
import stat
import tempfile
from datetime import datetime, date, timezone
from pathlib import Path
from typing import List, Optional, Union

logger = logging.getLogger(__name__)

# Mode for newly created artifacts. mkstemp creates 0600 files, which the web
# server could not read if it runs as a different user than the refresh job.
DEFAULT_FILE_MODE = 0o644

REPO_ROOT = Path(__file__).resolve().parents[1]


def artifact_dir() -> Path:
    """Where the price artifacts live: $DATA_DIR/public if set, else public/.

    DATA_DIR points at a persistent volume in production (see worker/server.py,
    which seeds it from the image copies on startup).
    """
    data_dir = os.getenv("DATA_DIR", "").strip()
    return Path(data_dir) / "public" if data_dir else REPO_ROOT / "public"


def metadata_dir() -> Path:
    """Where the backend metadata lives: $DATA_DIR/metadata if set, else scripts/data/."""
    data_dir = os.getenv("DATA_DIR", "").strip()
    return Path(data_dir) / "metadata" if data_dir else REPO_ROOT / "scripts" / "data"


def _fsync_directory(directory: Path) -> None:
    """Persist the rename itself. Not supported everywhere (e.g. Windows)."""
    try:
        fd = os.open(directory, os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(fd)
    except OSError:
        pass
    finally:
        os.close(fd)


def atomic_write_bytes(path: Union[str, Path], data: bytes) -> None:
    """Replace path with data so readers see either the old or the new file.

    Writing in place meant a crash or a full disk mid-write left a truncated
    artifact, which the next run then read as "no history" and overwrote. The
    temp file lives in the same directory so os.replace is an atomic rename.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    try:
        mode = stat.S_IMODE(path.stat().st_mode)
    except FileNotFoundError:
        mode = DEFAULT_FILE_MODE

    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(tmp_name, mode)
        os.replace(tmp_name, path)
    except BaseException:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(tmp_name)
        raise

    _fsync_directory(path.parent)


def atomic_write_text(path: Union[str, Path], text: str, encoding: str = "utf-8") -> None:
    atomic_write_bytes(path, text.encode(encoding))


class CountryMetadata:
    """Manages metadata for a single country's energy price data."""
    
    def __init__(self, country_code: str, metadata_dir: str = "../public", binary_file: Optional[Path] = None):
        self.country_code = country_code.upper()
        self.metadata_dir = Path(metadata_dir)
        self.metadata_dir.mkdir(parents=True, exist_ok=True)
        
        # Metadata file path
        self.metadata_file = self.metadata_dir / f"{country_code.lower()}_electricity_prices_metadata.json"
        # The artifact lives in public/, not next to the metadata; defaulting to the
        # metadata dir left file_size permanently at 0.
        self.binary_file = Path(binary_file) if binary_file else self.metadata_dir / f"{country_code.lower()}_electricity_prices.bin"
        
        # Load existing metadata
        self.metadata = self._load_metadata()
    
    def _load_metadata(self) -> dict:
        """Load existing metadata from file."""
        default_metadata = {
            "country": {
                "code": self.country_code,
                "name": self._get_country_name(self.country_code)
            },
            "data_coverage": {
                "total_records": 0,
                "first_timestamp": None,
                "last_timestamp": None,
                "covered_dates": [],  # List of YYYY-MM-DD strings
                "missing_dates": []   # Known gaps in coverage
            },
            "file_info": {
                "binary_file": f"{self.country_code.lower()}_electricity_prices.bin",
                "file_size": 0,
                "last_updated": None,
                "version": "1.0"
            },
            "data_source": {
                "api_url": "https://api.energy-charts.info/price",
                "license": "CC BY 4.0 (creativecommons.org/licenses/by/4.0) from Bundesnetzagentur | SMARD.de",
                "update_frequency": "daily"
            }
        }
        
        if not self.metadata_file.exists():
            return default_metadata
        
        try:
            with open(self.metadata_file, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
                # Merge with defaults to ensure all fields exist
                return self._merge_metadata(default_metadata, metadata)
        except Exception as e:
            logger.warning(f"Failed to load metadata for {self.country_code}, using defaults: {e}")
            return default_metadata
    
    def _merge_metadata(self, default: dict, loaded: dict) -> dict:
        """Merge loaded metadata with default structure."""
        result = default.copy()
        for key, value in loaded.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key].update(value)
            else:
                result[key] = value
        return result
    
    def _get_country_name(self, country_code: str) -> str:
        """Get full country name from code."""
        country_names = {
            "AT": "Austria",
            "DE-LU": "Germany & Luxembourg",
            "DE": "Germany", 
            "FR": "France",
            "CH": "Switzerland",
            "IT": "Italy",
            "ES": "Spain",
            "NL": "Netherlands"
        }
        return country_names.get(country_code, country_code)
    
    def update_from_binary_analysis(self, analysis: dict, covered_dates: List[date]) -> None:
        """Update metadata from binary file analysis."""
        logger.info(f"Updating metadata for {self.country_code}")
        
        self.metadata["data_coverage"]["total_records"] = analysis.get("total_records", 0)
        
        if "first_timestamp" in analysis and analysis["first_timestamp"]:
            self.metadata["data_coverage"]["first_timestamp"] = analysis["first_timestamp"].isoformat()
            
        if "last_timestamp" in analysis and analysis["last_timestamp"]:
            self.metadata["data_coverage"]["last_timestamp"] = analysis["last_timestamp"].isoformat()
        
        # Update covered dates
        covered_date_strings = [d.strftime("%Y-%m-%d") for d in sorted(covered_dates)]
        self.metadata["data_coverage"]["covered_dates"] = covered_date_strings
        
        # Update file info
        if self.binary_file.exists():
            self.metadata["file_info"]["file_size"] = self.binary_file.stat().st_size
        
        self.metadata["file_info"]["last_updated"] = datetime.now(timezone.utc).isoformat()
        
        logger.info(f"Metadata updated: {len(covered_dates)} days covered, "
                   f"{analysis.get('total_records', 0)} total records")
    
    def save(self) -> None:
        """Save metadata to file."""
        try:
            atomic_write_text(self.metadata_file, json.dumps(self.metadata, indent=2, ensure_ascii=False))
            logger.info(f"Metadata saved for {self.country_code}: {self.metadata_file}")
        except Exception as e:
            logger.error(f"Failed to save metadata for {self.country_code}: {e}")
            raise
