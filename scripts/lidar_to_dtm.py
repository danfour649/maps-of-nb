#!/usr/bin/env python3
"""LiDAR LAZ -> 1 m DTM (GeoTIFF) for maps-of-nb.

GeoNB's 2024 LiDAR tiles (1 km x 1 km, 20 pulses/m^2, LAS 1.4, CGVD2013,
NB Stereographic / EPSG:2953) arrive fully classified, so this pipeline
does not re-classify: it rasterizes the ground (class 2) and water
(class 9) returns into a 1 m mean-elevation grid per tile, fills the
remaining no-data cells (building footprints, dense canopy, river edges)
by nearest-neighbour, and writes one float32 GeoTIFF per tile. With
--mosaic it also builds a merged DTM and a hillshade via the GDAL CLI.

Why ground+water: class 2 alone leaves the Saint John River as a hole;
water returns sit at water level, so including class 9 keeps the river
surface continuous at the right elevation.

Outputs land in a directory the caller chooses (LAZ caches and rasters
are far too big for git — the repo carries this script, the tile
manifests, and the run documentation, not the data).

Usage:
    python lidar_to_dtm.py --manifest data/game-exports/downtown/lidar_tiles.json \
        --laz-dir /path/to/laz --out-dir /path/to/dtm
    python lidar_to_dtm.py --laz tile1.laz tile2.laz --out-dir /path/to/dtm \
        --mosaic fredericton_pilot_dtm.tif

Run statistics (inputs, point/class counts, filled cells, elevation
range, timings) are written to <out-dir>/run_stats.json.
"""
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

import laspy
import numpy as np
import rasterio
from rasterio.transform import from_origin
from scipy import ndimage

CRS = "EPSG:2953"
NODATA = -9999.0


def tile_grid(laz_path, classes, res):
    """Rasterize one LAZ tile to a filled (grid, stats) pair."""
    t0 = time.time()
    with laspy.open(laz_path) as reader:
        header = reader.header
        xmin = np.floor(header.mins[0] / res) * res
        ymax = np.ceil(header.maxs[1] / res) * res
        xmax = np.ceil(header.maxs[0] / res) * res
        ymin = np.floor(header.mins[1] / res) * res
        width = int(round((xmax - xmin) / res))
        height = int(round((ymax - ymin) / res))
        sums = np.zeros((height, width), dtype=np.float64)
        counts = np.zeros((height, width), dtype=np.uint32)
        n_points = 0
        n_kept = 0
        for pts in reader.chunk_iterator(2_000_000):
            n_points += len(pts)
            mask = np.isin(np.asarray(pts.classification), classes)
            if not mask.any():
                continue
            x = np.asarray(pts.x)[mask]
            y = np.asarray(pts.y)[mask]
            z = np.asarray(pts.z)[mask]
            n_kept += len(z)
            cols = np.clip(((x - xmin) / res).astype(np.int64), 0, width - 1)
            rows = np.clip(((ymax - y) / res).astype(np.int64), 0, height - 1)
            np.add.at(sums, (rows, cols), z)
            np.add.at(counts, (rows, cols), 1)
    grid = np.full((height, width), NODATA, dtype=np.float32)
    filled_from_points = counts > 0
    grid[filled_from_points] = (sums[filled_from_points] / counts[filled_from_points]).astype(np.float32)
    n_holes = int((~filled_from_points).sum())
    if n_holes:
        # nearest-neighbour fill: index of nearest valid cell per hole
        _, nearest = ndimage.distance_transform_edt(
            ~filled_from_points, return_indices=True)
        grid[~filled_from_points] = grid[tuple(nearest[:, ~filled_from_points])]
    stats = {
        "tile": laz_path.name,
        "points_total": n_points,
        "points_used": n_kept,
        "grid": [width, height],
        "cells_filled_by_interpolation": n_holes,
        "elev_min": float(grid.min()),
        "elev_max": float(grid.max()),
        "elev_mean": float(grid.mean()),
        "seconds": round(time.time() - t0, 2),
    }
    transform = from_origin(xmin, ymax, res, res)
    return grid, transform, stats


