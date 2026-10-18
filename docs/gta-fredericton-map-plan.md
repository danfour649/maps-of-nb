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

## Pipeline sketch

1. **Extract** — Query the Fredericton bounding box from each MapServer with
   `f=geojson` (ArcGIS REST supports GeoJSON output), or pull the DTDB/ETB
   tiles from the GeoNB Data Catalogue for the road network. Everything lands
   in `data/raw/` (gitignored).
2. **Reproject** — EPSG:2953 (NB Double Stereographic) → the game's local grid.
   The game already re-derived its -32.786° grid rotation from Queen St OSM
   geometry; the same transform approach applies, with the orthophoto layer as
   the alignment check.
3. **Simplify for the engine** — Buildings/roads are far denser than a game map
   wants. Aggregate parcels to blocks, keep landmark buildings, thin the road
   graph to drivable streets, bake a static JSON the Godot side can load next
   to the existing DEM heightmap format.
4. **Candidate maps** — produce several Fredericton variants from the same data
   (downtown core cut, full-city cut, northside-inclusive cut) so Daniel can
   pick the playable one — "a number of new maps", not one.

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
