"""Integration test: bake a tiny synthetic city and read the archive back.

Skips when the bake dependencies (shapely/pmtiles/...) are not installed;
CI installs them from tools/requirements-bake.txt.
"""
import gzip
import json

import pytest

pytest.importorskip("shapely")
pytest.importorskip("pmtiles")
pytest.importorskip("mapbox_vector_tile")

from conftest import load_script  # noqa: E402

bake = load_script("bake_tiles")


def _square(x, y, s=0.002):
    return [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]


def _write_fc(path, feats):
    path.write_text(json.dumps({"type": "FeatureCollection", "features": feats}))


def test_bake_roundtrip(tmp_path):
    exports = tmp_path / "exports"
    exports.mkdir()
    _write_fc(exports / "buildings.geojson", [
        {"type": "Feature",
         "geometry": {"type": "Polygon", "coordinates": [_square(-66.64, 45.96)]},
         "properties": {"min_g_elev": 5.0, "max_b_elev": 12.5}},
        {"type": "Feature",
         "geometry": {"type": "Polygon", "coordinates": [_square(-66.63, 45.97)]},
         "properties": {"min_g_elev": 3.0, "max_b_elev": 8.0}},
    ])
    _write_fc(exports / "roads.geojson", [
        {"type": "Feature",
         "geometry": {"type": "LineString", "coordinates": [[-66.64, 45.96], [-66.63, 45.97]]},
         "properties": {"Number_Of_Lanes": 2}},
    ])
    _write_fc(exports / "wetlands.geojson", [
        {"type": "Feature",
         "geometry": {"type": "Polygon", "coordinates": [_square(-66.65, 45.95)]},
         "properties": {"WETLAND_CLASS": "Marsh"}},
    ])
    out = tmp_path / "out.pmtiles"
    bake.bake(exports, out)
    assert out.stat().st_size > 1000

    import mapbox_vector_tile
    import mercantile
    from pmtiles.reader import MmapSource, Reader

    with open(out, "rb") as f:
        reader = Reader(MmapSource(f))
        header = reader.header()
        assert header["min_zoom"] == 10 and header["max_zoom"] == 16
        tile = mercantile.tile(-66.64, 45.962, 14)
        data = reader.get(tile.z, tile.x, tile.y)
        assert data is not None
        layers = mapbox_vector_tile.decode(gzip.decompress(data))
        assert "buildings" in layers and len(layers["buildings"]["features"]) >= 1
        props = layers["buildings"]["features"][0]["properties"]
        assert props["max_b_elev"] == pytest.approx(12.5)
