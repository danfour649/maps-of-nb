#!/usr/bin/env python3
"""Extract a game-mesh area (buildings + roads + LiDAR manifest) for GTA Fredericton.

Two modes:
  --bbox W,S,E,N   Extract one envelope (default: downtown Fredericton pilot tile).
  --city NAME      Extract a full municipality: the official boundary polygon
                   comes from GeoNB_ELG_MunicipalAreas2 ("Local Government
                   Boundaries - January 2023") and every building/road inside
                   it is pulled with POST-paged ArcGIS queries.

Output: <out>/buildings.geojson, roads.geojson, lidar_tiles.json, stats.json
(plus boundary.geojson in --city mode). Stdlib only.

Usage:
    python3 scripts/extract_game_mesh.py
    python3 scripts/extract_game_mesh.py --city "The City of Fredericton" \
        --out data/game-exports/fredericton
"""
import argparse
import json
import urllib.parse
import urllib.request
from pathlib import Path

REST = "https://geonb.snb.ca/arcgis/rest/services"
UA = {"User-Agent": "maps-of-nb/1.0"}
PAGE = 1000

LAYERS = {
    "buildings": ("GeoNB_SNB_Buildings", 0, "min_g_elev,max_b_elev", "OBJECTID_1"),
    "roads": ("GeoNB_Basemap_NBRN", 1, "Number_Of_Lanes,Route_Name_English_1,Formatted_Street_Name,Func_Road_Class,Speed_Restrictions_Both,Dir_of_Traffic_Flow,Road_Segment_ID", "OBJECTID"),
}
BOUNDARY_SERVICE = ("GeoNB_ELG_MunicipalAreas2", 4)


def _curl_json(args: list) -> dict:
    # NOTE: urllib reads of GeoNB's larger chunked responses kept truncating
    # mid-stream in this environment (IncompleteRead) while curl pulls the
    # same URLs reliably — so all fetching goes through curl.
    import subprocess
    out = subprocess.run(
        ["curl", "-sS", "--fail", "--retry", "3", "--max-time", "300",
         "-H", f"User-Agent: {UA['User-Agent']}", *args],
        capture_output=True, text=True, timeout=330)
    if out.returncode != 0:
        raise RuntimeError(f"curl failed ({out.returncode}): {out.stderr.strip()[:200]}")
    return json.loads(out.stdout)


def fetch_json(url: str) -> dict:
    return _curl_json([url])


def post_query(service: str, layer: int, params: dict) -> dict:
    url = f"{REST}/{service}/MapServer/{layer}/query"
    args = []
    for k, v in params.items():
        args += ["--data-urlencode", f"{k}={v}"]
    return _curl_json([*args, url])


def query_all(service, layer, fields, order_field, geometry, geometry_type) -> list:
    feats, offset = [], 0
    while True:
        gj = post_query(service, layer, {
            "where": "1=1", "geometry": geometry, "geometryType": geometry_type,
            "inSR": "4326", "outSR": "4326", "outFields": fields,
            "returnGeometry": "true", "f": "geojson",
            "resultRecordCount": str(PAGE), "resultOffset": str(offset),
            "orderByFields": order_field, "spatialRel": "esriSpatialRelIntersects",
        })
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



def point_in_rings(x, y, rings) -> bool:
    """Ray-casting against the outer ring minus holes (rings[0] = outer)."""
    def inside(ring):
        c = False
        n = len(ring)
        for i in range(n):
            x1, y1 = ring[i][0], ring[i][1]
            x2, y2 = ring[(i + 1) % n][0], ring[(i + 1) % n][1]
            if (y1 > y) != (y2 > y):
                xin = (x2 - x1) * (y - y1) / (y2 - y1) + x1
                if x < xin:
                    c = not c
        return c
    if not inside(rings[0]):
        return False
    return not any(inside(hole) for hole in rings[1:])


