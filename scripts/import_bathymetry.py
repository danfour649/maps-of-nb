#!/usr/bin/env python3
"""Bathymetry back-port: CHS NONNA soundings -> riverbed transect sections.

Back-port of the pipeline MVT Fredericton runs for its measured
riverbed (game PR #1229 / TODO #316; authoring tool
tools/bathy_ingest.py in danfour649/GTAfredericton). Per the method
ruling, the data moves through this repo's own script -- no
hand-copied files: the WCS fetch, TIFF reader, transect sampling and
datum reconciliation below are the game's machinery, with the output
side re-pointed at maps-of-nb.

Sources (all open data):
  * CHS NONNA bathymetric grids (10 m / 100 m), Canadian Hydrographic
    Service Non-Navigational Bathymetric Data, Open Government dataset
    d3881c4c-650d-4070-bf9b-1e00aabf0a1d, served by WCS 2.0.1 at
    nonna-geoserver.data.chs-shc.ca. Values are bed elevations
    relative to Chart Datum (CD), native CRS EPSG:3857.
  * CHS ATL 107 Sailing Directions, ch. 6 (Jemseg-Fredericton): chart
    datum at Fredericton is 0.9 m above Geodetic Datum.

Datum reconciliation: depth = SURFACE_ABOVE_CD - bed_elev_rel_cd,
where SURFACE_ABOVE_CD (2.0 m) is the height of the normal water
surface above CD -- bracketed 1.5-2.5 m against the CRI/UNB measured
depth band at the Westmorland thalweg (-5.5 rel CD), pinned at 2.0
pending the hydrometric gauge datum. Section SHAPES are independent
of the constant; absolute depths shift uniformly with it (+/-0.5 m).
Chart Datum at Fredericton sits 0.9 m above Geodetic Datum (ATL 107),
so bed elevation geodetic = bed_elev_rel_cd - 0.9 m.

Transect frame: the game's own frame, kept deliberately -- origin
(45.96315, -66.64280), metres-per-degree at that latitude, the pinned
-35.936 deg grid rotation inverted. Cross-channel position t at a
station comes from the game's shore table (input:
--shores PATH to fredericton_osm.json; its river.shores rows are
[x, lo, hi] in game metres). Stations ride every 2nd shore row
(~300 m), keep >= 6 measured samples, and bin t into 21 bins
(0.00..1.00); empty bins are linearly interpolated and the end bins
are pinned to 0.0 (the waterline contract).

Outputs (defaults):
  data/extracts/bathymetry/sections_relcd.csv -- the raw portable
    samples: game_x, game_z, t, bed_elev_rel_cd (metres rel CD).
  data/extracts/bathymetry/sections.csv -- per-station binned
    profiles: game_x, n_measured, depth_t0.00 .. depth_t1.00
    (metres below the normal water surface).

Usage: python3 scripts/import_bathymetry.py --shores PATH [--cache DIR]
Re-running re-fetches the WCS subsets unless cached TIFFs are
present. The raw NONNA payload as archived for this port lives in
Drive ("MVTF B1 bathymetry raw (NONNA)").
"""

import argparse
import csv
import json
import math
import os
import struct
import sys
import urllib.parse
import urllib.request

WCS = "https://nonna-geoserver.data.chs-shc.ca/geoserver/wcs"
REACH_LON = (-66.74, -66.53)
REACH_LAT = (45.92, 46.01)
SURFACE_ABOVE_CD = 2.0  # see header: bracketed 1.5-2.5, gauge pin pending
STATION_EVERY = 2       # every 2nd shore row (~300 m)
MIN_POINTS = 6          # measured samples for a station to be kept
T_BINS = 21             # t = 0.00 .. 1.00 in 0.05 steps

ORIGIN_LAT, ORIGIN_LON = 45.96315, -66.64280
ROT = math.radians(35.936)  # inverse of the pinned -35.936 deg
R_EARTH = 6378137.0


