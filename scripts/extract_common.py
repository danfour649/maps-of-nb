"""Shared helpers for the full-city extraction scripts (extract_*.py).

Stdlib only (all HTTP goes through curl, like extract_game_mesh.py — GeoNB's
chunked responses truncate under urllib). Each extractor writes one
sub-folder per source under --out and finishes by calling `finalize_source`,
which prints the source URL / licence / timestamp / record count and drops a
`_source.json` next to the data. `build_extract_manifest.py` turns those
files into MANIFEST.md.
"""
import hashlib
import json
import subprocess
import time
import urllib.parse
from datetime import UTC, datetime
from pathlib import Path

UA = "maps-of-nb/1.0"
REPO = Path(__file__).resolve().parent.parent
BOUNDARY_PATH = REPO / "data" / "game-exports" / "fredericton" / "boundary.geojson"
SOURCE_FILE = "_source.json"


def now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------- HTTP

def curl(args: list, timeout: int = 330, retries: int = 3) -> bytes:
    last = ""
    for attempt in range(retries):
        out = subprocess.run(
            ["curl", "-sS", "--fail", "--location", "--max-time", str(timeout - 20),
             "-A", UA, *args], capture_output=True, timeout=timeout)
        if out.returncode == 0:
            return out.stdout
        last = out.stderr.decode(errors="replace").strip()[:300]
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"curl failed after {retries} tries: {last}")


def fetch_json(url: str, **kw) -> dict:
    return json.loads(curl([url], **kw))


