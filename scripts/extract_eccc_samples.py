#!/usr/bin/env python3
"""ECCC (MSC GeoMet OGC API) live feeds for Fredericton: endpoint list + one timestamped sample pull each.

These feeds are live (5-minute river stage, 1-minute weather), so there is no bulk dataset to archive. The
extract records the endpoints and saves a raw sample of each under <out>/C4-eccc-live/samples/, named with the
UTC pull time, so the response shapes the game's "live Fredericton" mode must parse are on file.

Feeds (https://api.weather.gc.ca, no key):
  hydrometric-stations / -realtime / -annual-peaks   station 01AK003 SAINT JOHN RIVER AT FREDERICTON
  swob-realtime                                      surface obs, station FREDERICTON CDA CS
  citypageweather-realtime                           city page weather incl. forecasts + sunrise/sunset (nb-29)
  aqhi-observations-realtime                         Air Quality Health Index, Fredericton

Usage:
    python3 scripts/extract_eccc_samples.py --out /mnt/folaDriveB/maps-of-nb-extracts/2026-10-24
"""
import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import extract_common as ec

API = "https://api.weather.gc.ca"
LICENCE = ("Not verified. ECCC/MSC open data is published under the Open Government Licence - Canada, but the "
           "licence text for these API collections was not read in the data-sources sweep; confirm before shipping.")

FEEDS = [
    ("hydrometric_station", "Station metadata (REAL_TIME flag, datum, drainage area)",
     "/collections/hydrometric-stations/items/01AK003?f=json"),
    ("hydrometric_realtime", "River stage/discharge, 5-minute cadence, newest 12 rows",
     "/collections/hydrometric-realtime/items?STATION_NUMBER=01AK003&limit=12&sortby=-DATETIME&f=json"),
    ("hydrometric_annual_peaks", "Annual peak levels back to 1968 (flood-replay calibration), 100 rows",
     "/collections/hydrometric-annual-peaks/items?STATION_NUMBER=01AK003&limit=100&f=json"),
    ("swob_realtime", "Surface weather obs, FREDERICTON CDA CS, newest 3 minute-observations",
     "/collections/swob-realtime/items?stn_nam-value=FREDERICTON%20CDA%20CS&limit=3&sortby=-date_tm-value&f=json"),
    ("citypageweather_realtime", "City page weather incl. forecasts and riseSet (Fredericton, nb-29)",
     "/collections/citypageweather-realtime/items/nb-29?f=json"),
    ("aqhi_observations_realtime", "Air Quality Health Index observation, Fredericton",
     "/collections/aqhi-observations-realtime/items?location_name_en=Fredericton&limit=3&f=json"),
]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    folder = Path(args.out) / "C4-eccc-live"
    samples = folder / "samples"
    samples.mkdir(parents=True, exist_ok=True)

    files, results, ok = [], [], 0
    for name, desc, path in FEEDS:
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        dest = samples / f"{name}_{stamp}.json"
        try:
            raw = ec.curl([API + path], timeout=90)
            doc = json.loads(raw)
            if isinstance(doc, dict) and doc.get("code") and doc.get("description"):
                raise RuntimeError(f"API error: {doc}")
            dest.write_bytes(raw)
            n = len(doc["features"]) if isinstance(doc, dict) and "features" in doc else 1
            files.append(dest)
            ok += 1
            results.append({"feed": name, "description": desc, "url": API + path, "pulled_at": stamp,
                            "sample_file": f"samples/{dest.name}", "records": n, "status": "ok"})
            print(f"  {name}: {n} record(s) -> {dest.name}")
        except Exception as exc:
            results.append({"feed": name, "description": desc, "url": API + path, "pulled_at": stamp,
                            "status": "FAILED", "error": f"{type(exc).__name__}: {exc}"})
            print(f"  {name}: FAILED {exc}")
    ep = ec.write_json(folder / "endpoints.json", {"api": API, "feeds": results})
    files.insert(0, ep)
    ec.finalize_source(folder, "C4", "ECCC live feeds (MSC GeoMet): endpoints + one sample pull each", API, LICENCE,
                       f"{ok}/{len(FEEDS)} feeds sampled", files,
                       "Live feeds, no bulk data. Sample pulls are timestamped (UTC) in their filenames.",
                       {"feeds": results})
    return 0 if ok == len(FEEDS) else 1


if __name__ == "__main__":
    sys.exit(main())
