#!/usr/bin/env python3
"""Riverbed soundings for the viewer: sections_relcd.csv -> GeoJSON points.

scripts/import_bathymetry.py writes the CHS NONNA samples in the game's
own frame (rotated metres about a Fredericton origin). The web viewer
needs them where they actually are, so this undoes that frame with the
importer's own game_to_geo() and attaches the depth below the normal
water surface using the importer's datum constant. Stdlib only.

Output properties, per point:
  d    depth below the normal water surface, metres (SURFACE_ABOVE_CD - bed)
  bed  bed elevation relative to Chart Datum, metres (as published by CHS)

Usage: python3 scripts/bathymetry_to_geojson.py
"""
import argparse
import csv
import json
from pathlib import Path

from import_bathymetry import SURFACE_ABOVE_CD, game_to_geo

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_IN = ROOT / "data/extracts/bathymetry/sections_relcd.csv"
DEFAULT_OUT = ROOT / "web/public/bathymetry-fredericton.geojson"


def to_features(rows) -> list:
    """One point per sample; duplicate positions (the importer repeats the
    shoreline samples of a transect) collapse to the first."""
    feats, seen = [], set()
    for row in rows:
        lat, lon = game_to_geo(float(row["game_x"]), float(row["game_z"]))
        key = (round(lon, 5), round(lat, 5))
        if key in seen:
            continue
        seen.add(key)
        bed = float(row["bed_elev_rel_cd"])
        feats.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [key[0], key[1]]},
            "properties": {"d": round(SURFACE_ABOVE_CD - bed, 2), "bed": round(bed, 2)},
        })
    return feats


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--relcd", type=Path, default=DEFAULT_IN)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()
    with args.relcd.open() as f:
        feats = to_features(csv.DictReader(f))
    args.out.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")))
    depths = [f["properties"]["d"] for f in feats]
    print(f"{len(feats)} soundings -> {args.out} (depth {min(depths):.1f}..{max(depths):.1f} m)")


if __name__ == "__main__":
    main()
