"""Unit tests for the GeoNB extractor's pure helpers + paged grid queries."""


from conftest import load_script

ex = load_script("extract_game_mesh")

SQUARE = [[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0], [0.0, 0.0]]
HOLE = [[4.0, 4.0], [6.0, 4.0], [6.0, 6.0], [4.0, 6.0], [4.0, 4.0]]


class TestPointInRings:
    def test_inside_and_outside(self):
        assert ex.point_in_rings(5, 5, [SQUARE]) is True
        assert ex.point_in_rings(15, 5, [SQUARE]) is False
        assert ex.point_in_rings(-1, -1, [SQUARE]) is False

    def test_hole_excludes(self):
        assert ex.point_in_rings(5, 5, [SQUARE, HOLE]) is False
        assert ex.point_in_rings(2, 2, [SQUARE, HOLE]) is True


class TestFeatureAnchor:
    def test_polygon_centroid(self):
        g = {"type": "Polygon", "coordinates": [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]]}
        assert ex.feature_anchor(g) == (1.6, 1.6)  # closing point counted, as designed

    def test_linestring_middle_vertex(self):
        g = {"type": "LineString", "coordinates": [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]]}
        assert ex.feature_anchor(g) == (2, 2)

    def test_point(self):
        assert ex.feature_anchor({"type": "Point", "coordinates": [7, 8]}) == (7, 8)


def _feature(oid, x, y):
    return {
        "type": "Feature",
        "geometry": {"type": "Polygon", "coordinates": [[[x, y], [x + 0.001, y], [x + 0.001, y + 0.001], [x, y + 0.001], [x, y]]]},
        "properties": {"OBJECTID": oid},
    }


class TestGridQueryAll:
    def test_paging_dedupe_and_clip(self, monkeypatch):
        # Two "server" pages per tile (page size 500 is internal; emulate by
        # returning everything on offset 0 and nothing after), with one
        # duplicate feature and one feature outside the boundary ring.
        inside = _feature(1, 1.0, 1.0)
        dupe = _feature(1, 1.0, 1.0)
        outside = _feature(2, 50.0, 50.0)

        def fake_fetch(url):
            if "resultOffset=0" in url:
                return {"features": [inside, dupe, outside]}
            return {"features": []}

        monkeypatch.setattr(ex, "fetch_json", fake_fetch)
        rings = [[[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0], [0.0, 0.0]]]
        kept = ex.grid_query_all("Svc", 0, "OBJECTID", "OBJECTID", (0.0, 0.0, 1.0, 1.0), rings, grid=1)
        assert len(kept) == 1
        assert kept[0]["properties"]["OBJECTID"] == 1

    def test_dead_pages_are_skipped_not_fatal(self, monkeypatch):
        def boom(url):
            raise RuntimeError("geonb 500")

        monkeypatch.setattr(ex, "fetch_json", boom)
        rings = [[[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0], [0.0, 0.0]]]
        assert ex.grid_query_all("Svc", 0, "F", "OBJECTID", (0.0, 0.0, 1.0, 1.0), rings, grid=1) == []
