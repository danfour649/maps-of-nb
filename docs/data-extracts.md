# Full-city data extracts

A dated, re-runnable pull of every open source GTA Fredericton wants beyond what it already uses
(OSM game extract, GeoNB buildings, NBRN roads, the 1 m LiDAR DTM mosaic, the municipal boundary).
Source selection and licence notes come from the data-sources sweep (entry IDs `A1`…`D1` below); each
extractor prints its source URL, licence, timestamp and record count and writes a `_source.json` next to
the data, from which `MANIFEST.md` is built.

**Where things live**

- Scripts + the manifest + the small stats files: this repo (`scripts/extract_*.py`,
  `data/extracts/<date>/`).
- The raw extracts (≈195 MB for the 2026-10-24 wave, one sub-folder per source): the fola boxes, at
  `/mnt/folaDriveB/maps-of-nb-extracts/<date>/` on fola4.1, and the cloud archives
  `maps-of-nb-extracts-<date>` on Google Drive, Box and Dropbox. Large rasters never go in git
  (`*.tif` is ignored), so the repo carries only scripts, manifest and stats.
- Committed for 2026-10-24: [`data/extracts/2026-10-24/MANIFEST.md`](../data/extracts/2026-10-24/MANIFEST.md)
  (+ `MANIFEST.json`) and `hrdem2018_seam_stats.json`.

## What was pulled (2026-10-24)

| ID | Source | Script | Notes |
|---|---|---|---|
| C1 | NRCan HRDEM 2018 1 m DTM, clipped to the southern gap + seam stats | `extract_hrdem_gap.py` | 22.74 km² gap, 100 % covered; GeoTIFF is EPSG:2953, 1 m, on the mosaic grid |
| A1 | City Street CenterLines | `extract_arcgis_layers.py` | 3,425 segments |
| A2 | City Civic Addresses | ″ | 25,108 points (GeoJSON + CSV) |
| A3 | City Tree Inventory | ″ | 21,186 trees (GeoJSON + CSV) |
| A5/A6 | Zoning, Parks, Trails, Recreation Amenities, Neighbourhoods | ″ | one GeoJSON per layer |
| B3/B4/B5 | GeoNB PAN, Parcels, Civic Addresses | ″ | clipped to the city boundary |
| B8 | GeoNB 2018 flood extents | ″ | as published |
| A4 | Fredericton Transit GTFS | `extract_gtfs.py` | raw zip, untouched |
| D1 | Overture infrastructure + places | `extract_overture.py` | GeoParquet + GeoJSON per class |
| C4 | ECCC live feeds | `extract_eccc_samples.py` | endpoints + one timestamped sample each |

Deferred on purpose: the 125 GB city photogrammetry mesh (licence unverified) and the ~92 GB GeoNB
orthophoto set — both are listed in the manifest.

**Licences differ per source** and are recorded per source in the manifest. GeoNB is OGL-NB, NRCan is
OGL-Canada-2.0, Overture is per-row (ODbL for OSM-derived rows). The City of Fredericton layers and the
transit feed carry **no stated licence**: confirm terms with the publisher before shipping them in a
distributed build.

## Re-running

```sh
# everything, into a dated folder, then MANIFEST.md
python3 scripts/run_extract_wave.py --out /mnt/folaDriveB/maps-of-nb-extracts/$(date +%F)

# one source at a time
python3 scripts/extract_arcgis_layers.py --out OUT --only A1,A3,B3
python3 scripts/extract_gtfs.py --out OUT
python3 scripts/extract_eccc_samples.py --out OUT
python3 scripts/extract_hrdem_gap.py --out OUT --mosaic /path/to/fredericton_dtm_1m.tif
uv run scripts/extract_overture.py --out OUT          # supplies duckdb itself
python3 scripts/build_extract_manifest.py --out OUT --repo-out data/extracts/<date>
```

Requirements: Python ≥ 3.11 and `curl` for everything except `extract_hrdem_gap.py` (GDAL Python
bindings + numpy) and `extract_overture.py` (`uv`, which installs `duckdb`). Each script exits non-zero
if its source failed; `run_extract_wave.py` carries on past a failed source and records it.

## Gotchas found while building this

- `GeoNB_DPS_Civic_Address` rejects spatial queries (HTTP 400) and returns made-up counts, so B5 is
  tiled with a latitude/longitude `WHERE` instead of a geometry filter.
- Paged GeoNB queries on PAN/Parcels silently miss ~20 rows per ~30k; the extractor compares against the
  server's `returnIdsOnly` list and fetches the missing OIDs by `objectIds`.
- The OID field is read from layer metadata. `extract_game_mesh.py` orders buildings on `OBJECTID_1`,
  which is wrong for layers whose key field is `OBJECTID`.
- GeoNB's chunked responses truncate under `urllib`; all fetching goes through `curl`.
