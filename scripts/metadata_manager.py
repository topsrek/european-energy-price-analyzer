#!/usr/bin/env python3
"""
Metadata Manager for Energy Price Database

Manages metadata files that track what data is included in each country's
binary database file. This allows us to efficiently manage multiple countries
and track data coverage.
"""

import json
import logging
from datetime import datetime, date
from pathlib import Path
from typing import Dict, List, Set, Optional

logger = logging.getLogger(__name__)

class CountryMetadata:
    """Manages metadata for a single country's energy price data."""
    
    def __init__(self, country_code: str, metadata_dir: str = "../public"):
        self.country_code = country_code.upper()
        self.metadata_dir = Path(metadata_dir)
        self.metadata_dir.mkdir(parents=True, exist_ok=True)
        
        # Metadata file path
        self.metadata_file = self.metadata_dir / f"{country_code.lower()}_electricity_prices_metadata.json"
        self.binary_file = self.metadata_dir / f"{country_code.lower()}_electricity_prices.bin"
        
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
        
        self.metadata["file_info"]["last_updated"] = datetime.now().isoformat()
        
        logger.info(f"Metadata updated: {len(covered_dates)} days covered, "
                   f"{analysis.get('total_records', 0)} total records")
    
    def find_missing_dates(self, start_date: date, end_date: date) -> Set[date]:
        """Find missing dates in the specified range."""
        from datetime import timedelta
        
        covered_dates = set()
        
        for date_str in self.metadata["data_coverage"]["covered_dates"]:
            try:
                covered_dates.add(datetime.strptime(date_str, "%Y-%m-%d").date())
            except ValueError:
                continue
        
        missing_dates = set()
        current_date = start_date
        
        while current_date <= end_date:
            if current_date not in covered_dates:
                missing_dates.add(current_date)
            current_date += timedelta(days=1)
        
        return missing_dates
    
    def add_covered_dates(self, new_dates: List[date]) -> None:
        """Add new dates to the covered dates list."""
        current_covered = set()
        
        for date_str in self.metadata["data_coverage"]["covered_dates"]:
            try:
                current_covered.add(datetime.strptime(date_str, "%Y-%m-%d").date())
            except ValueError:
                continue
        
        # Add new dates
        current_covered.update(new_dates)
        
        # Sort and convert back to strings
        covered_date_strings = [d.strftime("%Y-%m-%d") for d in sorted(current_covered)]
        self.metadata["data_coverage"]["covered_dates"] = covered_date_strings
        
        logger.info(f"Added {len(new_dates)} new dates to {self.country_code} coverage")
    
    def save(self) -> None:
        """Save metadata to file."""
        try:
            with open(self.metadata_file, 'w', encoding='utf-8') as f:
                json.dump(self.metadata, f, indent=2, ensure_ascii=False)
            logger.info(f"Metadata saved for {self.country_code}: {self.metadata_file}")
        except Exception as e:
            logger.error(f"Failed to save metadata for {self.country_code}: {e}")
            raise
    
    def get_summary(self) -> dict:
        """Get a summary of the data coverage."""
        coverage = self.metadata["data_coverage"]
        file_info = self.metadata["file_info"]
        
        summary = {
            "country": self.metadata["country"]["name"],
            "total_records": coverage["total_records"],
            "days_covered": len(coverage["covered_dates"]),
            "file_size": file_info["file_size"],
            "last_updated": file_info["last_updated"]
        }
        
        if coverage["first_timestamp"] and coverage["last_timestamp"]:
            summary["date_range"] = f"{coverage['first_timestamp'][:10]} to {coverage['last_timestamp'][:10]}"
        else:
            summary["date_range"] = "No data"
        
        return summary

class MetadataManager:
    """Manages metadata for all countries."""
    
    def __init__(self, metadata_dir: str = "../public"):
        self.metadata_dir = Path(metadata_dir)
        self.metadata_dir.mkdir(parents=True, exist_ok=True)
        self.countries = {}
    
    def get_country_metadata(self, country_code: str) -> CountryMetadata:
        """Get or create country metadata object."""
        country_code = country_code.upper()
        
        if country_code not in self.countries:
            self.countries[country_code] = CountryMetadata(country_code, str(self.metadata_dir))
        
        return self.countries[country_code]
    
    def get_all_countries_summary(self) -> dict:
        """Get summary of all countries with data."""
        summaries = {}
        
        # Look for existing metadata files
        for metadata_file in self.metadata_dir.glob("*_electricity_prices_metadata.json"):
            country_code = metadata_file.stem.replace("_electricity_prices_metadata", "").upper()
            
            try:
                country_metadata = self.get_country_metadata(country_code)
                summaries[country_code] = country_metadata.get_summary()
            except Exception as e:
                logger.warning(f"Failed to load summary for {country_code}: {e}")
        
        return summaries
    
    def create_global_index(self) -> None:
        """Create a global index file of all available countries."""
        summaries = self.get_all_countries_summary()
        
        global_index = {
            "available_countries": summaries,
            "last_updated": datetime.now().isoformat(),
            "total_countries": len(summaries),
            "format_version": "1.0"
        }
        
        index_file = self.metadata_dir / "electricity_prices_index.json"
        
        try:
            with open(index_file, 'w', encoding='utf-8') as f:
                json.dump(global_index, f, indent=2, ensure_ascii=False)
            logger.info(f"Global index created: {index_file}")
        except Exception as e:
            logger.error(f"Failed to create global index: {e}")
            raise
