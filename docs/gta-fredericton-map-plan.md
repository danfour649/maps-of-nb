# Plan — Rebuilding GTA Fredericton's maps from GeoNB data

Status: draft, 2026-10-18. The current GTA Fredericton map is hand-built and
Daniel calls it (correctly) weak. GeoNB publishes everything needed to rebuild
it on real geometry. All services below were verified live in the GeoNB ArcGIS
catalogue (https://geonb.snb.ca/arcgis/rest/services, 114 services) on
2026-10-18.

## Source layers (all GeoNB, all open)

| Layer | Service / product | Use in the game |
|-------|-------------------|-----------------|
| Building footprints | `GeoNB_SNB_Buildings` (MapServer) | Real building placement/scale instead of hand-placed blocks |
| Property parcels | `GeoNB_SNB_Parcels` | Lot lines, block structure, driveway/parking hints |
| Civic addresses | `GeoNB_DPS_Civic_Address` | Naming/numbering flavour, mission addresses |
| Road network | `GeoNB_Basemap_NBRN` + DTDB/ETB download | Street geometry to replace hand-drawn roads |
| Orthophotos | Source 001 (`GeoNB_Basemap_Imagery`, 0.15 m 2025) | Ground truth overlay for aligning everything; texture reference |
| Elevation / LiDAR | `GeoNB_SNB_LidarIndex` + GeoNB DTM | Supplements/replaces the current 30 m DEM (PR #195) at much higher fidelity |

## The swap strategy — same contract, better source

The game does not hand-build its city from nothing: `tools/osm_import.py`
imports OpenStreetMap into a data dictionary (streets, bridges), and
`city_map_prep.gd` runs a deterministic post-pass over it (bridge merging,
ramp-stub fixes) before `CityBuilder` meshes it. OSM is the weak link: spotty
building coverage, ways split at odd places, geometry that needs constant
patching.

So we do NOT rewrite the game. We replace the **import stage**: a PySpark
pipeline in this repo produces the same shaped output from GeoNB's
authoritative layers, and the game's existing post-pass and builder consume
it unchanged (or with less patching, because the source data is cleaner).

## Pipeline (PySpark, in this repo under `pipelines/`)

1. **Extract** — Query the Fredericton bounding box from each MapServer with
   `f=geojson` (ArcGIS REST supports GeoJSON output), or pull the DTDB/ETB
   tiles from the GeoNB Data Catalogue for the road network. Raw zone:
   `data/raw/` (gitignored, cached — be kind to GeoNB's servers).
2. **Transform (PySpark)** —
   - Reproject EPSG:2953 → the game's local grid (the -32.786° rotation and
     origin the DEM work already established), validated against the
     orthophoto layer in the web viewer before anything ships to the game.
   - Roads: build the drivable graph from the NB Road Network — official
     names, real classifications — replacing OSM ways.
   - Buildings: LiDAR-complete footprints from `GeoNB_SNB_Buildings`, with
     per-building height = `max_b_elev - min_g_elev` (the same attributes the
     website's 3D layer uses). Thin/aggregate sheds and outbuildings so the
     engine isn't meshing every garden shed in Fredericton.
   - Spatial joins (parcels ↔ buildings ↔ civic addresses) for block
     structure and address flavour.
3. **Publish** — Emit game-ready JSON in the shapes CityBuilder already loads
   (streets/bridges dictionary, building list with footprint + height),
   versioned under `data/game-exports/`. Several Fredericton cuts from the
   same run: downtown core, full city, northside-inclusive — "a number of
   new maps", not one.
4. **Game side** — `osm_import.py` gains a sibling `geonb_import` path (or
   the export drops in as its input); the map post-pass stays, the gameplay
   layer (props, missions, dressing) is untouched. Ship behind a flag, drive
   test, then make it the default.

## Elevation — not an afterthought

The game's current terrain is itself an ad hoc open-data pull: GTA PR #195
vendored a 30 m DEM (open elevation data) into
`data/elevation/fredericton_dem.json` and re-based `terrain_height.gd` on it.
It works, but 30 m cells are why streets float and buildings sit wrong on
slopes.

The pipeline replaces it properly, through the same heightmap contract:
`GeoNB_SNB_LidarIndex` layer `lidar_index_2024` lists **nine 1 km LAZ tiles**
covering the downtown pilot bbox (20 pulses/m², LAS 1.4, vertical datum
CGVD2013), each with a direct download URL — the extractor writes them to
`lidar_tiles.json`. Ground-classified returns rasterize to a ~1 m DTM;
sampled onto the game's grid, that's a drop-in `fredericton_dem.json`
successor at ~30x the resolution. The web explorer previews relief with
public terrarium tiles (the same class of open data as PR #195); the game
gets the LiDAR DTM.

## Order of work

1. Buildings + roads extract for the downtown bbox; render an overlay on the
   Maps of NB site against the orthophotos to eyeball alignment.
2. Game-grid export for the downtown cut; load in GTA Fredericton behind a
   flag; drive test.
3. Widen to full city; add parcels/addresses flavour; LiDAR-grade elevation
   pass if the 30 m DEM still feels coarse in play.

## Notes

- Respect GeoNB's servers: cache extracts locally, query off-peak for bulk
  pulls, no hammering the export endpoint.
- Data stays under GeoNB's terms; the repo ships code and derived game data,
  not raw provincial datasets.

## Viewer loading: quick wins shipped, PMTiles next

Diagnosis (2026-10-18): GeoNB caps responses at 1,000-2,000 features and
flags overflow with `exceededTransferLimit`; the viewer ignored the flag
(a zoom-13 city view holds ~18k buildings but drew ~2k), re-fetched whole
viewports on every pan with no reuse, and contour generation on GeoNB's
side can take ~30 s cold. Shipped quick wins: paged fetching until the
flag clears, a per-layer grid-cell cache (0.02 deg cells) so revisited
areas cost no requests, and stale-load discard on rapid pans. Planned
next: bake buildings/roads/wetlands/contours into a static PMTiles
archive from the exports and stream tiles instead of querying ArcGIS at
runtime (ArcGIS stays the source for refreshes and the OSM compare).
