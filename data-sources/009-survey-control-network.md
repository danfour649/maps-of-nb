# 009 — GeoNB Survey Control Network (NB Control Survey System)

**Publisher:** GeoNB / Service New Brunswick (Land Registry / geodetic services)
**Server:** `geonb.snb.ca/arcgis/rest/services/GeoNB_SNB_SurveyControlNetwork`
**Status:** Wired in 2026-11-13 — viewer layer "Survey control monuments"
(Property & boundaries panel) with click identify; nothing committed, queried
live like the rest of the catalogue. Source viewer:
https://geonb.snb.ca/surveycontrol/index.html

## Layers

| Layer | Network | What it holds |
|---|---|---|
| 0 | High Precision Network / Réseau à grande précision | Modern geodetic stations: `Mon`, `Name` (e.g. "ACS FREDERICTON"), NAD83 (CSRS) lat/long + grid coords (`E83CS`/`N83CS`), ellipsoid height `ElHt`, orthometric height `OrthoHt`, levelling height `LevHt`, `Order_`, `class`, `Status`, `DateInsp`, sketch/photo refs (`sketchNum`/`picNum`) |
| 1 | Conventional Network / Réseau conventionnel | The classic monument network: `Mon`, adjusted grid coords (`E83adj`/`N83adj`), `Elev`, `Ecode`, `Qual`, `Status`, `class`, field-sketch ref (`sketch`, e.g. "MAP098/MON00241") |

This is the published form of the **New Brunswick Control Survey System** —
the province-wide framework of brass-marked concrete monuments (planned at
~28,000 points) that every NB survey, parcel fabric and map hangs off.

## Fredericton counts (2026-11-13, live, intersects)

| | Inside the legal city limit | Inside the game circle (008) |
|---|---|---|
| High Precision Network | 4 | 8 |
| Conventional Network | 710 | 1,156 |

## Quirks

- **The two layers name the same facts differently** (`OrthoHt`/`LevHt` vs
  `Elev`; `E83CS` vs `E83adj`). `web/src/survey.ts` normalises both into one
  record; the popup shows height, CSRS grid coordinates, status, order/class,
  last inspection (HPN) and sketch reference for the nearest monument within
  120 m of the click.
- `LevHt` arrives as a **string** on some HPN records and null on others;
  `OrthoHt` wins when both exist.
- Conventional `Status` is often `UNKNOWN` and `DatePub` can predate the
  epoch conventions used elsewhere — the viewer only surfaces `DateInsp`,
  and only from the HPN layer.
- Display is the service's own rendered export (catalogue raster overlay,
  minzoom 11); identify is a ±90 m envelope query + nearest-point pick,
  because a raw point query against point layers effectively never hits.
- The service's own scale limits leave a province-wide view empty (HPN
  draws from 1:3.5M, Conventional from 1:50k), so the viewer also carries
  two static assets built by `scripts/build_survey_assets.py` from
  GeoNB's published CSV download (`downloads/hpn_current/nbcontrol.zip`):
  `web/public/survey-monuments.json` — every located monument (25,890 of
  26,286 records; 396 publish no coordinates) as [lng, lat, destroyed]
  triples, drawn as dots below z15 — and `web/public/nb-boundary.geojson`,
  the provincial outline (union of the twelve Regional Service Commission
  polygons from GeoNB_ELG_Local_Governance, generalised). While the
  survey layer is on, the province outline replaces the Fredericton city
  outline; the monument download is also the source of the McFam
  Monument Hunt lists.
