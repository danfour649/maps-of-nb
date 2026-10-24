# Full-city extraction wave - 2026-10-24

Output folder: `/mnt/folaDriveB/maps-of-nb-extracts/2026-10-24` on `Fola4.1`. Built by `scripts/build_extract_manifest.py` from the per-source `_source.json` files; checksums re-verified at build time.

16 sources, 35 files, 187.3 MB total.

| Source | Records | Bytes | Status |
|---|---|---|---|
| A1 City of Fredericton Street CenterLines | 3425 | 2.8 MB | ok |
| A2 City of Fredericton Civic Addresses | 25108 | 14.2 MB | ok |
| A3 City of Fredericton Tree Inventory | 21186 | 7.9 MB | ok |
| A4 Fredericton Transit GTFS (static) - raw zip as published | trips 660, stops 426, routes 18, shapes_rows 11569, stop_times 26984 | 349.9 KB | ok |
| A5 City of Fredericton Zoning (By-law Z-5) | 1201 | 3.5 MB | ok |
| A6-nbhd City of Fredericton Neighbourhoods | 74 | 377.0 KB | ok |
| A6-parks City of Fredericton Parks (public view) | 225 | 560.5 KB | ok |
| A6-rec City of Fredericton Recreation Amenities | 295 | 218.0 KB | ok |
| A6-trails City of Fredericton Trails | 524 | 687.3 KB | ok |
| B3 GeoNB Property Assessment (PAN) parcels | 23823 | 15.7 MB | ok |
| B4 GeoNB Parcels (lot lines) | 25518 | 17.4 MB | ok |
| B5 GeoNB provincial Civic Addresses (E911) | 25297 | 24.7 MB | ok |
| B8 GeoNB 2018 Flood Extents - Lower Saint John River | 243 | 15.3 MB | ok |
| C1 NRCan HRDEM 2018 1 m DTM - southern gap clip + seam stats | 22741969 | 73.8 MB | ok |
| C4 ECCC live feeds (MSC GeoMet): endpoints + one sample pull each | 6/6 feeds sampled | 123.9 KB | ok |
| D1 Overture Maps 2026-10-21.0 - infrastructure + places (city bbox) | infrastructure 10154, pedestrian_crossings 2119, street_lamps 448, traffic_signals 107, bus_stops 276, benches 270, places 4739, places_with_name 4739 | 9.8 MB | ok |

## A1 - City of Fredericton Street CenterLines

- **Source:** https://services2.arcgis.com/iLWAxhpxafhOza2U/arcgis/rest/services/Street_CenterLines/FeatureServer/15
- **Licence:** None stated by the publisher (City of Fredericton Open Data; DCAT/Hub licence field empty). Confirm terms in writing with opendata@fredericton.ca before shipping in a distributed build.
- **Pulled at:** 2026-10-24T07:38:15Z
- **Folder:** `A1-street-centerlines/`
- **Records:** 3425
- **Notes:** layer 'StreetCenterLines', geometry esriGeometryPolyline, OID field OBJECTID

| File | Bytes | sha256 |
|---|---|---|
| `street_centerlines.geojson` | 2,893,935 | `0fbecc87e4a07d797659fc6fa91a3f04f477a2a6f4a4b631a6d518428c4fd081` |

## A2 - City of Fredericton Civic Addresses

- **Source:** https://services2.arcgis.com/iLWAxhpxafhOza2U/arcgis/rest/services/Civic_Addresses/FeatureServer/16
- **Licence:** None stated by the publisher (City of Fredericton Open Data; DCAT/Hub licence field empty). Confirm terms in writing with opendata@fredericton.ca before shipping in a distributed build.
- **Pulled at:** 2026-10-24T07:38:24Z
- **Folder:** `A2-civic-addresses/`
- **Records:** 25108
- **Notes:** layer 'Geocoded_Civics', geometry esriGeometryPoint, OID field OBJECTID

| File | Bytes | sha256 |
|---|---|---|
| `civic_addresses.geojson` | 10,888,507 | `cedba7c3b1f27a66f358cd074fe486814e6a0b41f4d36ebd13c3690804096d54` |
| `civic_addresses.csv` | 4,008,417 | `81939218d92fdbbcc8da327038722b010cae92eb739672f4dcf3bd106ec61bcf` |

## A3 - City of Fredericton Tree Inventory

