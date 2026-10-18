# 001 — GeoNB Orthophotos (New Brunswick aerial imagery)

**Publisher:** GeoNB / Service New Brunswick
**Status:** First source catalogued in this repo (2026-10-18)

## What it is

Orthorectified aerial photography covering New Brunswick, distributed by GeoNB.
New Brunswick has contributed its orthophoto datasets to Esri Canada's Community
Maps program for years; the latest contribution adds **13,000 km² at 0.15 m
resolution, collected during the summer of 2025** — sharp enough to read
individual buildings, road markings, and driveways.

## Access routes

1. **GeoNB Data Catalogue** — tile-by-tile download of the imagery:
   https://www.gnb.ca/en/campaign/geonb.html (Data Catalogue)
2. **GeoNB ArcGIS services** — REST directory (114 services, live-checked
   2026-10-18): https://geonb.snb.ca/arcgis/rest/services
   Imagery-related services found there:
   - `GeoNB_Basemap_Imagery` — the provincial imagery basemap
   - `GeoNB_SNB_ImageryYear` — which year of imagery covers a given spot
   - `GeoNB_SNB_ImageIndex` — index of available image tiles
   - `GeoNB_SNB_LidarIndex` — the companion LiDAR tile index (future source)
   - Folder `GeoNB_Imagery_NBSD/` — per-year imagery MapServers (2014, 2015, …)
3. **Esri basemaps** — the contributed imagery is also baked into Esri's imagery
   basemaps via the Community Maps program, so it shows up anywhere Esri
   basemaps are offered.

## Technical notes

- Native CRS for NB provincial data is **NAD83(CSRS) / NB Double Stereographic
  (EPSG:2953)** — reprojection needed before mixing with WGS84 (EPSG:4326) data.
- Older provincial orthophoto sets were 1 m (and 4 m in some tiff products); the
  2025 contribution at 0.15 m is a big step up — check `GeoNB_SNB_ImageryYear`
  before assuming a given tile is the new stuff.
- See `../scripts/list_geonb_services.py` to enumerate the live service
  catalogue yourself.

## What it's good for (here)

- **GTA Fredericton:** ground truth for street alignment, building footprints,
  and waterfront edges in the hand-built map — the current map's weakest spots.
  0.15 m imagery makes discrepancies between the game map and reality obvious.
- Reference for any Fredericton / NB mapping analysis in this repo.
- Visual cross-check against OpenStreetMap geometry before trusting it.

## Provenance

Catalogued after GeoNB's announcement of the 2025 contribution
(LinkedIn, Bernie J. Connors / GeoNB, Oct 2026): https://lnkd.in/p/gYvb5vWn
