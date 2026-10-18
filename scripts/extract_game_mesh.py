#!/usr/bin/env python3
"""Extract a game-mesh tile (buildings + roads) for GTA Fredericton.

Pulls one bounding box from GeoNB's ArcGIS services with paged REST queries
and writes game-ready GeoJSON: buildings with LiDAR ground/roof elevations,
roads with lane counts and names. This is the batch version of the live
queries the Maps of NB website's game-mesh explorer makes.

Usage:
    python3 scripts/extract_game_mesh.py [--bbox W,S,E,N] [--out DIR]

Default tile: downtown Fredericton.
Output: <out>/buildings.geojson, <out>/roads.geojson, <out>/stats.json
Stdlib only.
"""
import argparse
import json
import math
import urllib.parse
import urllib.request
from pathlib import Path

REST = "https://geonb.snb.ca/arcgis/rest/services"
UA = {"User-Agent": "maps-of-nb/1.0"}
PAGE = 1000

LAYERS = {
    "buildings": ("GeoNB_SNB_Buildings", 0, "min_g_elev,max_b_elev", "OBJECTID_1"),
    "roads": ("GeoNB_Basemap_NBRN", 1, "Number_Of_Lanes,Route_Name_English_1,Road_Segment_ID", "OBJECTID"),
}


def query_all(service: str, layer: int, fields: str, order_field: str, bbox: tuple) -> list:
    feats, offset = [], 0
    while True:
        q = urllib.parse.urlencode({
            "where": "1=1",
            "geometry": ",".join(str(x) for x in bbox),
            "geometryType": "esriGeometryEnvelope",
            "inSR": "4326", "outSR": "4326",
            "outFields": fields, "returnGeometry": "true",
            "f": "geojson", "resultRecordCount": str(PAGE),
            "resultOffset": str(offset), "orderByFields": order_field,
        })
        url = f"{REST}/{service}/MapServer/{layer}/query?{q}"
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=120) as resp:
            gj = json.load(resp)
        if "error" in gj:
            raise RuntimeError(f"{service}/{layer}: {gj['error']}")
        batch = gj.get("features", [])
        feats.extend(batch)
        if len(batch) < PAGE:
            return feats
        offset += PAGE


def round_coords(obj, nd=6):
    if isinstance(obj, (int, float)):
        return round(obj, nd)
    if isinstance(obj, list):
        return [round_coords(x, nd) for x in obj]
    return obj


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", default="-66.652,45.955,-66.628,45.970",
                    help="W,S,E,N in EPSG:4326 (default: downtown Fredericton)")
    ap.add_argument("--out", default="data/game-exports/downtown")
    args = ap.parse_args()
    bbox = tuple(float(x) for x in args.bbox.split(","))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    stats = {"bbox": bbox, "layers": {}}
    for name, (service, layer, fields, order_field) in LAYERS.items():
        feats = query_all(service, layer, fields, order_field, bbox)
        for f in feats:
            f["geometry"]["coordinates"] = round_coords(f["geometry"]["coordinates"])
            f["properties"] = {k: v for k, v in f.get("properties", {}).items() if v not in (None, "None", " ")}
        fc = {"type": "FeatureCollection", "features": feats}
        (out / f"{name}.geojson").write_text(json.dumps(fc))
        stats["layers"][name] = len(feats)
        print(f"{name}: {len(feats)} features -> {out}/{name}.geojson")

    # Elevation: LiDAR tile manifest for this bbox (the DTM stage of the
    # pipeline — replaces the game's ad hoc 30 m DEM from GTA PR #195 with
    # GeoNB LiDAR, ~1 m DTM in the same heightmap contract). We write the
    # manifest only; the LAZ pulls are big and cached separately.
    import urllib.request as _ur
    idx_q = urllib.parse.urlencode({
        "where": "1=1", "geometry": ",".join(str(x) for x in bbox),
        "geometryType": "esriGeometryEnvelope", "inSR": "4326", "outSR": "4326",
        "outFields": "TILE_NAME,File_URL,year,PPM,VERT_DATUM", "returnGeometry": "false",
        "f": "json", "resultRecordCount": "200",
    })
    # layer 11 = lidar_index_2024 (2025 index has no Fredericton coverage yet)
    req = _ur.Request(f"{REST}/GeoNB_SNB_LidarIndex/MapServer/11/query?{idx_q}", headers=UA)
    with _ur.urlopen(req, timeout=120) as resp:
        idx = json.load(resp)
    tiles = [f["attributes"] for f in idx.get("features", [])]
    (out / "lidar_tiles.json").write_text(json.dumps(
        {"vertical_datum": "CGVD2013", "tiles": tiles}, indent=2))
    stats["lidar_tiles"] = len(tiles)
    print(f"lidar: {len(tiles)} 1 km tiles in manifest -> {out}/lidar_tiles.json")

    buildings = json.loads((out / "buildings.geojson").read_text())["features"]
    heights = [f["properties"].get("max_b_elev", 0) - f["properties"].get("min_g_elev", 0) for f in buildings]
    if heights:
        stats["buildings_height_m"] = {
            "max": round(max(heights), 1),
            "mean": round(sum(heights) / len(heights), 1),
        }
    (out / "stats.json").write_text(json.dumps(stats, indent=2))
    print("stats:", json.dumps(stats))


if __name__ == "__main__":
    main()