- **Source:** https://services2.arcgis.com/iLWAxhpxafhOza2U/arcgis/rest/services/Tree_Inventory/FeatureServer/37
- **Licence:** None stated by the publisher (City of Fredericton Open Data; DCAT/Hub licence field empty). Confirm terms in writing with opendata@fredericton.ca before shipping in a distributed build.
- **Pulled at:** 2026-10-24T07:38:33Z
- **Folder:** `A3-tree-inventory/`
- **Records:** 21186
- **Notes:** layer 'TreeInventory', geometry esriGeometryPoint, OID field OBJECTID

| File | Bytes | sha256 |
|---|---|---|
| `tree_inventory.geojson` | 5,940,812 | `ed36d7e77ba07dfce830f82c94b12f1ebb881b545d6e6ac8c8afe93dd315a8d1` |
| `tree_inventory.csv` | 2,370,592 | `adacd4f2ca04f9cce976c19237de635ddd46a6c25d49d09730e9ddcb31fe9fae` |

## A4 - Fredericton Transit GTFS (static) - raw zip as published

- **Source:** https://fredericton.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/gtfs.zip
- **Licence:** No licence or terms of use in the feed or on the publisher's page (Fredericton Transit / Consat tmix export). Treat as unverified; confirm with Fredericton Transit before redistributing.
- **Pulled at:** 2026-10-24T07:39:39Z
- **Folder:** `A4-fredericton-transit-gtfs/`
- **Records:** {"trips": 660, "stops": 426, "routes": 18, "shapes_rows": 11569, "stop_times": 26984}
- **Notes:** Archived untouched; summary below is read-only metadata. No GTFS-Realtime found.

| File | Bytes | sha256 |
|---|---|---|
| `gtfs.zip` | 358,264 | `3fd9090e82a1d5ba97efccd4768d7431d70036e22714133cffe067e099ce458b` |

## A5 - City of Fredericton Zoning (By-law Z-5)

- **Source:** https://services2.arcgis.com/iLWAxhpxafhOza2U/arcgis/rest/services/Zoning/FeatureServer/0
- **Licence:** None stated by the publisher (City of Fredericton Open Data; DCAT/Hub licence field empty). Confirm terms in writing with opendata@fredericton.ca before shipping in a distributed build.
- **Pulled at:** 2026-10-24T07:38:34Z
- **Folder:** `A5-zoning/`
- **Records:** 1201
- **Notes:** layer 'Z5', geometry esriGeometryPolygon, OID field OBJECTID

| File | Bytes | sha256 |
|---|---|---|
| `zoning.geojson` | 3,662,191 | `e235adb05e8f295038e42fc41e9699c262f6e5eb612b30d6691cdd8b64f90e40` |

## A6-nbhd - City of Fredericton Neighbourhoods

- **Source:** https://services2.arcgis.com/iLWAxhpxafhOza2U/arcgis/rest/services/Neighbourhoods/FeatureServer/0
- **Licence:** None stated by the publisher (City of Fredericton Open Data; DCAT/Hub licence field empty). Confirm terms in writing with opendata@fredericton.ca before shipping in a distributed build.
- **Pulled at:** 2026-10-24T07:38:41Z
- **Folder:** `A6-neighbourhoods/`
- **Records:** 74
- **Notes:** layer 'Neighbourhoods', geometry esriGeometryPolygon, OID field OBJECTID

| File | Bytes | sha256 |
|---|---|---|
| `neighbourhoods.geojson` | 386,077 | `6971c3d165079e82dd0c4f054471bc27377436af0acea0d63dbe040ff4c145fb` |

## A6-parks - City of Fredericton Parks (public view)

- **Source:** https://services2.arcgis.com/iLWAxhpxafhOza2U/arcgis/rest/services/Parks_Public_View/FeatureServer/0
- **Licence:** None stated by the publisher (City of Fredericton Open Data; DCAT/Hub licence field empty). Confirm terms in writing with opendata@fredericton.ca before shipping in a distributed build.
- **Pulled at:** 2026-10-24T07:38:36Z
- **Folder:** `A6-parks/`
- **Records:** 225
- **Notes:** layer 'Parks', geometry esriGeometryPolygon, OID field OBJECTID

| File | Bytes | sha256 |
|---|---|---|
| `parks.geojson` | 573,992 | `142aaa772e102000728afd385b73500e8a9f590e72acdc7853fd4c8d7d47cf1b` |

