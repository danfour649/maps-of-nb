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

## Reproduce

```sh
python3 scripts/import_bathymetry.py --shores /path/to/fredericton_osm.json
```

Re-running re-fetches the WCS subsets unless cached TIFFs are
present under `--cache`.

## In the viewer (2026-11-13)

- **Depth map, everywhere CHS has data:** the same GeoServer exposes the
  grids as WMS (`/geoserver/wms`, layers `nonna:NONNA 100` / `nonna:NONNA 10`,
  EPSG:3857, CORS open). It serves a pre-coloured picture (red = shallow,
  blue = deep) with no legend and no values — `GetFeatureInfo` returns the
  pixel's RGB, not a depth. The viewer draws NONNA 100 as the "Water depth"
  overlay.
- **Measured depths, Fredericton reach:** `scripts/bathymetry_to_geojson.py`
  turns `sections_relcd.csv` back into lon/lat points (the importer's own
  `game_to_geo`) with `d` = depth below the normal water surface and `bed` =
  elevation relative to Chart Datum, written to
  `web/public/bathymetry-fredericton.geojson` (2,388 points, generated — a
  test fails if it drifts from the CSV). Clicking the river with the overlay
  on reports the nearest sounding within 60 m. Depths carry the ±0.5 m
  datum uncertainty described above.

Licence: Open Government Licence – Canada; attribution to the Canadian
Hydrographic Service. Not to be used for navigation.
