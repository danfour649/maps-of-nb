#!/usr/bin/env python3
"""Regenerate the Fredericton game boundary (data/game-exports/fredericton/
boundary_game.geojson) from the official municipal boundary.

The game works to an encompassing circle instead of the legal limit: the
official boundary slices the Saint John River west of downtown and its
annexation lobes read as choppy damage from the air. The circle (official
boundary's area centroid + farthest-vertex distance + 1.5 km margin, rounded
up to the next 500 m) fully encompasses the city, so nothing clipped to it
loses a river reach or a suburb. It is a working extent, NOT the legal
limit — the official polygon stays in boundary.geojson and keeps driving
the civic extracts and viewer totals. See data-sources/008-game-boundary.md.

Usage:
    python3 scripts/build_game_boundary.py [--out PATH]
"""
import argparse
import json
from pathlib import Path

import extract_common as ec


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ec.GAME_BOUNDARY_PATH))
    args = ap.parse_args()
    game = ec.game_boundary_from(ec.load_boundary())
    props = game["features"][0]["properties"]
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(game, indent=1) + "\n")
    print(f"game boundary: centre {props['centre']}, radius "
          f"{props['radius_m']:.0f} m -> {out}")


if __name__ == "__main__":
    main()
