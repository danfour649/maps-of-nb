# maps-of-nb

[![CI](https://github.com/danfour649/maps-of-nb/actions/workflows/ci.yml/badge.svg)](https://github.com/danfour649/maps-of-nb/actions/workflows/ci.yml)

New Brunswick open geospatial data, organized for actual use: a catalogue of the
province's best open map data, small pipelines that pull it down and clean it up,
and analyses built on top of it.

**Live viewer:** https://maps-of-nb.vercel.app — Fredericton
on GeoNB's own imagery/topo basemaps (Vite + MapLibre; deliberately not Next.js).

Most of New Brunswick's authoritative map data is already open — GeoNB has been
giving it away for decades — but it's scattered across a data catalogue, ArcGIS
services, and download indexes. This repo is the working shelf where I keep it
straight.

## Why this exists

- **Ground truth for Fredericton.** The map in
  [GTA Fredericton](https://github.com/danfour649/GTAfredericton) is hand-built and
  it shows. High-resolution provincial imagery and elevation data give it
  something real to stand on.
- **NB Tech News background.** Half the tech stories in this province touch
  infrastructure, energy, or land. Having the data at hand beats guessing.
- **It's genuinely good data.** 0.15 m orthophotos, province-wide LiDAR, civic
  addresses, road networks — published by GeoNB under open terms.

## Data sources

Catalogued one file per source under [`data-sources/`](data-sources/), each with
what it is, where to get it, how to access it programmatically, licensing, and
what it's good for.

| # | Source | What it is |
|---|-------|------------|
| 001 | [GeoNB orthophotos](data-sources/001-geonb-orthophotos.md) | Aerial imagery of NB — latest contribution 13,000 km² at 0.15 m, flown summer 2025 |
| 002 | [GeoNB wetlands](data-sources/002-geonb-wetlands.md) | Regulated wetland polygons — game surface typing (soft/slow ground) |
| 003 | [GeoNB contours](data-sources/003-geonb-contours.md) | 10 m / 50 m elevation contours — slope/QA overlay (not a terrain source) |
| 004 | [Full-city extraction wave](data-sources/004-full-city-extraction-wave.md) | HRDEM gap fill, City layers, GeoNB property, Overture, GTFS, ECCC feeds — dated pull with manifest |

Also in active use via GeoNB's ArcGIS services: LiDAR-derived building
footprints with measured heights, the provincial road network (NBRN) with
names/lanes/speed limits, the official municipal boundaries, and the LiDAR
tile index. More catalogue entries to come: civic addresses, parcels, DTDB.

## Layout

- `data-sources/` — the catalogue, one markdown file per source
- `scripts/` — tools for querying/pulling the services, the game-mesh
  extractor, the OSM comparison and the PMTiles baker (stdlib-only except
  the baker — see `tools/requirements-bake.txt`)
- `data/extracts/` — manifest + stats for each dated full-city extraction wave
  (`scripts/extract_*.py`, see [docs/data-extracts.md](docs/data-extracts.md)); the raw
  extracts live on the fola boxes (and cloud storage), not in git
- `pipelines/` — the planned PySpark stage that turns the raw exports into
  game-ready data (see `pipelines/README.md`)
- `web/` — the Maps of NB viewer site (Vite + MapLibre + TypeScript,
  deployed on Vercel): Fredericton on GeoNB's own imagery and topo
  basemaps, baked vector tiles with a live-ArcGIS fallback, an OSM
  comparison overlay and a game-mesh explorer. Deliberately not Next.js.
- `tests/` — Python test suite (pytest) for the scripts and the bake
- `docs/` — the GTA Fredericton map plan, the OSM-vs-GeoNB overlap study and the
  full-city data-extract guide

## Development

```sh
# Python (extractor/compare are stdlib-only; the baker needs its venv)
python3 -m pytest tests/ -q            # or tools/.venv/bin/python -m pytest
tools/setup_bake_env.sh                # one-time: creates tools/.venv

# Web viewer
cd web
npm ci
npm test                               # build + build-output checks + unit tests
npm run test:e2e                       # headless render test (Playwright)
```

CI (GitHub Actions, `.github/workflows/ci.yml`) runs the Python suite with
coverage, ruff, the web build + unit tests and the render E2E on every PR.
The practices behind this are written down in
[docs/maintenance.md](docs/maintenance.md); contributions follow
[CONTRIBUTING.md](CONTRIBUTING.md).

## A note on licensing

The code in this repo is MIT (see [LICENSE](LICENSE)). The data itself stays under
its publishers' terms — GeoNB datasets are distributed under New Brunswick's open
data terms; check each catalogue entry. Nothing here redistributes provincial data
that isn't meant to be redistributed.

## Author

Dan Fitzgerald — Fredericton, NB. Software & data engineer; editor at
[NB Tech News](https://nbtechnews.ca).
