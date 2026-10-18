# Contributing

This repo is a working data shelf, not a dump: every change should leave
the catalogue, the pipelines or the viewer measurably better, and keep
the test suites green.

## Setup

- Python 3.11+ — the extractor and comparison tools are **stdlib-only**
  by design; keep them that way. The tile baker has its own pinned
  environment: `tools/setup_bake_env.sh`.
- Node 20+ for the viewer: `cd web && npm ci`.

## Before you open a PR

```sh
python3 -m pytest tests/ -q        # python suite (bake tests skip without the venv deps)
ruff check scripts/ tests/         # lint (config in pyproject.toml)
cd web && npm test                 # tsc build + build-output checks + unit tests
npm run test:e2e                   # headless render test when touching the viewer
```

- New pure logic goes in a testable home: Python helpers in the scripts
  get pytest coverage; viewer logic that doesn't need the map belongs in
  `web/src/geo.ts` (vitest), not inline in `main.ts`.
- Data-source additions get a numbered entry in `data-sources/`.
- Big generated files don't go in git: full-city GeoJSON exports and
  `.pmtiles` build outputs are gitignored; the deployed tiles archive is
  the one deliberate exception (`web/public/fredericton.pmtiles`), and
  cutting it is a release step — see `docs/maintenance.md`.

## Pull requests

- One concern per PR; describe what changed, how you verified it, and
  anything you deliberately left out.
- CI must be green. If a check is flaky, fix the flake or say so in the
  PR — don't retry until it passes and move on.
