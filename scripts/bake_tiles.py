#!/usr/bin/env python3
"""Bake the Fredericton game exports into a single PMTiles vector archive.

The viewer originally queried GeoNB's ArcGIS services live per viewport,
which hits per-response caps (1,000-2,000 features), multi-second server
generation (contours ~30 s cold), and a refetch on every pan. Baking the
exports we already produce into PMTiles turns all four layers into static
tiles the browser/CDN cache normally. Re-run after refreshing the exports
(scripts/extract_game_mesh.py), then upload the archive as the
`tiles-v<date>` GitHub Release asset and update TILES_URL in web/src/main.ts
if the URL changed.

Usage (venv with the bake deps — see tools/setup_bake_env.sh):
    tools/.venv/bin/python scripts/bake_tiles.py \
        --exports data/game-exports/fredericton --out tiles/fredericton.pmtiles
"""
import argparse
import gzip
import json
from pathlib import Path

import mapbox_vector_tile
import mercantile
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer
from shapely.geometry import box, shape
from shapely.ops import transform as shp_transform
from shapely.strtree import STRtree

EXTENT = 4096
BUFFER_PX = 16

# layer -> (geojson file, min zoom, max zoom, simplify tolerance in degrees at max zoom)
LAYERS = {
    "buildings": ("buildings.geojson", 12, 16, 0.0),
    "roads": ("roads.geojson", 11, 16, 0.00002),
    "wetlands": ("wetlands.geojson", 10, 15, 0.00005),
    "contours": ("contours.geojson", 12, 15, 0.00003),
}


def _proj_fn(b):
    span_x = b.east - b.west
    span_y = b.north - b.south

    def fn(xs, ys, zs=None):
        px = [(x - b.west) / span_x * EXTENT for x in xs]
        py = [(b.north - y) / span_y * EXTENT for y in ys]
        return tuple(px), tuple(py)

    return fn


def bake(exports: Path, out_path: Path):
    datasets = {}
    for name, (fname, zmin, zmax, tol) in LAYERS.items():
        p = exports / fname
        if not p.exists():
            print(f"skip {name}: {p} missing")
            continue
        fc = json.loads(p.read_text())
        feats = []
        for f in fc["features"]:
            g = shape(f["geometry"])
            if not g.is_valid:
                g = g.buffer(0)  # ArcGIS footprints sometimes self-intersect
            if tol and not g.is_empty:
                g = g.simplify(tol, preserve_topology=True)
            feats.append((g, f.get("properties", {})))
        datasets[name] = (feats, zmin, zmax, STRtree([g for g, _ in feats]))
        print(f"{name}: {len(feats)} features, z{zmin}-{zmax}")
    if not datasets:
        raise SystemExit("no datasets found")

    # overall bounds from buildings if present else first dataset
    ref = next(iter(datasets.values()))[0]
    xs = [g.bounds[0] for g, _ in ref] + [g.bounds[2] for g, _ in ref]
    ys = [g.bounds[1] for g, _ in ref] + [g.bounds[3] for g, _ in ref]
    west, east, south, north = min(xs), max(xs), min(ys), max(ys)

    gmin = min(v[1] for v in datasets.values())
    gmax = max(v[2] for v in datasets.values())

    out_path.parent.mkdir(parents=True, exist_ok=True)
    n_tiles = 0
    with open(out_path, "wb") as f:
        w = Writer(f)
        for z in range(gmin, gmax + 1):
            tiles = list(mercantile.tiles(west, south, east, north, z))
            for tile in tiles:
                layers = []
                tb = mercantile.bounds(tile)
                buf = (tb.east - tb.west) * BUFFER_PX / EXTENT
                clip = box(tb.west - buf, tb.south - buf, tb.east + buf, tb.north + buf)
                for name, (feats, zmin, zmax, tree) in datasets.items():
                    if z < zmin or z > zmax:
                        continue
                    tfeats = []
                    for idx in tree.query(clip):
                        g, props = feats[int(idx)]
                        try:
                            cg = g.intersection(clip)
                        except Exception:
                            cg = g  # unclipped fallback: minor edge overdraw
                        if cg.is_empty:
                            continue
                        pg = shp_transform(_proj_fn(tb), cg)
                        tfeats.append({"geometry": pg, "properties": props})
                    if tfeats:
                        layers.append({"name": name, "features": tfeats})
                if not layers:
                    continue
                mvt = mapbox_vector_tile.encode(layers, default_options={
                    "quantize_bounds": (0, 0, EXTENT, EXTENT),
                    "y_coord_down": True,
                })
                w.write_tile(zxy_to_tileid(tile.z, tile.x, tile.y), gzip.compress(mvt))
                n_tiles += 1
            print(f"z{z} done ({n_tiles} tiles so far)")
        header = {
            "tile_type": TileType.MVT,
            "tile_compression": Compression.GZIP,
            "min_zoom": gmin, "max_zoom": gmax,
            "min_lon": west, "min_lat": south, "max_lon": east, "max_lat": north,
            "center_lon": (west + east) / 2, "center_lat": (south + north) / 2,
            "center_zoom": 12,
        }
        metadata = {
            "name": "maps-of-nb Fredericton (GeoNB)",
            "format": "pbf",
            "vector_layers": [
                {"id": name, "fields": {}, "minzoom": datasets[name][1], "maxzoom": datasets[name][2]}
                for name in datasets
            ],
        }
        w.finalize(header, metadata)
    print(f"wrote {out_path} ({out_path.stat().st_size/1e6:.1f} MB, {n_tiles} tiles)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--exports", default="data/game-exports/fredericton")
    ap.add_argument("--out", default="tiles/fredericton.pmtiles")
    a = ap.parse_args()
    bake(Path(a.exports), Path(a.out))
