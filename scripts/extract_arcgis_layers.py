#!/usr/bin/env python3
"""Extract the City of Fredericton and GeoNB ArcGIS layers used by GTA Fredericton.

Re-runnable. One sub-folder per source under --out, each with the GeoJSON and a
_source.json (URL, licence, timestamp, record count, sha256). Stdlib only.

Sources (IDs follow the data-sources sweep, ~/gta-datasources/DATA-SOURCES.md):
  A1 street centrelines        City FeatureServer  (all rows)
  A2 civic addresses           City FeatureServer  (all rows, + CSV)
  A3 tree inventory            City FeatureServer  (all rows, + CSV)
  A5 zoning, A6 parks / trails / recreation amenities / neighbourhoods
                               City FeatureServers (all rows)
  B3 property assessment (PAN) GeoNB MapServer     clipped to the city boundary
  B4 parcels                   GeoNB MapServer     clipped to the city boundary
  B5 provincial civic addresses GeoNB MapServer    clipped to the city boundary
  B8 2018 flood extents        GeoNB MapServer     as published, envelope of the city only

GeoNB layers are fetched in envelope-grid GET pages and clipped client-side
(a feature is kept when its centroid or any sampled vertex is inside the
boundary). The OID field is read from layer metadata — the old
extract_game_mesh.py ordering on OBJECTID_1 breaks on layers whose key field
is OBJECTID.

Usage:
    python3 scripts/extract_arcgis_layers.py --out /mnt/folaDriveB/maps-of-nb-extracts/2026-10-24
    python3 scripts/extract_arcgis_layers.py --out OUT --only A1,A3,B3
"""
import argparse
import csv
import sys
import traceback
from pathlib import Path

import extract_common as ec

CITY = "https://services2.arcgis.com/iLWAxhpxafhOza2U/arcgis/rest/services"
GEONB = "https://geonb.snb.ca/arcgis/rest/services"

LIC_CITY = ("None stated by the publisher (City of Fredericton Open Data; DCAT/Hub licence field empty). "
            "Confirm terms in writing with opendata@fredericton.ca before shipping in a distributed build.")
LIC_NB = ("Open Government Licence - New Brunswick. Attribution: 'Contains information licensed under "
          "the Open Government Licence – New Brunswick.'")

# id, folder, name, layer url, licence, scope, file stem, csv?, options
# options: attr_window=(lat_field, lon_field) -> tile by attribute WHERE (broken spatial queries)
SOURCES = [
    ("A1", "A1-street-centerlines", "City of Fredericton Street CenterLines",
     f"{CITY}/Street_CenterLines/FeatureServer/15", LIC_CITY, "all", "street_centerlines", False, {}),
    ("A2", "A2-civic-addresses", "City of Fredericton Civic Addresses",
     f"{CITY}/Civic_Addresses/FeatureServer/16", LIC_CITY, "all", "civic_addresses", True, {}),
    ("A3", "A3-tree-inventory", "City of Fredericton Tree Inventory",
     f"{CITY}/Tree_Inventory/FeatureServer/37", LIC_CITY, "all", "tree_inventory", True, {}),
    ("A5", "A5-zoning", "City of Fredericton Zoning (By-law Z-5)",
     f"{CITY}/Zoning/FeatureServer/0", LIC_CITY, "all", "zoning", False, {}),
    ("A6-parks", "A6-parks", "City of Fredericton Parks (public view)",
     f"{CITY}/Parks_Public_View/FeatureServer/0", LIC_CITY, "all", "parks", False, {}),
    ("A6-trails", "A6-trails", "City of Fredericton Trails",
     f"{CITY}/City_of_Fredericton_Trails/FeatureServer/68", LIC_CITY, "all", "trails", False, {}),
    ("A6-rec", "A6-recreation-amenities", "City of Fredericton Recreation Amenities",
     f"{CITY}/Recreation_Amenities_view/FeatureServer/0", LIC_CITY, "all", "recreation_amenities", False, {}),
    ("A6-nbhd", "A6-neighbourhoods", "City of Fredericton Neighbourhoods",
     f"{CITY}/Neighbourhoods/FeatureServer/0", LIC_CITY, "all", "neighbourhoods", False, {}),
    ("B3", "B3-geonb-pan", "GeoNB Property Assessment (PAN) parcels",
     f"{GEONB}/GeoNB_SNB_Pan/MapServer/0", LIC_NB, "clip", "pan", False, {}),
    ("B4", "B4-geonb-parcels", "GeoNB Parcels (lot lines)",
     f"{GEONB}/GeoNB_SNB_Parcels/MapServer/0", LIC_NB, "clip", "parcels", False, {}),
    ("B5", "B5-geonb-civic-addresses", "GeoNB provincial Civic Addresses (E911)",
     f"{GEONB}/GeoNB_DPS_Civic_Address/MapServer/0", LIC_NB, "clip", "civic_addresses_geonb", True,
     {"attr_window": ("LATITUDE", "LONGITUDE")}),
    ("B8", "B8-geonb-flood-2018", "GeoNB 2018 Flood Extents - Lower Saint John River",
     f"{GEONB}/GeoNB_ENV_Flood/MapServer/7", LIC_NB, "envelope", "flood_extent_2018", False, {}),
]


