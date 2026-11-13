# 007 — GeoNB property, imagery by year, LiDAR elevation, flood and governance

**Publisher:** GeoNB / Service New Brunswick (flood and governance layers: GNB Environment and Local Government)
**Servers:** `geonb.snb.ca/arcgis/rest/services` (map services) and
`geonb.snb.ca/image/rest/services` (image services — a separate catalogue that
`scripts/list_geonb_services.py` does not list)
**Status:** Wired in 2026-11-13 — viewer layers, identify, search and elevation profile

These are the services behind the province's GeoNB Map Viewer. Everything
here is queried live; nothing is committed.

## Property

| Service | What it holds | Notes |
|---|---|---|
| `GeoNB_SNB_Parcels/MapServer/0` | Parcel polygons: `PID`, `PID_INT`, `COUNTY`, `Titles_Status` | Draws below 1:40,000 only |
| `GeoNB_SNB_Pan/MapServer/0` | Assessment polygons: `Pan`, `Location`, `Descript`, `TA_Desc`, `Assess_Yr`, `Assess_Val`, `Tax_Levy`, `Trans_Date`, `Sale_Val` | Draws below 1:64,000 |
| `GeoNB_DPS_Civic_Address/MapServer/0` | Civic address points with `PID` | Not wired; the geocoder covers address search |

Quirks:
- **Money is stored as strings** (`Assess_Val: "439500"`, `Tax_Levy: "8140.86"`);
  `Sale_Val` is a number. `web/src/property.ts` normalises them.
- **`Trans_Date` is a month/day/year string** (`"7/9/2019"`), not an epoch.
- **`Sale_Val` is not always a plausible price** — e.g. PAN 00887339 (a house
  and lot assessed at $439,500) reports 10,003,000. The viewer shows what the
  service returns; treat last-transfer values as indicative.
- One click can hit more than one assessment polygon (stacked accounts);
  the popup lists up to four.
- A PID and a PAN are different numbers for the same land. Search accepts
  either (`PID 01460625`, `PAN 887339`, or a bare number tried as both).

## Imagery by year (`/image/.../Imagery/*`, ImageServer)

Seventeen services, 2014–2025, 1.5–20 cm, each covering only the area flown
that year. `web/src/catalog.ts` (`VINTAGES`) carries the list with each
service's extent projected to lat/long on 2026-11-13. Fredericton is covered
by `NB_2023` (7.5 cm), `Fredericton_2020` (5 cm), `SNB_2024` (15 cm) and
`NB_2015`; `NB_2022_Hurricane_Fiona` is the post-storm east-coast flight.
`HighResolution_Imagery` is the province-wide best-available mosaic.

Extents are bounding boxes, not footprints: a year can be blank inside its
box (`NB_2017` is scattered blocks). The drone services (`NB_2024_Drone`,
`NB_DroneImagery_2025`) are small sites and are not listed in the viewer.

## LiDAR elevation (`/image/.../Elevation/*`, 1 m)

`DEM_Raw` (bare-earth elevation, float32), `DSM_Raw` (first-return surface),
multi-directional hillshades of each, a coloured shaded relief, slope
(degrees and percent) and aspect. The viewer draws the two hillshades, the
coloured relief and slope, and reads `DEM_Raw` through `getSamples`
(multipoint, POST) for the popup's elevation and the measure tool's profile.

No 1 m contour service is published on either server — only the 10 m / 50 m
lines in `GeoNB_SNB_Contours`. The province's viewer must draw its 1 m
contours from somewhere else; not found yet.

`identify` on these services returns `NoData` at points where `getSamples`
returns a value; use `getSamples`.

## Flood, wetlands, governance, roads (map services)

- `GeoNB_ENV_Flood`: layer 2 flood hazard areas (1-in-20, 1-in-100, flood
  envelope), layers 3/4/5/7 the 1973, 2008 and 2018 Saint John River flood
  extents. This is the real flood mapping; the Map Viewer's "Flood
  Information" layer only links out to it. Depth rasters also exist under
  `/image/.../Flood/*` (not wired).
- `GeoNB_ENV_Wetlands`: layer 1 Provincially Significant Wetlands, layer 0
  the 30 m regulatory buffer (layer 2, all wetlands, is entry 002).
- `GeoNB_ELG_Local_Governance`: local governments (layer 8), rural districts
  (5), regional service commissions (2), January 2023 reform boundaries.
  This replaces the retired `GeoNB_ELG_MunicipalAreas2`.
- `GeoNB_Basemap_NBRN`: road network with names, drawn transparent over
  imagery as a hybrid overlay. `GeoNB_Basemap_Grey`: grey basemap.

## Access pattern

All of it is server-rendered: `MapServer/export` and `ImageServer/exportImage`
accept `bboxSR=3857`, so the native EPSG:2953 never reaches the client.
Image services are requested as 512 px tiles to quarter the request count.
Both servers send `Access-Control-Allow-Origin`.

## Licensing

GeoNB data is published under New Brunswick's open data terms. Assessment
and last-transfer values are public record published by Service New
Brunswick; the viewer shows them per click and stores nothing.