## A6-rec - City of Fredericton Recreation Amenities

- **Source:** https://services2.arcgis.com/iLWAxhpxafhOza2U/arcgis/rest/services/Recreation_Amenities_view/FeatureServer/0
- **Licence:** None stated by the publisher (City of Fredericton Open Data; DCAT/Hub licence field empty). Confirm terms in writing with opendata@fredericton.ca before shipping in a distributed build.
- **Pulled at:** 2026-10-24T07:38:39Z
- **Folder:** `A6-recreation-amenities/`
- **Records:** 295
- **Notes:** layer 'Recreation Amenities', geometry esriGeometryPoint, OID field OBJECTID

| File | Bytes | sha256 |
|---|---|---|
| `recreation_amenities.geojson` | 223,196 | `6507186ad1765537722c50e2329d4fe84e75b395083c2c6b456de93002984157` |

## A6-trails - City of Fredericton Trails

- **Source:** https://services2.arcgis.com/iLWAxhpxafhOza2U/arcgis/rest/services/City_of_Fredericton_Trails/FeatureServer/68
- **Licence:** None stated by the publisher (City of Fredericton Open Data; DCAT/Hub licence field empty). Confirm terms in writing with opendata@fredericton.ca before shipping in a distributed build.
- **Pulled at:** 2026-10-24T07:38:37Z
- **Folder:** `A6-trails/`
- **Records:** 524
- **Notes:** layer 'TrailsForRecApp', geometry esriGeometryPolyline, OID field OBJECTID

| File | Bytes | sha256 |
|---|---|---|
| `trails.geojson` | 703,832 | `5a11d9ba29a13ccd2a9c7d7fa6a323ab22bea324b83457cbaefa6c4de462dfe7` |

## B3 - GeoNB Property Assessment (PAN) parcels

- **Source:** https://geonb.snb.ca/arcgis/rest/services/GeoNB_SNB_Pan/MapServer/0
- **Licence:** Open Government Licence - New Brunswick. Attribution: 'Contains information licensed under the Open Government Licence – New Brunswick.'
- **Pulled at:** 2026-10-24T07:46:02Z
- **Folder:** `B3-geonb-pan/`
- **Records:** 23823
- **Notes:** layer 'PAN', geometry esriGeometryPolygon, OID field OBJECTID; 31360 unique features in the city bbox (-66.7867, 45.8467, -66.5122, 46.0505) (server count 31359); 23823 kept after clipping to the city boundary polygon; server OID list for the bbox: 31359; recovered 18 rows missed by paging via objectIds; 0 unrecoverable; 1 more than the server OID list (features touching tile edges; harmless)

| File | Bytes | sha256 |
|---|---|---|
| `pan.geojson` | 16,454,904 | `636666aa361374077287d8b6206f0bd5bb1304c320fd0e954228daa3178e43b6` |

## B4 - GeoNB Parcels (lot lines)

- **Source:** https://geonb.snb.ca/arcgis/rest/services/GeoNB_SNB_Parcels/MapServer/0
- **Licence:** Open Government Licence - New Brunswick. Attribution: 'Contains information licensed under the Open Government Licence – New Brunswick.'
- **Pulled at:** 2026-10-24T07:46:51Z
- **Folder:** `B4-geonb-parcels/`
- **Records:** 25518
- **Notes:** layer 'parcels', geometry esriGeometryPolygon, OID field OBJECTID; 33744 unique features in the city bbox (-66.7867, 45.8467, -66.5122, 46.0505) (server count 33743); 25518 kept after clipping to the city boundary polygon; server OID list for the bbox: 33743; recovered 22 rows missed by paging via objectIds; 0 unrecoverable; 1 more than the server OID list (features touching tile edges; harmless)

| File | Bytes | sha256 |
|---|---|---|
| `parcels.geojson` | 18,204,806 | `7c87d2fde2c2536f42710d61a2edc43b7f14aa515b57504b95ff770475af0d15` |

## B5 - GeoNB provincial Civic Addresses (E911)