def download(url: str, dest: Path, timeout: int = 3600) -> dict:
    """Download to dest; return {bytes, http headers of interest}."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    hdr = dest.with_suffix(dest.suffix + ".hdr")
    subprocess.run(["curl", "-sS", "--fail", "--location", "--retry", "3", "-A", UA,
                    "-D", str(hdr), "-o", str(dest), url], check=True, timeout=timeout)
    headers = {}
    for line in hdr.read_text(errors="replace").splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            headers[k.strip().lower()] = v.strip()
    hdr.unlink()
    keep = {k: headers[k] for k in ("content-type", "last-modified", "etag", "content-length") if k in headers}
    return {"bytes": dest.stat().st_size, "headers": keep}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------- boundary / geometry

def load_boundary(path: Path = BOUNDARY_PATH) -> dict:
    """City boundary GeoJSON (The City of Fredericton, EPSG:4326).

    Uses the copy committed in data/game-exports/fredericton/; falls back to
    the live GeoNB municipal-areas layer when it is missing."""
    if path.exists():
        return json.loads(path.read_text())
    q = urllib.parse.urlencode({
        "where": "Name='The City of Fredericton'", "outFields": "Name,Type,Shape_Area",
        "returnGeometry": "true", "outSR": "4326", "f": "geojson", "geometryPrecision": "6"})
    return fetch_json("https://geonb.snb.ca/arcgis/rest/services/GeoNB_ELG_MunicipalAreas2/MapServer/4/query?" + q)


def boundary_rings(boundary: dict) -> list:
    geom = boundary["features"][0]["geometry"]
    return geom["coordinates"] if geom["type"] == "Polygon" else geom["coordinates"][0]


def bbox_of_coords(coords) -> tuple:
    xs, ys = [], []

    def walk(c):
        if isinstance(c[0], (int, float)):
            xs.append(c[0])
            ys.append(c[1])
        else:
            for x in c:
                walk(x)
    walk(coords)
    return (min(xs), min(ys), max(xs), max(ys))


class RingIndex:
    """Point-in-polygon with a y-bucket edge index (outer ring minus holes).

    The city ring has ~3.5k vertices; bucketing the edges by latitude keeps a
    test to a handful of edges, so clipping 30k+ parcels stays fast in pure
    Python."""

    def __init__(self, rings: list, buckets: int = 512):
        self.rings = rings
        ys = [p[1] for r in rings for p in r]
        self.y0, self.y1 = min(ys), max(ys)
        self.n = buckets
        self.bins = [[] for _ in range(buckets)]
        for ri, ring in enumerate(rings):
            for i in range(len(ring) - 1):
                a, b = ring[i], ring[i + 1]
                if a[1] == b[1]:
                    continue
                lo, hi = sorted((a[1], b[1]))
                for k in range(self._bin(lo), self._bin(hi) + 1):
                    self.bins[k].append((ri, a[0], a[1], b[0], b[1]))

    def _bin(self, y: float) -> int:
        k = int((y - self.y0) / (self.y1 - self.y0) * self.n)
        return min(max(k, 0), self.n - 1)

    def contains(self, x: float, y: float) -> bool:
        if not (self.y0 <= y <= self.y1):
            return False
        crossings = {}
        for ri, x1, y1, x2, y2 in self.bins[self._bin(y)]:
            if (y1 > y) != (y2 > y):
                if x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                    crossings[ri] = not crossings.get(ri, False)
        if not crossings.get(0, False):
            return False
        return not any(v for ri, v in crossings.items() if ri > 0)


def _vertices(geom):
    t, c = geom["type"], geom["coordinates"]
    if t == "Point":
        yield c
    elif t in ("LineString", "MultiPoint"):
        yield from c
    elif t in ("Polygon", "MultiLineString"):
        for r in c:
            yield from r
    elif t == "MultiPolygon":
        for p in c:
            for r in p:
                yield from r


def touches_polygon(geom: dict, index: RingIndex, max_vertices: int = 60) -> bool:
    """Keep a feature if its centroid-ish anchor or any (sampled) vertex lies in the polygon."""
    if not geom:
        return False
    verts = list(_vertices(geom))
    if not verts:
        return False
    ax = sum(v[0] for v in verts) / len(verts)
    ay = sum(v[1] for v in verts) / len(verts)
    if index.contains(ax, ay):
        return True
    step = max(1, len(verts) // max_vertices)
    return any(index.contains(v[0], v[1]) for v in verts[::step])


# ---------------------------------------------------------------- ArcGIS REST

def layer_meta(layer_url: str) -> dict:
    return fetch_json(f"{layer_url}?f=json")


def oid_field(meta: dict) -> str:
    for f in meta.get("fields", []):
        if f.get("type") == "esriFieldTypeOID":
            return f["name"]
    return meta.get("objectIdField") or "OBJECTID"


def count(layer_url: str, extra: dict = None) -> int:
    params = {"where": "1=1", "returnCountOnly": "true", "f": "json"}
    params.update(extra or {})
    res = fetch_json(f"{layer_url}/query?" + urllib.parse.urlencode(params))
    if "error" in res:
        raise RuntimeError(f"count failed: {res['error']}")
    return res["count"]


def query_page(layer_url: str, params: dict) -> dict:
    res = fetch_json(f"{layer_url}/query?" + urllib.parse.urlencode(params))
    if "error" in res:
        raise RuntimeError(f"query error: {res['error']}")
    return res


def query_all(layer_url: str, oid: str, page: int = 1000, where: str = "1=1") -> list:
    """Page through a whole layer by resultOffset, ordered by its OID field."""
    feats, offset = [], 0
    while True:
        res = query_page(layer_url, {
            "where": where, "outFields": "*", "returnGeometry": "true", "outSR": "4326",
            "geometryPrecision": "7", "f": "geojson", "orderByFields": oid,
            "resultOffset": offset, "resultRecordCount": page})
        batch = res.get("features", [])
        feats.extend(batch)
        # A short page is not the end: the server may cut a page at its transfer
        # limit. Only an empty page terminates, and the offset advances by what
        # was actually returned.
        if not batch:
            return feats
        offset += len(batch)


def grid_query(layer_url: str, oid: str, bbox: tuple, index: "RingIndex | None",
               grid: int = 3, page: int = 500, attr_window: tuple = None) -> tuple:
    """Envelope-grid GET extraction + dedupe by OID + optional polygon clip.

    GeoNB truncates responses to polygon-filter POSTs, whereas small GET
    envelope pages are reliable (same approach as extract_game_mesh.py).
    Failing pages are bisected; only truly dead sub-pages are skipped and the
    skip count is returned so the caller can record it.
    attr_window=(lat_field, lon_field) selects each tile with an attribute
    WHERE instead of a geometry filter, for layers whose spatial queries are
    broken (GeoNB_DPS_Civic_Address returns 400s / bogus counts for them).
    Returns (kept_features, fetched_unique, skipped_records, completeness_info)."""
    w, s, e, n = bbox
    seen, kept, skipped = set(), [], [0]

    def fetch_page(tile, offset, size, depth=0):
        params = {"outSR": "4326", "outFields": "*", "returnGeometry": "true", "geometryPrecision": "7",
                  "f": "geojson", "orderByFields": oid, "resultOffset": offset, "resultRecordCount": size}
        if attr_window:
            lat_f, lon_f = attr_window
            params["where"] = (f"{lon_f}>={tile[0]:.6f} AND {lon_f}<={tile[2]:.6f} AND "
                               f"{lat_f}>={tile[1]:.6f} AND {lat_f}<={tile[3]:.6f}")
        else:
            params.update({"where": "1=1", "geometry": ",".join(f"{x:.6f}" for x in tile),
                           "geometryType": "esriGeometryEnvelope", "inSR": "4326",
                           "spatialRel": "esriSpatialRelIntersects"})
        try:
            res = query_page(layer_url, params)
            return res.get("features", [])
        except Exception as exc:
            if depth >= 3 or size <= 16:
                skipped[0] += size
                print(f"  !! dead page {layer_url} offset {offset} size {size}: {str(exc)[:120]}")
                return []
            step = max(1, size // 4)
            out = []
            for sub in range(offset, offset + size, step):
                out += fetch_page(tile, sub, min(step, offset + size - sub), depth + 1)
            return out

    fetched = [0]

    def accept(f):
        key = (f.get("properties") or {}).get(oid)
        if key is None:
            key = json.dumps(f.get("geometry"), sort_keys=True)
        if key in seen:
            return
        seen.add(key)
        fetched[0] += 1
        if index is None or touches_polygon(f.get("geometry"), index):
            kept.append(f)

    for i in range(grid):
        for j in range(grid):
            tile = (w + (e - w) * i / grid, s + (n - s) * j / grid,
                    w + (e - w) * (i + 1) / grid, s + (n - s) * (j + 1) / grid)
            offset = 0
            while True:
                batch = fetch_page(tile, offset, page)
                for f in batch:
                    accept(f)
                if not batch:  # short pages happen at the transfer limit; only empty ends the tile
                    break
                offset += len(batch)
            time.sleep(0.4)

    # Completeness pass: the server's own OID list for the whole bbox is the reference. Paged queries can
    # miss a few rows (GeoNB PAN/parcels: ~20 of 31k), so fetch whatever is still missing by objectIds.
    info = {"server_oids": None, "recovered": 0, "unrecoverable": []}
    try:
        if attr_window:
            lat_f, lon_f = attr_window
            idp = {"where": f"{lon_f}>={w:.6f} AND {lon_f}<={e:.6f} AND {lat_f}>={s:.6f} AND {lat_f}<={n:.6f}"}
        else:
            idp = {"where": "1=1", "geometry": f"{w:.6f},{s:.6f},{e:.6f},{n:.6f}",
                   "geometryType": "esriGeometryEnvelope", "inSR": "4326",
                   "spatialRel": "esriSpatialRelIntersects"}
        ids = query_page(layer_url, {**idp, "returnIdsOnly": "true", "f": "json"}).get("objectIds") or []
        info["server_oids"] = len(ids)
        missing = [i for i in ids if i not in seen]
        for k in range(0, len(missing), 50):
            chunk = missing[k:k + 50]
            res = query_page(layer_url, {"objectIds": ",".join(map(str, chunk)), "outFields": "*",
                                         "returnGeometry": "true", "geometryPrecision": "7",
                                         "outSR": "4326", "f": "geojson"})
            before = fetched[0]
            for f in res.get("features", []):
                accept(f)
            info["recovered"] += fetched[0] - before
        info["unrecoverable"] = [i for i in missing if i not in seen]
    except Exception as exc:
        info["completeness_check_error"] = f"{type(exc).__name__}: {str(exc)[:160]}"
        print(f"  !! completeness pass failed: {exc}")
    return kept, fetched[0], skipped[0], info


# ---------------------------------------------------------------- output

def feature_collection(features: list, **extra) -> dict:
    fc = {"type": "FeatureCollection", "features": features}
    fc.update(extra)
    return fc


def write_json(path: Path, obj) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))
    return path


def finalize_source(folder: Path, source_id: str, name: str, url: str, licence: str,
                    records, files: list, notes: str = "", extra: dict = None) -> dict:
    """Write folder/_source.json and print the standard source banner."""
    entries = []
    for f in files:
        p = folder / f if not Path(f).is_absolute() else Path(f)
        entries.append({"file": str(p.relative_to(folder)), "bytes": p.stat().st_size,
                        "sha256": sha256_file(p)})
    rec = {"id": source_id, "name": name, "url": url, "licence": licence,
           "pulled_at": now_iso(), "records": records, "files": entries, "notes": notes}
    rec.update(extra or {})
    write_json(folder / SOURCE_FILE, rec)
    print(f"\n[{source_id}] {name}\n  source : {url}\n  licence: {licence}\n"
          f"  pulled : {rec['pulled_at']}\n  records: {records}\n"
          f"  files  : {', '.join(e['file'] + ' (' + format(e['bytes'], ',') + ' B)' for e in entries)}")
    return rec


def failed_source(folder: Path, source_id: str, name: str, url: str, licence: str, error: str) -> dict:
    folder.mkdir(parents=True, exist_ok=True)
    rec = {"id": source_id, "name": name, "url": url, "licence": licence, "pulled_at": now_iso(),
           "records": None, "files": [], "status": "FAILED", "error": error}
    write_json(folder / SOURCE_FILE, rec)
    print(f"\n[{source_id}] {name}: FAILED — {error}")
    return rec