def feature_anchor(geom):
    """A representative point: centroid of the first ring / middle vertex."""
    t = geom["type"]
    if t == "Polygon":
        ring = geom["coordinates"][0]
        return (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))
    if t == "MultiPolygon":
        ring = geom["coordinates"][0][0]
        return (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))
    if t in ("LineString", "MultiLineString"):
        line = geom["coordinates"] if t == "LineString" else geom["coordinates"][0]
        return tuple(line[len(line) // 2])
    if t == "Point":
        return tuple(geom["coordinates"])
    return None


def grid_query_all(service, layer, fields, order_field, bbox, rings, grid=3) -> list:
    """Envelope-grid GET extraction + client-side polygon clip + dedupe.
    POSTing a 3,485-point polygon filter makes GeoNB truncate responses;
    small GET envelope pages have been reliable, so tile the bbox instead."""
    import time as _time
    w, s_, e, n = bbox
    seen, kept = set(), []
    for i in range(grid):
        for j in range(grid):
            tile = (w + (e - w) * i / grid, s_ + (n - s_) * j / grid,
                    w + (e - w) * (i + 1) / grid, s_ + (n - s_) * (j + 1) / grid)
            offset = 0
            while True:
                q = urllib.parse.urlencode({
                    "where": "1=1", "geometry": ",".join(str(x) for x in tile),
                    "geometryType": "esriGeometryEnvelope", "inSR": "4326", "outSR": "4326",
                    "outFields": fields + "," + order_field, "returnGeometry": "true",
                    "f": "geojson", "resultRecordCount": "500",
                    "resultOffset": str(offset), "orderByFields": order_field,
                })
                gj = fetch_json(f"{REST}/{service}/MapServer/{layer}/query?{q}")
                if "error" in gj:
                    raise RuntimeError(f"{service}/{layer}: {gj['error']}")
                batch = gj.get("features", [])
                for f in batch:
                    key = f["properties"].get(order_field)
                    if key in seen:
                        continue
                    seen.add(key)
                    anchor = feature_anchor(f["geometry"])
                    if anchor and point_in_rings(anchor[0], anchor[1], rings):
                        kept.append(f)
                if len(batch) < 500:
                    break
                offset += 500
            _time.sleep(0.6)
    return kept

def fetch_boundary(name: str) -> dict:
    svc, layer = BOUNDARY_SERVICE
    q = urllib.parse.urlencode({
        "where": f"Name='{name}'", "outFields": "Name,Type,Shape_Area",
        "returnGeometry": "true", "outSR": "4326", "f": "geojson", "geometryPrecision": "6",
    })
    gj = fetch_json(f"{REST}/{svc}/MapServer/{layer}/query?{q}")
    if not gj.get("features"):
        raise RuntimeError(f"municipality not found: {name}")
    return gj


def bbox_of(geojson) -> tuple:
    xs, ys = [], []
    def walk(c):
        if isinstance(c[0], (int, float)):
            xs.append(c[0]); ys.append(c[1])
        else:
            for x in c: walk(x)
    for f in geojson["features"]:
        walk(f["geometry"]["coordinates"])
    return (min(xs), min(ys), max(xs), max(ys))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", help="W,S,E,N in EPSG:4326 (envelope mode)")
    ap.add_argument("--city", help='municipality Name, e.g. "The City of Fredericton" (boundary mode)')
    ap.add_argument("--out", default=None)
    ap.add_argument("--only", default="", help="comma-separated subset of layers (buildings,roads)")
    args = ap.parse_args()

    if args.city:
        out_pre = Path(args.out or "data/game-exports/city")
        cache = out_pre / "boundary.geojson"
        if cache.exists():
            boundary = json.loads(cache.read_text())
            print(f"boundary: using cached {cache}")
        else:
            boundary = fetch_boundary(args.city)
        geom = boundary["features"][0]["geometry"]
        rings = geom["coordinates"] if geom["type"] == "Polygon" else geom["coordinates"][0]
        # Thin the ring for use as a query filter: the full 3,485-point ring
        # makes ~120 KB POST bodies that GeoNB's server keeps truncating.
        # ~600 evenly spaced points keep the shape within ~100 m — fine for
        # an extraction filter; the full-precision boundary is saved as-is.
        def thin(ring, target=600):
            if len(ring) <= target:
                return ring
            step = len(ring) / target
            return [ring[int(i * step)] for i in range(target)] + [ring[0]]
        query_rings = [thin(r) for r in rings]
        geometry = json.dumps({"rings": query_rings, "spatialReference": {"wkid": 4326}})
        geometry_type = "esriGeometryPolygon"
        bbox = bbox_of(boundary)
        out = Path(args.out or "data/game-exports/city")
    else:
        bbox = tuple(float(x) for x in (args.bbox or "-66.652,45.955,-66.628,45.970").split(","))
        geometry = ",".join(str(x) for x in bbox)
        geometry_type = "esriGeometryEnvelope"
        boundary = None
        out = Path(args.out or "data/game-exports/downtown")
    out.mkdir(parents=True, exist_ok=True)

    stats = {"bbox": bbox, "layers": {}}
    if boundary:
        stats["municipality"] = args.city
        (out / "boundary.geojson").write_text(json.dumps(boundary))
        print(f"boundary: {args.city} -> {out}/boundary.geojson")

    only = {x.strip() for x in args.only.split(",") if x.strip()}
    for name, (service, layer, fields, order_field) in LAYERS.items():
        if only and name not in only:
            continue
        if boundary:
            geom0 = boundary["features"][0]["geometry"]
            rings0 = geom0["coordinates"] if geom0["type"] == "Polygon" else geom0["coordinates"][0]
            feats = grid_query_all(service, layer, fields, order_field, bbox, rings0)
        else:
            feats = query_all(service, layer, fields, order_field, geometry, geometry_type)
        for f in feats:
            f["geometry"]["coordinates"] = round_coords(f["geometry"]["coordinates"])
            f["properties"] = {k: v for k, v in f.get("properties", {}).items() if v not in (None, "None", " ")}
        (out / f"{name}.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}))
        stats["layers"][name] = len(feats)
        print(f"{name}: {len(feats)} features -> {out}/{name}.geojson")

    # LiDAR tile manifest over the bbox (DTM stage; LAZ pulls are cached separately).
    idx_q = urllib.parse.urlencode({
        "where": "1=1", "geometry": ",".join(str(x) for x in bbox),
        "geometryType": "esriGeometryEnvelope", "inSR": "4326", "outSR": "4326",
        "outFields": "TILE_NAME,File_URL,year,PPM,VERT_DATUM", "returnGeometry": "false",
        "f": "json", "resultRecordCount": "1000",
    })
    idx = fetch_json(f"{REST}/GeoNB_SNB_LidarIndex/MapServer/11/query?{idx_q}")  # 2024 index
    tiles = [f["attributes"] for f in idx.get("features", [])]
    (out / "lidar_tiles.json").write_text(json.dumps({"vertical_datum": "CGVD2013", "tiles": tiles}, indent=2))
    stats["lidar_tiles"] = len(tiles)
    print(f"lidar: {len(tiles)} 1 km tiles -> {out}/lidar_tiles.json")

    buildings = json.loads((out / "buildings.geojson").read_text())["features"]
    heights = [f["properties"].get("max_b_elev", 0) - f["properties"].get("min_g_elev", 0) for f in buildings]
    if heights:
        stats["buildings_height_m"] = {"max": round(max(heights), 1), "mean": round(sum(heights) / len(heights), 1)}
    (out / "stats.json").write_text(json.dumps(stats, indent=2))
    print("stats:", json.dumps(stats))


if __name__ == "__main__":
    main()
