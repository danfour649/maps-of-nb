# Pipelines (planned)

The PySpark stage of maps-of-nb: turn the raw GeoNB exports in
`data/game-exports/` into game-ready data for GTA Fredericton, replacing
the game's OpenStreetMap import. The full design — output shape, the
EPSG:2953 → game-grid reprojection, spatial joins (parcels ↔ buildings ↔
civic addresses) and validation — lives in
[docs/gta-fredericton-map-plan.md](../docs/gta-fredericton-map-plan.md).

Status: not yet built. The extractor (`scripts/extract_game_mesh.py`)
already produces the inputs city-wide (buildings with LiDAR heights,
roads with names/lanes/speed limits/one-ways, wetlands), and the web
viewer validates them visually before any game code touches them. Spark
runs in local mode at this scale; the jobs will be written to scale to
province-wide inputs unchanged.