def metres_per_degree(lat):
    return (111132.92 - 559.82 * math.cos(2 * math.radians(lat)),
            111412.84 * math.cos(math.radians(lat)))


M_LAT, M_LON = metres_per_degree(ORIGIN_LAT)


def fetch_grid(coverage, cache_dir):
    name = coverage.replace(" ", "_") + ".tif"
    path = os.path.join(cache_dir, name)
    if os.path.exists(path) and os.path.getsize(path) > 10000:
        return path
    x0 = R_EARTH * math.radians(REACH_LON[0])
    x1 = R_EARTH * math.radians(REACH_LON[1])
    y0 = R_EARTH * math.log(math.tan(math.pi / 4 + math.radians(REACH_LAT[0]) / 2))
    y1 = R_EARTH * math.log(math.tan(math.pi / 4 + math.radians(REACH_LAT[1]) / 2))
    url = (f"{WCS}?service=WCS&version=2.0.1&request=GetCoverage"
           f"&coverageId=nonna__{urllib.parse.quote(coverage)}%20Coverage"
           f"&subset=X({x0:.1f},{x1:.1f})&subset=Y({y0:.1f},{y1:.1f})"
           f"&format=image/tiff")
    os.makedirs(cache_dir, exist_ok=True)
    urllib.request.urlretrieve(url, path)
    return path