- **Source:** https://geonb.snb.ca/arcgis/rest/services/GeoNB_DPS_Civic_Address/MapServer/0
- **Licence:** Open Government Licence - New Brunswick. Attribution: 'Contains information licensed under the Open Government Licence – New Brunswick.'
- **Pulled at:** 2026-10-24T07:45:07Z
- **Folder:** `B5-geonb-civic-addresses/`
- **Records:** 25297
- **Notes:** layer 'Civic_Addresses', geometry esriGeometryPoint, OID field OBJECTID; 32153 unique features in the city bbox (-66.7867, 45.8467, -66.5122, 46.0505) (attribute-window query; server counts unreliable); 25297 kept after clipping to the city boundary polygon; server OID list for the bbox: 32153; recovered 0 rows missed by paging via objectIds; 0 unrecoverable

| File | Bytes | sha256 |
|---|---|---|
| `civic_addresses_geonb.geojson` | 18,982,455 | `fea24bcc8edabe24142174e694824999f03020a1efb55653a52cf602cf39b3c3` |
| `civic_addresses_geonb.csv` | 6,955,549 | `1ac342e97bf0256cd992bc5be33a2c723e7e749c46a553d649d4ebdf2a2c55cc` |

## B8 - GeoNB 2018 Flood Extents - Lower Saint John River

- **Source:** https://geonb.snb.ca/arcgis/rest/services/GeoNB_ENV_Flood/MapServer/7
- **Licence:** Open Government Licence - New Brunswick. Attribution: 'Contains information licensed under the Open Government Licence – New Brunswick.'
- **Pulled at:** 2026-10-24T07:42:08Z
- **Folder:** `B8-geonb-flood-2018/`
- **Records:** 243
- **Notes:** layer '2018 Flood Extents – Lower Saint John River', geometry esriGeometryPolygon, OID field OBJECTID_12; 243 unique features in the city bbox (-66.7867, 45.8467, -66.5122, 46.0505) (server count 243); all kept unclipped (as published); server OID list for the bbox: 243; recovered 0 rows missed by paging via objectIds; 0 unrecoverable

| File | Bytes | sha256 |
|---|---|---|
| `flood_extent_2018.geojson` | 16,049,805 | `73eba9fa47976a2893aae18235a8ba31454a1ffa731533bb300a2eed377432f8` |

## C1 - NRCan HRDEM 2018 1 m DTM - southern gap clip + seam stats

- **Source:** https://canelevation-dem.s3.ca-central-1.amazonaws.com/hrdem-lidar/NB-ERD_2018_aoi1-1m-dtm.tif
- **Licence:** OGL-Canada-2.0 (Open Government Licence - Canada 2.0), per the STAC collection 'license' field
- **Pulled at:** 2026-10-24T07:35:33Z
- **Folder:** `C1-nrcan-hrdem-2018/`
- **Records:** 22741969
- **Notes:** records = 1 m pixels with data inside the 22.74 km² gap; coverage 100.0%. STAC item NB-ERD_2018_aoi1-1m (acquired 2018-08-25). Large raster: kept out of git.

| File | Bytes | sha256 |
|---|---|---|
| `hrdem2018_dtm_gap_epsg2953_1m.tif` | 77,232,320 | `8d40172538b398edc7de593424fc45456b82370c8373e953b00c972cb966c69b` |
| `gap_strip_epsg2953.gpkg` | 143,360 | `3b4301e1d3c9e27a9418a56668ec98e8bc21eb24f6b532f55e6d133009730057` |
| `hrdem2018_seam_stats.json` | 7,172 | `44caec0f71063d6c40a67b4d2608934b4b153f2218cdc8856a4c370ba9616504` |
| `stac_item.json` | 4,016 | `82777e4fa32277fb9a41d6106a5dc50a8d6db175eca5d24c6dd9dcf9c20ec002` |

## C4 - ECCC live feeds (MSC GeoMet): endpoints + one sample pull each

- **Source:** https://api.weather.gc.ca
- **Licence:** Not verified. ECCC/MSC open data is published under the Open Government Licence - Canada, but the licence text for these API collections was not read in the data-sources sweep; confirm before shipping.
- **Pulled at:** 2026-10-24T07:39:37Z
- **Folder:** `C4-eccc-live/`
- **Records:** 6/6 feeds sampled
- **Notes:** Live feeds, no bulk data. Sample pulls are timestamped (UTC) in their filenames.

