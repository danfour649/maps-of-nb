# 004 — Full-city extraction wave (HRDEM, City of Fredericton, GeoNB property, Overture, GTFS, ECCC)

**Publishers:** NRCan (CanElevation), City of Fredericton, GeoNB / SNB, Overture Maps Foundation,
Fredericton Transit, Environment and Climate Change Canada
**Status:** Pulled 2026-10-24 — raw data on the fola boxes + cloud archive, manifest in `data/extracts/2026-10-24/`

## What it is

Ten source groups (16 layers and feeds) pulled in one dated, re-runnable wave for the GTA Fredericton whole-city build:

- **C1** NRCan HRDEM 2018 1 m DTM (COG) clipped to the 22.74 km² southern gap in the city LiDAR mosaic,
  with seam statistics against the existing mosaic (median |Δ| 0.07 m).
- **A1–A3, A5, A6** City layers: Street CenterLines, Civic Addresses, Tree Inventory, Zoning, Parks,
  Trails, Recreation Amenities, Neighbourhoods.
- **B3, B4, B5, B8** GeoNB property assessment (PAN), parcels, provincial civic addresses and the 2018
  flood extents.
- **A4** Fredericton Transit static GTFS, archived untouched.
- **D1** Overture infrastructure (crossings, lamps, signals, bus stops, benches, …) and places.
- **C4** ECCC live river/weather endpoints with one timestamped sample each.

The IDs follow the data-sources sweep. Access routes, fields, counts and the per-source licence are in
[`data/extracts/2026-10-24/MANIFEST.md`](../data/extracts/2026-10-24/MANIFEST.md).

## Licensing in one line each

GeoNB: OGL – New Brunswick. NRCan HRDEM: OGL-Canada-2.0. Overture: per row (ODbL for OSM-derived
rows, CDLA-Permissive/Apache/CC0 for most place sources). **City of Fredericton layers and the transit
feed state no licence** — get terms in writing before shipping them. ECCC licence text was not read.

## How to run it

[`docs/data-extracts.md`](../docs/data-extracts.md) — scripts, requirements, where the raw data lives.