def read_tiff(path):
    d = open(path, "rb").read()
    e = "<" if d[:2] == b"II" else ">"
    ifd = struct.unpack(e + "I", d[4:8])[0]
    n = struct.unpack(e + "H", d[ifd:ifd + 2])[0]
    TSZ = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8,
           11: 4, 12: 8, 16: 8, 17: 8, 18: 8}
    tags = {}
    for i in range(n):
        off = ifd + 2 + i * 12
        tag, typ, cnt = struct.unpack(e + "HHI", d[off:off + 8])
        sz = TSZ.get(typ, 1) * cnt
        raw = d[off + 8:off + 12] if sz <= 4 else \
            d[struct.unpack(e + "I", d[off + 8:off + 12])[0]:][:sz]
        fmt = {3: "H", 4: "I", 11: "f", 12: "d", 1: "B", 6: "b", 8: "h",
               9: "i", 16: "Q"}.get(typ)
        if fmt:
            vals = struct.unpack(e + fmt * cnt, raw[:struct.calcsize(fmt) * cnt])
            tags[tag] = vals if cnt > 1 else vals[0]
        elif typ == 5:
            tags[tag] = tuple(
                struct.unpack(e + "II", raw[j * 8:j * 8 + 8])[0] /
                struct.unpack(e + "II", raw[j * 8:j * 8 + 8])[1]
                for j in range(cnt))
        else:
            tags[tag] = raw
    W, H = tags[256], tags[257]
    NOD = 3.4e38
    grid = [[None] * W for _ in range(H)]
    if 324 in tags:  # tiled
        TW, TH = tags[322], tags[323]
        offs, cnts = tags[324], tags[325]
        tx = (W + TW - 1) // TW
        for ti, (off, cnt) in enumerate(zip(offs, cnts)):
            gx, gy = (ti % tx) * TW, (ti // tx) * TH
            vals = struct.unpack(e + "f" * (cnt // 4), d[off:off + cnt])
            for j in range(TH):
                for i in range(TW):
                    x, y = gx + i, gy + j
                    if x < W and y < H and vals[j * TW + i] < NOD:
                        grid[y][x] = vals[j * TW + i]
    else:  # stripped
        offs = tags[273] if isinstance(tags[273], tuple) else (tags[273],)
        cnts = tags[279] if isinstance(tags[279], tuple) else (tags[279],)
        vals = []
        for off, cnt in zip(offs, cnts):
            vals += list(struct.unpack(e + "f" * (cnt // 4), d[off:off + cnt]))
        for r in range(H):
            for c in range(W):
                if vals[r * W + c] < NOD:
                    grid[r][c] = vals[r * W + c]
    mt = tags[34264]
    return grid, W, H, mt[3], mt[0], mt[7], mt[5]


class Grid:
    def __init__(self, path):
        self.grid, self.W, self.H, self.x0, self.px, self.y0, self.py = \
            read_tiff(path)

    def sample_geo(self, lat, lon):
        X = R_EARTH * math.radians(lon)
        Y = R_EARTH * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
        cx = int((X - self.x0) / self.px)
        cy = int((Y - self.y0) / self.py)
        if 0 <= cx < self.W and 0 <= cy < self.H:
            return self.grid[cy][cx]
        return None


def game_to_geo(x, z):
    c, s = math.cos(ROT), math.sin(ROT)
    xp, zp = x * c - z * s, x * s + z * c
    return ORIGIN_LAT - zp / M_LAT, ORIGIN_LON + xp / M_LON



def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default="/tmp/bathy_cache")
    ap.add_argument("--shores", required=True,
                    help="path to fredericton_osm.json (game shore table)")
    ap.add_argument("--relcd", default="data/extracts/bathymetry/sections_relcd.csv")
    ap.add_argument("--out", default="data/extracts/bathymetry/sections.csv")
    args = ap.parse_args()

    g100 = Grid(fetch_grid("NONNA 100", args.cache))
    g10 = Grid(fetch_grid("NONNA 10", args.cache))

    with open(args.shores) as f:
        shores = json.load(f)["river"]["shores"]

    stations = []  # (x, [depth per t-bin], measured_points)
    csv_rows = []
    for i in range(0, len(shores), STATION_EVERY):
        sx, lo, hi = (float(v) for v in shores[i])
        if hi - lo < 50:
            continue
        pts = []
        gz = lo - 40.0
        while gz <= hi + 40.0:
            lat, lon = game_to_geo(sx, gz)
            v = g100.sample_geo(lat, lon)
            if v is None:
                v = g10.sample_geo(lat, lon)
            if v is not None:
                t = min(1.0, max(0.0, (gz - lo) / (hi - lo)))
                pts.append((t, SURFACE_ABOVE_CD - v))
                csv_rows.append([sx, round(gz, 1), round(t, 3), round(v, 2)])
            gz += 10.0
        if len(pts) < MIN_POINTS:
            continue
        bins = [[] for _ in range(T_BINS)]
        for t, dep in pts:
            bins[min(T_BINS - 1, int(t * (T_BINS - 1) + 0.5))].append(dep)
        prof = []
        for b in bins:
            prof.append(sorted(b)[len(b) // 2] if b else None)
        # fill empty bins by linear interpolation between measured bins
        known = [j for j, v in enumerate(prof) if v is not None]
        for j in range(T_BINS):
            if prof[j] is None:
                a = max([k for k in known if k < j], default=None)
                b = min([k for k in known if k > j], default=None)
                if a is not None and b is not None:
                    prof[j] = prof[a] + (prof[b] - prof[a]) * (j - a) / (b - a)
                elif a is not None:
                    prof[j] = prof[a]
                elif b is not None:
                    prof[j] = prof[b]
                else:
                    prof[j] = 0.0
        prof[0] = 0.0
        prof[-1] = 0.0  # waterline contract: bed meets surface at shores
        prof = [round(max(0.0, min(9.5, v)), 2) for v in prof]
        stations.append((sx, prof, len(pts)))

    for path in (args.relcd, args.out):
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(args.relcd, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["game_x", "game_z", "t", "bed_elev_rel_cd"])
        w.writerows(csv_rows)
    with open(args.out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["game_x", "n_measured"] +
                   ["depth_t%.2f" % (j / (T_BINS - 1)) for j in range(T_BINS)])
        for sx, prof, n in stations:
            w.writerow([sx, n] + prof)
    print("stations kept: %d; raw samples: %d" % (len(stations), len(csv_rows)))


if __name__ == "__main__":
    main()
