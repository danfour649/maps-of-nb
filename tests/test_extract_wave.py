"""Offline tests for the full-city extraction wave helpers (no network, no GDAL)."""
import io
import json
import zipfile

import pytest
from conftest import load_script

ec = load_script("extract_common")
gtfs = load_script("extract_gtfs")
manifest = load_script("build_extract_manifest")

SQUARE = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
HOLE = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]


def test_ring_index_inside_outside_and_hole():
    idx = ec.RingIndex([SQUARE, HOLE], buckets=16)
    assert idx.contains(1, 1)
    assert not idx.contains(11, 5)
    assert not idx.contains(5, 5)  # inside the hole
    assert not idx.contains(5, 20)  # outside the y range


def test_ring_index_matches_brute_force_on_concave_ring():
    ring = [[0, 0], [10, 0], [10, 10], [5, 3], [0, 10], [0, 0]]  # concave notch from the top
    idx = ec.RingIndex([ring], buckets=8)
    for x, y in [(1, 1), (5, 8), (9, 9), (5, 2), (2, 9), (9, 1)]:
        c = False
        for i in range(len(ring) - 1):
            (x1, y1), (x2, y2) = ring[i], ring[i + 1]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                c = not c
        assert idx.contains(x, y) == c, (x, y)


def test_touches_polygon_by_vertex_when_centroid_outside():
    idx = ec.RingIndex([SQUARE])
    line = {"type": "LineString", "coordinates": [[9, 5], [30, 5], [31, 5], [32, 5], [33, 5]]}
    assert ec.touches_polygon(line, idx)  # only the first vertex is inside
    far = {"type": "Point", "coordinates": [50, 50]}
    assert not ec.touches_polygon(far, idx)
    assert not ec.touches_polygon(None, idx)


def test_bbox_of_coords_nested():
    assert ec.bbox_of_coords([[[1, 2], [3, 4]], [[-1, 9]]]) == (-1, 2, 3, 9)


def test_oid_field_prefers_declared_oid_type():
    meta = {"fields": [{"name": "OBJECTID_1", "type": "esriFieldTypeInteger"},
                       {"name": "OBJECTID", "type": "esriFieldTypeOID"}]}
    assert ec.oid_field(meta) == "OBJECTID"


def test_finalize_source_records_sha_and_manifest_verifies(tmp_path, capsys):
    folder = tmp_path / "X1-demo"
    folder.mkdir()
    f = ec.write_json(folder / "a.geojson", {"type": "FeatureCollection", "features": []})
    rec = ec.finalize_source(folder, "X1", "Demo", "https://example.test/x", "OGL", 0, [f], "n")
    assert rec["files"][0]["sha256"] == ec.sha256_file(f)
    assert "records: 0" in capsys.readouterr().out
    srcs = manifest.load_sources(tmp_path)
    assert manifest.verify(tmp_path, srcs[0]) == []
    f.write_text("tampered")
    assert any("mismatch" in p for p in manifest.verify(tmp_path, srcs[0]))
    (folder / "stray.txt").write_text("x")
    assert any("unlisted" in p for p in manifest.verify(tmp_path, srcs[0]))


def test_manifest_render_lists_deferred_and_failed(tmp_path):
    ok = tmp_path / "A-ok"
    ok.mkdir()
    ec.finalize_source(ok, "A", "Fine", "u", "l", 3, [ec.write_json(ok / "d.json", {})])
    ec.failed_source(tmp_path / "B-bad", "B", "Broken", "u2", "l2", "HTTP 500")
    text = manifest.render(tmp_path, manifest.load_sources(tmp_path))
    assert "FAILED" in text and "HTTP 500" in text
    assert "Deferred" in text and "125.8 GB" in text


@pytest.mark.parametrize("n,expect", [(10, "10 B"), (2048, "2.0 KB"), (5 * 1024 ** 2, "5.0 MB")])
def test_human_sizes(n, expect):
    assert manifest.human(n) == expect


def test_gtfs_summarize_reads_counts_without_modifying(tmp_path):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("routes.txt", "route_id,route_short_name\n1,10N\n2,11S\n")
        zf.writestr("trips.txt", "trip_id,route_id\na,1\nb,1\nc,2\n")
        zf.writestr("feed_info.txt", "feed_publisher_name,feed_version,feed_start_date,feed_end_date\nFT,20261024,20261022,20261219\n")
    p = tmp_path / "gtfs.zip"
    p.write_bytes(buf.getvalue())
    before = p.read_bytes()
    s = gtfs.summarize(p)
    assert s["members"]["trips.txt"] == 3 and s["routes"] == ["10N", "11S"]
    assert s["feed_info"]["feed_version"] == "20261024"
    assert p.read_bytes() == before


def test_feature_collection_roundtrip(tmp_path):
    p = ec.write_json(tmp_path / "f.geojson", ec.feature_collection([{"type": "Feature"}], name="t"))
    assert json.loads(p.read_text())["name"] == "t"
