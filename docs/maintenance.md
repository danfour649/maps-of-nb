# Maintenance & QA practices

How this repo stays trustworthy as it grows. The short version: anything
that can break silently has a test, every PR runs the whole gate, and
generated data is reproducible from a script, never hand-edited.

## Testing pyramid

| Layer | Where | What it proves |
|---|---|---|
| Unit (Python) | `tests/test_extract_game_mesh.py`, `tests/test_compare_osm_geonb.py` | Geometry helpers (point-in-polygon, anchors, distance/matching math) and the extractor's grid paging: dedupe, boundary clip, and that dead GeoNB pages are bisected/skipped rather than fatal. Network is stubbed — these never touch GeoNB. |
| Unit (web) | `web/test/geo.test.ts` (vitest) | The viewer's pure geo helpers (`web/src/geo.ts`): feature dedupe keys, Overpass→GeoJSON conversion, centroid + match-percentage math. |
| Build-output | `web/test/build.test.mjs` (node:test) | The production build is servable: bundle referenced from index.html, and the MapLibre worker file present and untruncated (regression guard for the silent blank-layers bug of 2026-10-18). |
| Integration | `tests/test_bake_tiles.py` | The full bake: synthetic GeoJSON in → PMTiles archive out → header/layers/features decoded and checked. |
| E2E render | `web/test/render.e2e.mjs` (Playwright) | The built site actually draws: serves `dist/` with real GeoNB fixtures stubbed at the network edge, opens game-mesh mode, asserts features render and no page errors occur. Has a negative control (removing the worker file makes it fail). |

Rules of thumb:
- A bug that shipped gets a regression test in the same PR that fixes it.
- Tests that need the network are not tests; stub at the boundary.
- Flaky = broken. Fix or quarantine with an issue, never normalize retries.

## CI

`.github/workflows/ci.yml` runs on every push and PR, two jobs:

- **python:** ruff → pytest with coverage (bake deps from
  `tools/requirements-bake.txt`).
- **web:** `npm ci` → `npm test` (tsc build + build-output + vitest) →
  `npm run test:e2e` (headless Chrome via `@puppeteer/browsers`, build
  pinned in the test script).

Both jobs must be green to merge. CI uses the same commands documented
in the README — no CI-only magic.

## Dependencies

- Core Python tools are **stdlib-only** (a deliberate constraint: the
  extractor runs anywhere Python does, including the game's machines).
- The baker's deps are pinned (`tools/requirements-bake.txt`) and live in
  a gitignored venv (`tools/.venv`).
- Web deps are locked (`web/package-lock.json`); CI installs with `npm ci`.
- Dependabot (`.github/dependabot.yml`) watches npm, pip and
  GitHub Actions weekly. Review bumps like any other PR.

## Data & release process

1. Refresh exports: `python3 scripts/extract_game_mesh.py --city "The City of Fredericton" --out data/game-exports/fredericton` (small artifacts — stats, boundary, manifests — are committed; the big GeoJSONs are gitignored and archived to the project Drive folder).
2. Bake: `tools/.venv/bin/python scripts/bake_tiles.py` → `tiles/fredericton.pmtiles`.
3. Verify the archive locally (bake round-trip test + header check) and swap it into `web/public/fredericton.pmtiles`; also attach it to a `tiles-vN` GitHub release as the downloadable copy.
4. Deploy is Vercel-on-push; verify the live bundle hash changed and the archive answers a range request before calling it done.

## Repo organization

- `data-sources/` is the catalogue of record — one numbered file per
  source, with access method and licensing.
- `scripts/` are CLIs with `__main__` guards so tests can import them.
- One concern per PR; docs land in the same PR as the change they describe.
