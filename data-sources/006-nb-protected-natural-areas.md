# 006 — Protected Natural Areas, Crown land and ecological regions

**Publisher:** NB Department of Natural Resources and Energy Development
**Server:** `gis-erd-der.gnb.ca/arcgis/rest/services/PNAs` (ArcGIS REST 10.91, CORS open)
**Status:** Wired in 2026-11-13 — province-wide viewer layers, search and popups

This is the server behind the province's own "Explore New Brunswick's
Protected Natural Areas" viewer. It is a different host from GeoNB
(`geonb.snb.ca`), so `scripts/list_geonb_services.py` does not list it.

## What it is

| Service / layer | Geometry | Count (2026-11-13) | Fields used |
|---|---|---|---|
| `PNA_Map_Viewer/MapServer/1` — Class I PNA | polygon | 6 | `NAME`, `NOM`, `CLASS`, `HECTARES`, `OWNER`, `IUCN_CATEGORY`, `MANAGED_BY`, `YEAR_PROTECTED`, `YEAR_AMENDED` |
| `PNA_Map_Viewer/MapServer/3` — Class II PNA | polygon | 202 | same |
| `PNA_Map_Viewer/MapServer/5` — Eco Districts | polygon | 199 | `DISTRICT_NAME_NOM`, `REGION_NAME`, `REGION_NOM` |
| `PNA_Map_Viewer/MapServer/6` — Eco Regions | polygon | 7 | `REGION`, `REGION_NAME`, `REGION_NOM` |
| `Crown_Lands/MapServer/0` — Crown Lands | polygon | 9,731 | `HOLDER` (undocumented integer code) |

208 protected areas, 273,642 ha in total. Class I is access-restricted
(permit only); Class II allows low-impact recreation.

## Quirks worth knowing

- **Each class is published twice.** Layers 1/2 and 3/4 are the same
  class split by scale range (above/below 1:145,000), which is why the
  provincial viewer's layer list shows every class twice. Query 1 and 3
  only; together they hold each area exactly once. Layer 0 "Outline" has
  all 208 but lacks hectares and ownership.
- **`OWNER` packs both languages into one string** (`English/Français`)
  and carries a typo for every Crown-owned area: `Crown/Corounne`.
  `web/src/pna.ts` splits and repairs it.
- **`YEAR_AMENDED` is `0`, not null,** for areas never expanded.
- **Layer 7 "PNA Centroids" errors on count queries** (HTTP 200 with an
  error body). Label points are computed client-side instead.
- **Ecodistricts have `minScale` 1:500,000** in the map service, so the
  provincial viewer shows nothing when the layer is toggled at province
  scale. Feature queries ignore scale ranges; the viewer draws them at
  every zoom.
- **Crown `HOLDER` codes have no published domain** (the coded-value
  domain maps each number to itself). The viewer reports Crown / not
  Crown and shows the raw code without interpreting it.
- Native spatial reference is EPSG:2953 (NB Stereographic) for the PNA
  service and 3857 for Crown lands; ask for `outSR=4326`.
- `maxRecordCount` is 1,000; overflow is flagged with
  `exceededTransferLimit` like GeoNB. Pagination is supported.

## How the viewer uses it

- PNAs, ecoregions and ecodistricts are small enough to fetch once,
  province-wide, as simplified GeoJSON (`maxAllowableOffset` 0.0001° for
  PNAs, 0.0005° for the ecological layers) — roughly 200 kB gzipped for
  the PNA set. No tiling, and the same payload is the search index.
- Crown land is 9,731 polygons, so it draws as server-rendered export
  tiles at every zoom and answers clicks with a point query.
- Data is fetched live on first use; the panel shows the count, total
  hectares and retrieval date. Nothing from this server is committed to
  the repo apart from four trimmed test fixtures in `web/test/fixtures/`.

## Licensing

No licence statement is published on the service itself (the map
document's own metadata reads "Test Service for PNA Map Viewer"). It is
public, unauthenticated and backs a public government viewer; treat it
like other GNB open data, attribute NB Natural Resources, and do not
redistribute bulk copies until the terms are confirmed.
