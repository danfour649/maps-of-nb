"""Soundings converter: game-frame CSV rows -> lon/lat GeoJSON points."""
import csv
import json
import math
from pathlib import Path

from conftest import load_script

imp = load_script("import_bathymetry")
conv = load_script("bathymetry_to_geojson")
ROOT = Path(__file__).resolve().parent.parent


def test_origin_maps_to_the_game_origin():
    lat, lon = imp.game_to_geo(0.0, 0.0)
    assert (lat, lon) == (imp.ORIGIN_LAT, imp.ORIGIN_LON)


def test_frame_preserves_distance_from_origin():
    # a pure rotation: 1 km in the game frame is ~1 km on the ground
    lat, lon = imp.game_to_geo(600.0, -800.0)
    dy = (lat - imp.ORIGIN_LAT) * imp.M_LAT
    dx = (lon - imp.ORIGIN_LON) * imp.M_LON
    assert math.isclose(math.hypot(dx, dy), 1000.0, rel_tol=1e-9)


def test_depth_uses_the_importer_datum_and_dedupes():
    rows = [
        {"game_x": "0", "game_z": "0", "t": "0.5", "bed_elev_rel_cd": "-5.5"},
        {"game_x": "0", "game_z": "0", "t": "0.5", "bed_elev_rel_cd": "-9.9"},  # same spot: dropped
        {"game_x": "300", "game_z": "40", "t": "0.2", "bed_elev_rel_cd": "0.25"},
    ]
    feats = conv.to_features(rows)
    assert len(feats) == 2
    assert feats[0]["geometry"]["coordinates"] == [round(imp.ORIGIN_LON, 5), round(imp.ORIGIN_LAT, 5)]
    assert feats[0]["properties"] == {"d": imp.SURFACE_ABOVE_CD + 5.5, "bed": -5.5}
    assert feats[1]["properties"]["d"] == round(imp.SURFACE_ABOVE_CD - 0.25, 2)


def test_committed_viewer_file_matches_the_committed_extract():
    """web/public/bathymetry-fredericton.geojson is generated, never hand-edited."""
    with (ROOT / "data/extracts/bathymetry/sections_relcd.csv").open() as f:
        expected = conv.to_features(csv.DictReader(f))
    shipped = json.loads((ROOT / "web/public/bathymetry-fredericton.geojson").read_text())["features"]
    assert shipped == expected
    lons = [f["geometry"]["coordinates"][0] for f in shipped]
    lats = [f["geometry"]["coordinates"][1] for f in shipped]
    # every sounding sits in the reach the importer fetched (transects start
    # 40 m outside each shore, so allow a couple of hundred metres of slack)
    pad = 0.003
    assert imp.REACH_LON[0] - pad <= min(lons) and max(lons) <= imp.REACH_LON[1] + pad
    assert imp.REACH_LAT[0] - pad <= min(lats) and max(lats) <= imp.REACH_LAT[1] + pad
