# 005 — CHS NONNA bathymetry (Saint John River, Fredericton reach)

**Publisher:** Canadian Hydrographic Service (CHS)
**Service:** WCS 2.0.1 at `nonna-geoserver.data.chs-shc.ca` (coverages
`NONNA 100 Coverage` / `NONNA 10 Coverage`)
**Status:** Wired in 2026-11-06 — back-port of the pipeline MVT
Fredericton runs for its measured riverbed (game PR #1229); the data
moved through `scripts/import_bathymetry.py`, not by hand.

## What it is

CHS Non-Navigational Bathymetric Data (NONNA), Open Government
dataset `d3881c4c-650d-4070-bf9b-1e00aabf0a1d`. Grid values are bed
elevations relative to **Chart Datum (CD)**, native CRS EPSG:3857.

- **NONNA 10** at Fredericton is sparse legacy sounding postings only
  (no surface); **NONNA 100** is a filled composite and carries the
  sections. The script samples 100 first and falls back to 10.
- Reach: lon −66.74..−66.53, lat 45.92..46.01 (Jemseg–Fredericton).
- The raw payload as archived for this port (grids, reach TIFFs, CHS
  ATL 107 extract) lives in Google Drive, folder **"MVTF B1
  bathymetry raw (NONNA)"** — the repo carries the script and its
  CSV outputs, not the grids.

## Datum reconciliation

- `depth = SURFACE_ABOVE_CD − bed_elev_rel_cd`, with
  `SURFACE_ABOVE_CD = 2.0 m` — the height of the normal water surface
  above CD, bracketed 1.5–2.5 m against the CRI/UNB measured depth
  band (channel mostly 2–8 m) at the Westmorland thalweg (−5.5 rel
  CD); pinned at 2.0 pending the hydrometric gauge datum. Section
  shapes are independent of the constant; absolute depths shift
  uniformly with it (±0.5 m).
- CHS ATL 107 (Sailing Directions, ch. 6): chart datum at
  Fredericton is **0.9 m above Geodetic Datum**, so bed elevation
  geodetic = bed_elev_rel_cd − 0.9 m.

## Transect frame and outputs

Transects are sampled in the game's own frame, kept deliberately:
origin (45.96315, −66.64280), metres-per-degree at that latitude,
the pinned −35.936° grid rotation inverted; cross-channel position
`t` at a station comes from the game's shore table
(`fredericton_osm.json` → `river.shores` rows `[x, lo, hi]`), passed
to the script with `--shores`. Stations ride every 2nd shore row
(~300 m), keep ≥ 6 measured samples, and bin `t` into 21 bins;
empty bins are linearly interpolated and the end bins pinned to 0.0
(the waterline contract).

- `data/extracts/bathymetry/sections_relcd.csv` — raw portable
  samples: `game_x, game_z, t, bed_elev_rel_cd`. Verified
  byte-identical (md5) to the game's own
  `data/bathymetry/sections_relcd.csv` on its authoring run.
- `data/extracts/bathymetry/sections.csv` — per-station binned
  profiles: `game_x, n_measured, depth_t0.00 … depth_t1.00`
  (35 stations kept, 2,388 raw samples on the 2026-11-06 run).

## 2026-11-09: the west-reach shore fault (#480) and the guard

The 2026-11-06 sections carried a silent hole: stations at game_x
−3088, −2788, −2488 and −2188 were missing. Root cause was upstream
in the game's shore table, not in NONNA coverage: the import solver
that built `river.shores` (game `tools/osm_import.py`) lost the main
channel where the river bends south-west and splits around an
island west of downtown, and froze eight consecutive slices
(x −3238…−2188) on a 136 m side-channel band at z 196.9…333.1 while
the real channel runs at z ~660…1665 there. Transects along the fake
band sampled land, fell under the 6-sample keep rule, and dropped —
in both consumers, unnoticed. (In the game the same band also cut
the river itself off at altitude: TODO #480.)

Fix chain, per the fix-at-the-source ruling: the generator was
fixed in the game repo (`compute_shores` now resolves split channels
by crossing parity and island merging); the shipped table was
repaired against this repo's GeoNB LiDAR DTM
(`tools/repair_river_shores.py` in the game repo — DEM water-complex
span plus bank margins from healthy anchor slices, content-clipped
against buildings/streets; 12 slices, core coverage 0.00–0.76 →
0.92–1.00); and both consumers regenerated their sections from the
repaired table. The 2026-11-09 run keeps **39 stations, 2,848 raw
samples**, with the four west-reach stations restored
(81–105 measured points each).

`scripts/import_bathymetry.py` now runs a shore-table guard
(`check_shores`) on every import and warns on the fault's
signatures: adjacent-row band-centre jumps > 140 m, runs of ≥ 3
byte-identical rows (frozen band), and width collapse vs the
neighbour median. On the faulty table it fires exactly on the
#480 run; on the repaired table the remaining warnings are the
far-west table's genuine swings and one known sibling anomaly at
game_x 1561.6 (Nashwaak mouth), flagged for its own look.

## Reproduce

```sh
python3 scripts/import_bathymetry.py --shores /path/to/fredericton_osm.json
```

Re-running re-fetches the WCS subsets unless cached TIFFs are
present under `--cache`.
