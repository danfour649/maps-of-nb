# 004 — GeoNB LiDAR (2024)

**Publisher:** GeoNB / Service New Brunswick
**Service:** `GeoNB_SNB_LidarIndex` (ArcGIS REST, geonb.snb.ca/arcgis), layer 11 (`lidar_index_2024`); tiles served as direct downloads under `geonb.snb.ca/downloads2/lidar/2024/laz/`
**Status:** Wired in 2026-10-20 — Fredericton pilot + full-city DTM built (see [docs/lidar-pipeline.md](../docs/lidar-pipeline.md))

## What it is

Airborne LiDAR over New Brunswick, tiled at 1 km x 1 km in NB
Stereographic (EPSG:2953), vertical datum **CGVD2013**:

- **20 pulses/m²**, LAS 1.4, point format 6, 0.01 m coordinate scales
- **Fully classified** on delivery — a typical Fredericton tile carries
  ground (2), low/medium/high vegetation (3/4/5), buildings (6), water
  (9), plus small noise classes (7/18). Roughly a third of a downtown
  tile's ~21M points are ground returns, which is plenty for a 1 m DTM
  with no re-classification step.
- Tile files are large: ~150–475 MB of LAZ each. The 414 tiles that
  intersect the Fredericton city boundary total roughly 100 GB, so the
  LAZ cache lives on a data drive, never in git. The repo carries the
  tile manifests (`data/game-exports/*/lidar_tiles.json`), the pipeline
  script, and the run records.
- The 2025 index (layer 12) has no Fredericton coverage yet; the 2024
  index is the current source for the city.

## Role

This is **the terrain source** for everything downstream:

- The 1 m DTM built from it ([lidar pipeline](../docs/lidar-pipeline.md))
  succeeds the ad hoc 30 m DEM vendored into GTA Fredericton by PR #195,
  sampled through the same heightmap contract described in the
  [map plan](gta-fredericton-map-plan.md).
- The same DTM feeds maps-of-nb elevation products (hillshade today;
  contours and slope QA against [003 contours](003-geonb-contours.md)
  are natural follow-ons).
- Building heights in the game exports already come from LiDAR-derived
  GeoNB building attributes; the raw point cloud additionally allows an
  nDSM (surface minus ground) if a future export needs measured heights
  instead of attributes.
