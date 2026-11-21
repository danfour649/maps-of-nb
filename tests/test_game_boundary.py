"""Tests for the derived game boundary (extract_common.game_boundary_from):
circle math on a synthetic polygon, and a drift guard tying the committed
boundary_game.geojson to the committed official boundary."""
import math

from conftest import load_script

ec = load_script("extract_common")


def _fc(ring):
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {},
         "geometry": {"type": "Polygon", "coordinates": [ring]}}]}


SQUARE = [[-66.70, 45.90], [-66.60, 45.90], [-66.60, 46.00],
          [-66.70, 46.00], [-66.70, 45.90]]


def _dist_m(a, b, lat):
    m_lat, m_lon = ec._metres_per_degree(lat)
    return math.hypot((a[0] - b[0]) * m_lon, (a[1] - b[1]) * m_lat)


class TestCircleMath:
    def test_square_centre_and_radius(self):
        game = ec.game_boundary_from(_fc(SQUARE))
        props = game["features"][0]["properties"]
        assert props["centre"] == [-66.65, 45.95]
        # Farthest vertex of a 0.1 x 0.1 degree square at lat 45.95 is
        # ~6.77 km from its centre; + 1.5 km margin, rounded up to 500 m.
        assert props["radius_m"] == 8500.0
        assert props["kind"] == "game-boundary"

    def test_ring_encompasses_every_vertex(self):
        game = ec.game_boundary_from(_fc(SQUARE))
        props = game["features"][0]["properties"]
        ring = game["features"][0]["geometry"]["coordinates"][0]
        assert ring[0] == ring[-1]  # closed
        assert len(ring) == 181  # 180 segments + closing point
        for v in SQUARE:
            d = _dist_m(v, props["centre"], props["centre"][1])
            assert d <= props["radius_m"]

    def test_margin_and_rounding_rule(self):
        game = ec.game_boundary_from(_fc(SQUARE), margin_m=0.0)
        assert game["features"][0]["properties"]["radius_m"] == 7000.0


class TestCommittedFiles:
    def test_committed_game_boundary_matches_generator(self):
        committed = ec.load_game_boundary()
        regenerated = ec.game_boundary_from(ec.load_boundary())
        assert committed["features"][0]["properties"] == \
            regenerated["features"][0]["properties"]
        ring_a = committed["features"][0]["geometry"]["coordinates"][0]
        ring_b = regenerated["features"][0]["geometry"]["coordinates"][0]
        assert len(ring_a) == len(ring_b)
        for a, b in zip(ring_a, ring_b):
            assert abs(a[0] - b[0]) < 1e-6 and abs(a[1] - b[1]) < 1e-6

    def test_committed_circle_encompasses_official_boundary(self):
        game = ec.load_game_boundary()
        props = game["features"][0]["properties"]
        official = ec.load_boundary()
        for ring in ec._all_rings(official["features"][0]["geometry"]):
            for v in ring:
                d = _dist_m(v, props["centre"], props["centre"][1])
                assert d <= props["radius_m"] + 1.0  # 1 m slack for rounding
