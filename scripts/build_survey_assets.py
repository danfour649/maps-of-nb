#!/usr/bin/env python3
"""Build the two static assets behind the survey-control map view:

  web/public/survey-monuments.json  — every located monument in GeoNB's
      published Survey Control download as compact [lng, lat, destroyed]
      triples. The live GeoNB MapServer only renders the Conventional
      network at 1:50k and the HPN at 1:3.5M, so at province zoom the
      viewer draws these dots itself (see web/src/catalog.ts).
  web/public/nb-boundary.geojson    — the provincial outline: the union
      of GeoNB's twelve Regional Service Commission polygons (they tile
      the whole province), generalised so the file stays small. Needs
      shapely (pip install shapely) for the union.

Source: https://geonb.snb.ca/downloads/hpn_current/nbcontrol.zip
(the same CSV package the GeoNB Survey Control viewer links to) and
the GeoNB_ELG_Local_Governance ArcGIS service. Data © GeoNB /
Service New Brunswick.

Usage: python3 scripts/build_survey_assets.py [path-to-nbcontrol.zip]
Without an argument the zip is downloaded fresh.
"""
import csv
import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ZIP_URL = "https://geonb.snb.ca/downloads/hpn_current/nbcontrol.zip"
BOUNDARY_URL = (
    "https://geonb.snb.ca/arcgis/rest/services/GeoNB_ELG_Local_Governance"
    "/MapServer/2/query?where=1%3D1&outFields=Name"
    "&returnGeometry=true&outSR=4326&f=geojson&geometryPrecision=5"
)


def monuments(zip_bytes: bytes) -> list[list]:
    pts: list[list] = []
    z = zipfile.ZipFile(io.BytesIO(zip_bytes))
    conv = csv.DictReader(io.TextIOWrapper(z.open("CONVSQL.csv"), encoding="latin-1"))
    for r in conv:
        if r["dLat"] and r["dLong"]:
            pts.append([round(-float(r["dLong"]), 5), round(float(r["dLat"]), 5),
                        1 if r["Status"] == "DEST" else 0])
    hpn = csv.DictReader(io.TextIOWrapper(z.open("WebhpnSQL.csv"), encoding="utf-8-sig"))
    for r in hpn:
        if r["dLat"] and r["dLong"]:
            pts.append([round(-float(r["dLong"]), 5), round(float(r["dLat"]), 5),
                        1 if r["Status"] == "DEST" else 0])
    pts.sort(key=lambda p: (p[0], p[1]))
    return pts


def boundary() -> dict:
    from shapely import make_valid
    from shapely.geometry import shape
    from shapely.ops import unary_union
    gj = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(BOUNDARY_URL) as resp:
                gj = json.load(resp)
            break
        except Exception:
            if attempt == 2:
                raise
    assert gj is not None
    fixed = []
    for f in gj["features"]:
        g = make_valid(shape(f["geometry"]))
        parts = list(g.geoms) if g.geom_type in ("MultiPolygon", "GeometryCollection") else [g]
        fixed.extend(p for p in parts if p.geom_type == "Polygon")
    union = unary_union(fixed)
    union = union.simplify(0.003, preserve_topology=True)
    parts = list(union.geoms) if union.geom_type == "MultiPolygon" else [union]
    out = []
    for part in parts:
        if part.area < 0.002:  # keep real islands (Grand Manan, Campobello…), drop rocks
            continue
        rings = [[[round(x, 4), round(y, 4)] for x, y in part.exterior.coords]]
        for hole in part.interiors:
            rings.append([[round(x, 4), round(y, 4)] for x, y in hole.coords])
        out.append(rings)
    return {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {"name": "New Brunswick",
                           "source": "GeoNB Local Governance — Regional Service Commissions union, generalised"},
            "geometry": {"type": "MultiPolygon", "coordinates": out},
        }],
    }


def main() -> None:
    if len(sys.argv) > 1:
        zip_bytes = Path(sys.argv[1]).read_bytes()
    else:
        with urllib.request.urlopen(ZIP_URL) as resp:
            zip_bytes = resp.read()
    pts = monuments(zip_bytes)
    dest = sum(p[2] for p in pts)
    (ROOT / "web/public/survey-monuments.json").write_text(
        json.dumps({"v": 1, "points": pts}, separators=(",", ":")))
    print(f"survey-monuments.json: {len(pts)} located points, {dest} marked destroyed")
    gj = boundary()
    (ROOT / "web/public/nb-boundary.geojson").write_text(json.dumps(gj, separators=(",", ":")))
    verts = 0
    def count(c):
        nonlocal verts
        if isinstance(c[0], (int, float)):
            verts += 1
        else:
            for x in c:
                count(x)
    count(gj["features"][0]["geometry"]["coordinates"])
    print(f"nb-boundary.geojson: {verts} vertices")


if __name__ == "__main__":
    main()
