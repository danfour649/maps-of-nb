# LiDAR → DTM pipeline

Turns GeoNB 2024 LiDAR tiles ([data-sources/004](../data-sources/004-geonb-lidar.md))
into 1 m digital terrain models for Fredericton. Script:
[`scripts/lidar_to_dtm.py`](../scripts/lidar_to_dtm.py).

## Method

1. **No re-classification.** GeoNB delivers the tiles fully classified,
   so the pipeline rasterizes the delivered classes directly:
   **ground (2) + water (9)**. Water is included so the Saint John River
   surface stays continuous at water level instead of becoming a hole
   that interpolation would fill with bank heights.
2. **Binning.** Points are binned into a 1 m grid aligned to each tile's
   kilometre bounds (EPSG:2953); each cell takes the mean of its returns.
3. **Hole fill.** Cells with no ground/water returns (building
   footprints, dense canopy, shore edges) are filled by
   nearest-neighbour (Euclidean distance transform). Per-tile filled-cell
   counts are recorded in the run stats — downtown tiles run roughly
   130k–490k filled cells out of 1M (13–49%), highest where the river
   and the downtown core leave few ground returns per cell at 1 m.
4. **Outputs per tile:** `<tile>_dtm.tif` (float32, DEFLATE, nodata
   -9999 — none remains after fill). Per run: a VRT mosaic translated to
   a single GeoTIFF, a GDAL hillshade, and `run_stats.json` (point and
   class counts, elevation range, filled cells, per-tile seconds).

## Environment

Runs on **fola4.1** (Ryzen 5700X) — the data drive there holds the LAZ
cache and rasters; nothing this size goes through git or GitHub. Tools:
Python venv with laspy[lazrs] + rasterio + scipy, GDAL 3.12 CLI for
mosaic/hillshade. (Ubuntu 26.04 no longer packages PDAL; the laspy route
replaced it — one less moving part, and fast enough: ~2–5 s per tile.)

Data layout on fola4.1 (`/mnt/folaDriveB/lidar/`):

- `pilot/` + `pilot_dtm/` — the 9 downtown pilot tiles and their DTMs
- `city_laz/` + `city_dtm/` — the full 414-tile Fredericton set

## Runs

### 2026-10-20 — downtown pilot (9 tiles)

The 3x3 tile block over downtown Fredericton from the pilot manifest.
Per tile (points used = ground+water returns):

| Tile | Points used / total | Filled cells | Elev range (m) | Time |
|---|---|---|---|---|
| 2488000_7439000 | 23,322,638 / 56,538,883 | 225,591 | 6.41–48.17 | 4.7 s |
| 2488000_7440000 | 19,614,816 / 40,510,878 | 186,771 | 0.33–14.27 | 3.5 s |
| 2488000_7441000 | 19,514,623 / 43,151,105 | 129,083 | 0.29–31.11 | 3.6 s |
| 2489000_7439000 | 17,822,753 / 44,487,423 | 419,048 | 0.25–14.61 | 3.6 s |
| 2489000_7440000 | 11,670,775 / 21,261,505 | 233,097 | 0.28–11.11 | 1.9 s |
| 2489000_7441000 | 27,497,711 / 56,545,271 | 163,395 | 0.33–44.67 | 4.8 s |
| 2490000_7439000 | 10,346,410 / 25,533,508 | 488,595 | 0.30–13.29 | 2.1 s |
| 2490000_7440000 | 19,310,389 / 38,231,975 | 224,304 | 0.26–24.35 | 3.3 s |
| 2490000_7441000 | 20,334,070 / 40,668,619 | 159,695 | 6.22–57.58 | 3.5 s |

Mosaic: 3000 x 3000 at 1 m, EPSG:2953, min 0.25 m / max 57.58 m /
mean 11.01 m. Verification: `gdalinfo` bounds land exactly on the
downtown bbox (66°39′W–66°37′W, 45°57′–45°58′N); a rendered preview
shows the Saint John River bend, both bridge crossings, the south-side
street grid, and the north-bank rise — the terrain reads as Fredericton
at a glance. Elevation ranges match expectations (river surface ~0.3 m,
downtown plateau and College Hill slopes to ~58 m).

### 2026-10-20 — full city (414 tiles)

All 414 tiles intersecting the city boundary, from the Fredericton
manifest. Downloads ran 05:58–07:00 ADT (four parallel `wget -c`
streams); processing ran 07:12–08:41 ADT.

| | |
|---|---|
| Tiles processed | 414 / 414 (no per-tile errors) |
| LAZ cache | 166 GB |
| Points, total | 26,312,804,684 |
| Points used (ground + water) | 4,412,095,424 |
| Cells filled by interpolation | 84,220,643 (of 414M — mostly river surface, shore, and dense-canopy tiles) |
| Processing time | 5,462 s summed per-tile (~89 min wall, single process) |
| Mosaic | `fredericton_dtm_1m.tif` — 23,000 x 18,000 (23 km x 18 km), EPSG:2953, x 2477000–2500000, y 7433000–7451000, 898 MB |
| Mosaic elevation | min 0.23 m / max 190.40 m / mean 77.67 m |
| Hillshade | `fredericton_dtm_1m_hillshade.tif`, 288 MB |
| Total raster output | 2.1 GB (per-tile DTMs + mosaic + hillshade) |

Elevation range checks out against the geography: river surface ~0.2 m
at the city's east end, and the 190 m max sits in the high ground west
of the city (Keswick Ridge side), not on any rooftop — building points
are class 6 and never enter the raster.

**Run-record honesty note:** the driver's first attempt halted between
download and processing at a size-verification step. Verifying against
this server is awkward: GeoNB returns **403 to Python-urllib HEAD**
requests and a **bogus constant Content-Length (5,572) to curl HEAD**,
while GET downloads work fine. Sizes were spot-checked from a second
machine (exact matches), and the real integrity check is structural —
the pipeline decompresses and reads every point of every tile, so a
truncated or corrupt LAZ fails loudly as a per-tile error, of which
there were none. A future driver should verify by LAS header point
counts instead of HTTP HEAD.

## Next steps

- Sample the city DTM onto the GTA heightmap contract
  (`fredericton_dem.json` successor) per the
  [map plan](gta-fredericton-map-plan.md), then the scripted drive
  checks (Rookwood flat, Smythe hill, downtown) against the 30 m DEM.
- Publish a hillshade/elevation layer into the maps-of-nb viewer tiles.
- Re-run when the GeoNB 2025 index gains Fredericton coverage.
