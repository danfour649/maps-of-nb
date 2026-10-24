#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb"]
# ///
"""Overture Maps extract for the Fredericton boundary bbox (DuckDB over the public S3 release).

Pulls, for the bbox of the city boundary (data/game-exports/fredericton/boundary.geojson):
  * base/infrastructure  - ALL street-furniture / utility features (crossings, street lamps, traffic
    signals, bus stops, benches, power poles, ...) as GeoParquet, plus one GeoJSON per class the game uses
  * places/place         - all places as GeoParquet and GeoJSON (Meta, Foursquare, Microsoft, ... sources)

Overture's release is read directly from s3://overturemaps-us-west-2/release/<rel>/ (no key). Without
--release the newest release in the Overture STAC catalogue is used.

Licences differ per source row: places are mostly CDLA-Permissive-2.0 (Foursquare Apache-2.0, AllThePlaces
CC0); infrastructure is OSM-derived (ODbL, credit "© OpenStreetMap contributors, Overture Maps Foundation").
Every row keeps its `sources` array so the per-row origin is preserved.

Usage (uv resolves duckdb from the inline metadata above):
    uv run scripts/extract_overture.py --out /mnt/folaDriveB/maps-of-nb-extracts/2026-10-24
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import duckdb  # noqa: E402
import extract_common as ec  # noqa: E402

STAC = "https://stac.overturemaps.org/catalog.json"
S3 = "s3://overturemaps-us-west-2/release"
LICENCE = ("Mixed per row (see `sources`): places mostly CDLA-Permissive-2.0 (Foursquare: Apache-2.0, AllThePlaces: CC0); "
           "infrastructure is OSM-derived, ODbL 1.0 - credit '© OpenStreetMap contributors, Overture Maps Foundation'.")

# GeoJSON convenience extracts: name -> SQL predicate on the infrastructure table.
INFRA_SETS = {
    "pedestrian_crossings": "class = 'crossing'",
    "street_lamps": "class = 'street_lamp'",
    "traffic_signals": "class = 'traffic_signals'",
    "bus_stops": "class IN ('bus_stop', 'bus_station')",
    "benches": "class = 'bench'",
}


def latest_release() -> str:
    return ec.fetch_json(STAC)["latest"]


def rows_to_geojson(con, sql: str, path: Path) -> int:
    """Run `sql` (must expose columns incl. `__geojson`) and write a FeatureCollection."""
    cur = con.execute(sql)
    cols = [d[0] for d in cur.description]
    n = 0
    with open(path, "w", encoding="utf-8") as fh:
        fh.write('{"type":"FeatureCollection","features":[')
        for row in cur.fetchall():
            rec = dict(zip(cols, row))
            geom = json.loads(rec.pop("__geojson"))
            props = {k: (json.loads(v) if k.endswith("__json") and v else v) for k, v in rec.items()}
            props = {k.removesuffix("__json"): v for k, v in props.items()}
            fh.write(("," if n else "") + json.dumps({"type": "Feature", "id": props.get("id"),
                                                        "geometry": geom, "properties": props},
                                                       separators=(",", ":"), ensure_ascii=False))
            n += 1
        fh.write("]}")
    return n


def select_list(con, src: str) -> str:
    """All columns except geometry/bbox; nested types become JSON text (suffix __json)."""
    parts = []
    for name, typ, *_ in con.execute(f"DESCRIBE SELECT * FROM {src} LIMIT 0").fetchall():
        if name in ("geometry", "bbox"):
            continue
        if any(t in typ for t in ("STRUCT", "MAP", "[]")):
            parts.append(f'to_json("{name}") AS "{name}__json"')
        else:
            parts.append(f'"{name}"')
    return ", ".join(parts)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--release", default=None, help="e.g. 2026-10-21.0 (default: latest in STAC)")
    args = ap.parse_args()

    release = args.release or latest_release()
    w, s, e, n = ec.bbox_of_coords(ec.boundary_rings(ec.load_boundary()))
    bb = f"bbox.xmax >= {w} AND bbox.xmin <= {e} AND bbox.ymax >= {s} AND bbox.ymin <= {n}"
    folder = Path(args.out) / "D1-overture"
    folder.mkdir(parents=True, exist_ok=True)

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;"
                "SET s3_region='us-west-2'; SET s3_url_style='path'; SET s3_endpoint='s3.us-west-2.amazonaws.com';")
    src_infra = f"read_parquet('{S3}/{release}/theme=base/type=infrastructure/*', hive_partitioning=1)"
    src_place = f"read_parquet('{S3}/{release}/theme=places/type=place/*', hive_partitioning=1)"
    files, counts = [], {}

    # ---- infrastructure: whole table as GeoParquet, then per-class GeoJSON
    con.execute(f"CREATE TABLE infra AS SELECT * FROM {src_infra} WHERE {bb}")
    counts["infrastructure"] = con.execute("SELECT count(*) FROM infra").fetchone()[0]
    p = folder / "infrastructure.parquet"
    con.execute(f"COPY (SELECT * FROM infra) TO '{p}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    files.append(p)
    # DuckDB >= 1.5 reads Overture geometry as a native GEOMETRY; older builds give WKB blobs.
    gtype = con.execute("SELECT typeof(geometry) FROM infra LIMIT 1").fetchone()[0]
    geom = "ST_AsGeoJSON(geometry)" if "GEOMETRY" in gtype.upper() else "ST_AsGeoJSON(ST_GeomFromWKB(geometry))"
    cols = select_list(con, "infra")
    for name, pred in INFRA_SETS.items():
        q = f"SELECT {cols}, {geom} AS __geojson FROM infra WHERE {pred}"
        p = folder / f"{name}.geojson"
        counts[name] = rows_to_geojson(con, q, p)
        files.append(p)
    counts["infrastructure_by_class"] = dict(con.execute(
        "SELECT class, count(*) FROM infra GROUP BY 1 ORDER BY 2 DESC").fetchall())

    # ---- places
    con.execute(f"CREATE TABLE places AS SELECT * FROM {src_place} WHERE {bb}")
    counts["places"] = con.execute("SELECT count(*) FROM places").fetchone()[0]
    p = folder / "places.parquet"
    con.execute(f"COPY (SELECT * FROM places) TO '{p}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    files.append(p)
    p = folder / "places.geojson"
    rows_to_geojson(con, f"SELECT {select_list(con, 'places')}, {geom} AS __geojson FROM places", p)
    files.append(p)
    counts["places_with_name"] = con.execute("SELECT count(*) FROM places WHERE names.primary IS NOT NULL").fetchone()[0]

    ec.finalize_source(
        folder, "D1", f"Overture Maps {release} - infrastructure + places (city bbox)",
        f"{S3}/{release}/theme=base/type=infrastructure/ and theme=places/type=place/", LICENCE,
        {k: v for k, v in counts.items() if k != "infrastructure_by_class"}, files,
        f"bbox W,S,E,N = {w:.4f},{s:.4f},{e:.4f},{n:.4f} (bounding box of the city boundary, not clipped to the polygon). "
        "Parquet keeps every Overture column; GeoJSON flattens nested columns to JSON.",
        {"release": release, "bbox": [w, s, e, n], "counts": counts})
    return 0


if __name__ == "__main__":
    sys.exit(main())
