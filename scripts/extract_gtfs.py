#!/usr/bin/env python3
"""Archive the Fredericton Transit static GTFS feed exactly as published.

The zip is saved untouched (the operator's feed, built by Consat Telematics, is
regenerated almost daily, so each pull is a dated snapshot). Only a summary of
the contents is read for the source record — nothing is transformed.

No GTFS-Realtime feed was found (see DATA-SOURCES.md, A4).

Usage:
    python3 scripts/extract_gtfs.py --out /mnt/folaDriveB/maps-of-nb-extracts/2026-10-24
"""
import argparse
import csv
import io
import sys
import zipfile
from pathlib import Path

import extract_common as ec

URL = "https://fredericton.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/gtfs.zip"
LICENCE = ("No licence or terms of use in the feed or on the publisher's page (Fredericton Transit / Consat "
           "tmix export). Treat as unverified; confirm with Fredericton Transit before redistributing.")


def rows(zf: zipfile.ZipFile, name: str):
    with zf.open(name) as fh:
        yield from csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8-sig"))


def summarize(path: Path) -> dict:
    with zipfile.ZipFile(path) as zf:
        names = zf.namelist()
        info = {n: sum(1 for _ in rows(zf, n)) for n in names if n.endswith(".txt")}
        s = {"members": info}
        if "feed_info.txt" in names:
            fi = next(rows(zf, "feed_info.txt"), {})
            s["feed_info"] = {k: fi.get(k) for k in ("feed_publisher_name", "feed_version", "feed_start_date",
                                                      "feed_end_date", "feed_lang") if k in fi}
        if "routes.txt" in names:
            s["routes"] = sorted(r.get("route_short_name") or r.get("route_id") for r in rows(zf, "routes.txt"))
    return s


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    folder = Path(args.out) / "A4-fredericton-transit-gtfs"
    zip_path = folder / "gtfs.zip"
    try:
        dl = ec.download(URL, zip_path)
        summ = summarize(zip_path)
    except Exception as exc:
        ec.failed_source(folder, "A4", "Fredericton Transit GTFS (static)", URL, LICENCE, f"{type(exc).__name__}: {exc}")
        return 1
    stop_times = summ["members"].get("stop_times.txt")
    ec.finalize_source(
        folder, "A4", "Fredericton Transit GTFS (static) - raw zip as published", URL, LICENCE,
        {"trips": summ["members"].get("trips.txt"), "stops": summ["members"].get("stops.txt"),
         "routes": summ["members"].get("routes.txt"), "shapes_rows": summ["members"].get("shapes.txt"),
         "stop_times": stop_times},
        [zip_path], "Archived untouched; summary below is read-only metadata. No GTFS-Realtime found.",
        {"http": dl["headers"], "gtfs_summary": summ})
    return 0


if __name__ == "__main__":
    sys.exit(main())
