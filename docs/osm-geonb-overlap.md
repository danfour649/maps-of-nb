# OSM vs GeoNB: how much do they actually overlap?

GTA Fredericton was built from OpenStreetMap. maps-of-nb is building the
replacement from GeoNB. This is the head-to-head for the downtown pilot tile
(bbox -66.652, 45.955, -66.628, 45.970), measured 2026-10-18 with
`scripts/compare_osm_geonb.py` (OSM via Overpass, GeoNB via
`scripts/extract_game_mesh.py`). The web viewer has the same comparison
live: "Overlay OpenStreetMap" draws GeoNB in blue and OSM in orange for any
viewport, with the match figure computed on the spot.

## Buildings

| | count |
|---|---|
| GeoNB (LiDAR-derived footprints) | 1,227 |
| OpenStreetMap | 1,075 |

- **85%** of GeoNB buildings have an OSM building within 15 m
  (**95%** within 25 m); the other way, 91% / 94%.
- Median positional offset of matched buildings: **3.3 m** — the two
  sources agree on where buildings are; they are not two different cities.
- The gap is coverage and attributes, not alignment: GeoNB sees ~150
  more structures downtown (small sheds, garages, newer builds the LiDAR
  caught), and carries a **measured height for every building**.
- OSM heights downtown: 29 buildings have a real `height` tag and 550
  carry a `building:levels` estimate — usable for rough massing, not for
  seating buildings on terrain.

## Roads

| | segments/ways | length | named | lanes | speed limits |
|---|---|---|---|---|---|
| GeoNB NBRN | 219 | 28.1 km | 219/219 (official names) | 219/219 | 219/219 |
| OSM `highway=*` | 1,252 | 120.2 km | 194/1,252 | ~0 | n/a |

- Raw counts mislead: most OSM "ways" downtown are footways (498),
  service drives (381), steps and paths. OSM's drivable classes total
  53.0 km against GeoNB's 28.1 km network — the difference is driveways
  and parking aisles OSM maps and the provincial network doesn't.
- OSM carries **62 km of paths, footways and cycleways** in the tile that
  NBRN doesn't have at all. For trails, GeoNB publishes separate trail
  data and the City of Fredericton open-data portal has a Trails layer.
- Street-name sets look disjoint (13 exact matches of 45 GeoNB / 70 OSM)
  mostly because of conventions: OSM tags include French type prefixes
  ("Allée Camperdown Lane", "Avenue University Avenue") where GeoNB uses
  one official `Formatted_Street_Name`, and OSM names things the road
  network doesn't carry (Bill Thorpe Walking Bridge, Crosstown Trail).
  The streets themselves are the same streets.
- GeoNB also carries one-way direction (`Dir_of_Traffic_Flow`),
  functional class, paved status and address ranges per segment — the
  attributes a traffic/game layer actually wants, none of which OSM
  tags consistently here.

## Verdict for the game

Geometry: the sources agree (3.3 m median). Switching the import to
GeoNB loses almost nothing the game uses today and gains measured
building heights, complete official street names, lane counts, speed
limits and one-ways. What OSM keeps that GeoNB's road network lacks —
trails and footpaths — can come from GeoNB's trail layers or the City
of Fredericton's open data instead.

## Other layers worth importing

Already in GeoNB's 114-service catalogue (geonb.snb.ca/arcgis):
parcels (GeoNB_SNB_Parcels), civic addresses (GeoNB_DPS_Civic_Address),
1 m contours (GeoNB_SNB_Contours), wetlands, flood hazard + historical
floods, forest/ Crown land, electoral and health boundaries, imagery
year index and the LiDAR index the terrain stage uses.

City of Fredericton open data (data.fredericton.ca, 132 datasets):
zoning, trails, storm and sanitary sewers, street lights, city facilities
(pools, rinks, fields), crime by neighbourhood, census demographics,
and the city's own municipal boundary.

Beyond that: OpenStreetMap itself stays useful for POIs and trails;
Statistics Canada census geography and CanVec (NRCan) cover the
province at coarser fidelity where GeoNB has gaps.