| File | Bytes | sha256 |
|---|---|---|
| `endpoints.json` | 2,146 | `e9ef06244d6dc7166f5adf8e4d9b750f122b1bee81af3fb17bc011c1d6af6638` |
| `samples/hydrometric_station_20261024T073936Z.json` | 3,155 | `8a7bc11315a48341d2f65cfbab597c4ad9e910b08b7f1ed7d34db8d0a88c72e3` |
| `samples/hydrometric_realtime_20261024T073937Z.json` | 6,976 | `93fc3e913ad37efb5299636b776b8fcbe94ccd255bce736aafc512e92320d244` |
| `samples/hydrometric_annual_peaks_20261024T073937Z.json` | 48,819 | `4d12f94acfa41a57495041419b3870e8985ae8b4f6adfb95216e324df81d549c` |
| `samples/swob_realtime_20261024T073937Z.json` | 30,317 | `8e219213a9c7ca13c5f923f17e1d6964f4b90014f0c8c81c0da6641d889de9ca` |
| `samples/citypageweather_realtime_20261024T073937Z.json` | 32,631 | `5df8be75cd7e7102ddde40191f9478736597570a7841309c17e215b05177bef3` |
| `samples/aqhi_observations_realtime_20261024T073937Z.json` | 2,812 | `d0c9d64d273b367d8648521a934f1a3ce47f2275512ff9dd1676e8e0388d6c58` |

## D1 - Overture Maps 2026-10-21.0 - infrastructure + places (city bbox)

- **Source:** s3://overturemaps-us-west-2/release/2026-10-21.0/theme=base/type=infrastructure/ and theme=places/type=place/
- **Licence:** Mixed per row (see `sources`): places mostly CDLA-Permissive-2.0 (Foursquare: Apache-2.0, AllThePlaces: CC0); infrastructure is OSM-derived, ODbL 1.0 - credit '© OpenStreetMap contributors, Overture Maps Foundation'.
- **Pulled at:** 2026-10-24T07:40:50Z
- **Folder:** `D1-overture/`
- **Records:** {"infrastructure": 10154, "pedestrian_crossings": 2119, "street_lamps": 448, "traffic_signals": 107, "bus_stops": 276, "benches": 270, "places": 4739, "places_with_name": 4739}
- **Notes:** bbox W,S,E,N = -66.7867,45.8467,-66.5122,46.0505 (bounding box of the city boundary, not clipped to the polygon). Parquet keeps every Overture column; GeoJSON flattens nested columns to JSON.

| File | Bytes | sha256 |
|---|---|---|
| `infrastructure.parquet` | 942,747 | `882e536fd5c38f55bf78990ff5905dc3e1a5886cab7094bd07513cf49de4dc42` |
| `pedestrian_crossings.geojson` | 1,444,014 | `1f25e9a017bc7233532ebb5699e4cf274dc7be8c019bcb79e645bdc720aac1b0` |
| `street_lamps.geojson` | 296,321 | `de94e16d3fa790b99a2107655e7b87fa3d6493b7bdc62840407810e335344c38` |
| `traffic_signals.geojson` | 74,034 | `244afae94cdb44c4f16241e3c6a9ec9d408a22fc2b1f7bb67d157e8abb5204b2` |
| `bus_stops.geojson` | 201,122 | `376e9f542102ebdcda5ab8405063ac1a25b9b7f339f143bdbaaa811916609008` |
| `benches.geojson` | 173,991 | `21d117623357d9821d3e8bcea8fe3393410a948468b6de9c23baf572a838445a` |
| `places.parquet` | 602,653 | `cae2a3999df687da034d0874e125ce518ec6f24f878a54fd7d454bb1761c974e` |
| `places.geojson` | 6,529,064 | `f3d734c9f810a1e71c423aa9ef7ab0841287e81b501d726f7ca1561a8da3e2f1` |

## Deferred (not extracted)

- **City of Fredericton 2023 3D photogrammetry mesh (EagleView, ArcGIS SceneServer `3D_View_Fredericton`)** - 125.8 GB. Licence unverified (no licence stated; third-party vendor product) - not extracted.
- **GeoNB 2023 7.5 cm orthophotos (`GeoNB_SNB_ImageIndex`, 624 one-km tiles)** - ~92 GB for the whole city. Out of scope for this wave; pull windows on demand via the GeoNB export service.

## Re-running

See `docs/data-extracts.md` in the maps-of-nb repo; `scripts/run_extract_wave.py --out <dir>` runs every extractor and rebuilds this manifest.
