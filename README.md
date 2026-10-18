# maps-of-nb

New Brunswick open geospatial data, organized for actual use: a catalogue of the
province's best open map data, small pipelines that pull it down and clean it up,
and analyses built on top of it.

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

More to come: LiDAR / elevation, the NB road network, civic addresses, and the
Digital Topographic Database.

## Layout

- `data-sources/` — the catalogue, one markdown file per source
- `scripts/` — small tools for querying and pulling the services
- `web/` — the Maps of NB viewer site (Vite + MapLibre, deployed on Vercel):
  Fredericton on GeoNB's own imagery and topo basemaps, with an
  imagery-year overlay. Deliberately not Next.js.
- `analyses/` — notebooks and write-ups built on the data (coming)

## A note on licensing

The code in this repo is MIT (see [LICENSE](LICENSE)). The data itself stays under
its publishers' terms — GeoNB datasets are distributed under New Brunswick's open
data terms; check each catalogue entry. Nothing here redistributes provincial data
that isn't meant to be redistributed.

## Author

Dan Fitzgerald — Fredericton, NB. Software & data engineer; editor at
[NB Tech News](https://nbtechnews.ca).