def write_geotiff(grid, transform, out_path):
    profile = {
        "driver": "GTiff",
        "dtype": "float32",
        "count": 1,
        "height": grid.shape[0],
        "width": grid.shape[1],
        "crs": CRS,
        "transform": transform,
        "nodata": NODATA,
        "tiled": True,
        "blockxsize": 256,
        "blockysize": 256,
        "compress": "deflate",
    }
    with rasterio.open(out_path, "w", **profile) as dst:
        dst.write(grid, 1)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--laz", nargs="*", default=[], help="LAZ files to process")
    ap.add_argument("--manifest", help="lidar_tiles.json manifest (repo format)")
    ap.add_argument("--laz-dir", help="directory holding the manifest's LAZ files")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--resolution", type=float, default=1.0)
    ap.add_argument("--classes", default="2,9",
                    help="comma-separated LAS classes to rasterize (default ground+water)")
    ap.add_argument("--mosaic", help="also build this merged DTM GeoTIFF (via GDAL VRT)")
    ap.add_argument("--hillshade", action="store_true",
                    help="with --mosaic, also write <mosaic stem>_hillshade.tif")
    args = ap.parse_args()

    laz_paths = [Path(p) for p in args.laz]
    if args.manifest:
        if not args.laz_dir:
            ap.error("--manifest requires --laz-dir")
        manifest = json.loads(Path(args.manifest).read_text())
        tiles = manifest["tiles"] if isinstance(manifest, dict) else manifest
        laz_dir = Path(args.laz_dir)
        laz_paths += [laz_dir / Path(t["File_URL"]).name for t in tiles]
    if not laz_paths:
        ap.error("no LAZ inputs (use --laz and/or --manifest)")

    classes = [int(c) for c in args.classes.split(",")]
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    run = {"started": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
           "classes": classes, "resolution_m": args.resolution, "tiles": []}
    tile_tifs = []
    for laz in sorted(laz_paths):
        if not laz.exists():
            print(f"MISSING {laz}", file=sys.stderr)
            run["tiles"].append({"tile": laz.name, "error": "missing"})
            continue
        grid, transform, stats = tile_grid(laz, classes, args.resolution)
        out_tif = out_dir / (laz.stem + "_dtm.tif")
        write_geotiff(grid, transform, out_tif)
        tile_tifs.append(out_tif)
        run["tiles"].append(stats)
        print(f"{laz.name}: {stats['points_used']:,}/{stats['points_total']:,} pts, "
              f"{stats['cells_filled_by_interpolation']:,} filled, "
              f"elev {stats['elev_min']:.2f}..{stats['elev_max']:.2f} m, {stats['seconds']}s")

    if args.mosaic and tile_tifs:
        mosaic_path = out_dir / args.mosaic
        vrt = out_dir / (mosaic_path.stem + ".vrt")
        subprocess.run(["gdalbuildvrt", str(vrt)] + [str(t) for t in tile_tifs], check=True)
        subprocess.run(["gdal_translate", "-co", "TILED=YES", "-co", "COMPRESS=DEFLATE",
                        str(vrt), str(mosaic_path)], check=True)
        print(f"mosaic: {mosaic_path}")
        if args.hillshade:
            hs = out_dir / (mosaic_path.stem + "_hillshade.tif")
            subprocess.run(["gdaldem", "hillshade", str(mosaic_path), str(hs),
                            "-z", "1.0", "-co", "COMPRESS=DEFLATE"], check=True)
            print(f"hillshade: {hs}")

    run["finished"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    (out_dir / "run_stats.json").write_text(json.dumps(run, indent=1))
    print(f"stats: {out_dir / 'run_stats.json'}")


if __name__ == "__main__":
    main()