def write_csv(path: Path, features: list) -> Path:
    cols = []
    for f in features:
        for k in (f.get("properties") or {}):
            if k not in cols:
                cols.append(k)
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(cols + ["lon", "lat"])
        for f in features:
            g = f.get("geometry") or {}
            lon, lat = (g["coordinates"][:2] if g.get("type") == "Point" else ("", ""))
            w.writerow([(f.get("properties") or {}).get(c, "") for c in cols] + [lon, lat])
    return path


def run_source(src, out: Path, boundary: dict, index: "ec.RingIndex", bbox: tuple) -> dict:
    sid, folder_name, name, url, licence, scope, stem, want_csv, opts = src
    folder = out / folder_name
    folder.mkdir(parents=True, exist_ok=True)
    meta = ec.layer_meta(url)
    if "error" in meta:
        raise RuntimeError(f"layer metadata error: {meta['error']}")
    oid = ec.oid_field(meta)
    notes = [f"layer '{meta.get('name')}', geometry {meta.get('geometryType')}, OID field {oid}"]
    extra = {"layer_url": url, "oid_field": oid}

    if scope == "all":
        server_n = ec.count(url)
        feats = ec.query_all(url, oid, page=min(int(meta.get("maxRecordCount") or 1000), 2000))
        extra.update(server_count=server_n)
        if len(feats) != server_n:
            notes.append(f"WARNING fetched {len(feats)} != server count {server_n}")
    else:
        env = {"geometry": ",".join(f"{x:.6f}" for x in bbox), "geometryType": "esriGeometryEnvelope",
               "inSR": "4326", "spatialRel": "esriSpatialRelIntersects"}
        window = opts.get("attr_window")
        # With attr_window the layer's spatial queries/counts are unreliable, so no server cross-check.
        server_bbox_n = None if window else ec.count(url, env)
        feats, fetched, skipped, comp = ec.grid_query(url, oid, bbox, index if scope == "clip" else None,
                                                attr_window=window)
        extra.update(server_count_in_city_bbox=server_bbox_n, fetched_unique=fetched, skipped_records=skipped,
                     completeness=comp)
        notes.append(f"{fetched} unique features in the city bbox {tuple(round(x, 4) for x in bbox)}"
                     + (f" (server count {server_bbox_n}); " if server_bbox_n is not None else
                        " (attribute-window query; server counts unreliable); ")
                     + (f"{len(feats)} kept after clipping to the city boundary polygon"
                        if scope == "clip" else "all kept unclipped (as published)"))
        if comp.get("server_oids") is not None:
            notes.append(f"server OID list for the bbox: {comp['server_oids']}; recovered {comp['recovered']} rows missed "
                         f"by paging via objectIds; {len(comp['unrecoverable'])} unrecoverable")
        if skipped:
            notes.append(f"WARNING {skipped} records skipped (dead server pages)")
        ref = comp.get("server_oids") if comp.get("server_oids") is not None else server_bbox_n
        if ref is not None and fetched < ref:
            notes.append(f"WARNING fetched {fetched} unique < server reference {ref}")
        elif ref is not None and fetched > ref:
            notes.append(f"{fetched - ref} more than the server OID list (features touching tile edges; harmless)")

    gj_path = ec.write_json(folder / f"{stem}.geojson", ec.feature_collection(
        feats, name=stem, source=url, pulled_at=ec.now_iso()))
    files = [gj_path]
    if want_csv:
        files.append(write_csv(folder / f"{stem}.csv", feats))
    return ec.finalize_source(folder, sid, name, url, licence, len(feats), files, "; ".join(notes), extra)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True, help="output root; one sub-folder per source is created")
    ap.add_argument("--only", default="", help="comma-separated source ids (A1,A2,A3,A5,A6-parks,...,B8)")
    args = ap.parse_args()
    out = Path(args.out)
    only = {x.strip() for x in args.only.split(",") if x.strip()}

    boundary = ec.load_boundary()
    rings = ec.boundary_rings(boundary)
    index = ec.RingIndex(rings)
    bbox = ec.bbox_of_coords(rings)

    failures = 0
    for src in SOURCES:
        if only and src[0] not in only and src[0].split("-")[0] not in only:
            continue
        try:
            run_source(src, out, boundary, index, bbox)
        except Exception as exc:  # record and move on: one dead source must not stall the wave
            failures += 1
            traceback.print_exc()
            ec.failed_source(out / src[1], src[0], src[2], src[3], src[4], f"{type(exc).__name__}: {exc}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
