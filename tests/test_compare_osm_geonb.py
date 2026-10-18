"""Unit tests for the OSM-vs-GeoNB comparison math."""
import pytest
from conftest import load_script

cmp = load_script("compare_osm_geonb")


def test_dist_m_latitude_degree():
    # 0.001 deg of latitude at the module's constant
    assert cmp.dist_m((0, 0), (0, 0.001)) == pytest.approx(110.54, rel=0.01)


def test_dist_m_zero():
    assert cmp.dist_m((-66.64, 45.96), (-66.64, 45.96)) == 0


def test_centroid_square():
    ring = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]
    assert cmp.centroid(ring) == (0.8, 0.8)


def test_line_len_straightforward():
    # two segments of 0.001 deg latitude each
    assert cmp.line_len_m([[0, 0], [0, 0.001], [0, 0.002]]) == pytest.approx(221.08, rel=0.01)


def test_match_pct_full_and_none():
    pts = [(0.0, 0.0), (1.0, 1.0)]
    assert cmp.match_pct(pts, pts, 15)[0] == 100.0
    assert cmp.match_pct(pts, [(5.0, 5.0)], 15)[0] == 0.0


def test_match_pct_returns_median_offset():
    pct, med = cmp.match_pct([(0.0, 0.0)], [(0.0, 0.0)], 15)
    assert pct == 100.0 and med == 0.0
