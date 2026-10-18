#!/usr/bin/env python3
"""Compare OpenStreetMap (what GTA Fredericton was built from) against the
GeoNB export for the same area: how much do they actually overlap?

Inputs: two Overpass JSON responses (buildings, highways) + the GeoNB
GeoJSON exports from scripts/extract_game_mesh.py. Matching is by building
centroid distance; roads compare by total length, naming and name sets.

Usage:
    python3 scripts/compare_osm_geonb.py OSM_BUILDINGS.json OSM_ROADS.json \
        data/game-exports/downtown
"""
import json
import math
import sys
from pathlib import Path

M_PER_DEG_LAT = 110_540.0
M_PER_DEG_LON = 78_847.0  # at ~46 deg N


def dist_m(a, b):
    return math.hypot((a[0] - b[0]) * M_PER_DEG_LON, (a[1] - b[1]) * M_PER_DEG_LAT)


def centroid(ring):
    return (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))


def line_len_m(coords):
    return sum(dist_m(coords[i], coords[i + 1]) for i in range(len(coords) - 1))


def osm_buildings(path):
    d = json.load(open(path))
    out = []
    for el in d.get("elements", []):
        geom = el.get("geometry") or []
        if len(geom) >= 3:
            ring = [(g["lon"], g["lat"]) for g in geom]
            tags = el.get("tags", {})
            out.append({"c": centroid(ring), "height": tags.get("height"),
                        "levels": tags.get("building:levels"), "name": tags.get("name")})
    return out


def osm_roads(path):
    d = json.load(open(path))
    ways = []
    for el in d.get("elements", []):
        geom = el.get("geometry") or []
        if len(geom) >= 2:
            tags = el.get("tags", {})
            ways.append({"coords": [(g["lon"], g["lat"]) for g in geom],
                         "name": tags.get("name"), "class": tags.get("highway")})
    return ways


def match_pct(src, dst, radius_m):
    """% of src centroids with a dst centroid within radius_m + median offset."""
    if not src or not dst:
        return 0.0, None
    hits, offs = 0, []
    for s in src:
        best = min(dist_m(s, t) for t in dst)
        if best <= radius_m:
            hits += 1
            offs.append(best)
    offs.sort()
    return 100.0 * hits / len(src), (offs[len(offs) // 2] if offs else None)


def main():
    osm_b = osm_buildings(sys.argv[1])
    osm_r = osm_roads(sys.argv[2])
    export = Path(sys.argv[3])
    gb = json.load(open(export / "buildings.geojson"))["features"]
    gr = json.load(open(export / "roads.geojson"))["features"]

    geo_c = [centroid(f["geometry"]["coordinates"][0]) for f in gb]
    osm_c = [b["c"] for b in osm_b]

    print("=== BUILDINGS ===")
    print(f"GeoNB: {len(gb)}   OSM: {len(osm_b)}")
    for r in (15, 25):
        g2o, med = match_pct(geo_c, osm_c, r)
        o2g, _ = match_pct(osm_c, geo_c, r)
        print(f"within {r} m: {g2o:.0f}% of GeoNB buildings have an OSM match; "
              f"{o2g:.0f}% of OSM buildings have a GeoNB match"
              + (f"; median offset of matches {med:.1f} m" if med is not None else ""))
    h = sum(1 for b in osm_b if b["height"] or b["levels"])
    print(f"OSM buildings carrying any height/levels tag: {h} of {len(osm_b)} "
          f"(GeoNB: {len(gb)} of {len(gb)}, from LiDAR)")

    print("\n=== ROADS ===")
    geo_len = sum(line_len_m(f["geometry"]["coordinates"]) for f in gr) / 1000
    osm_len = sum(line_len_m(w["coords"]) for w in osm_r) / 1000
    print(f"GeoNB: {len(gr)} segments, {geo_len:.1f} km   OSM: {len(osm_r)} ways, {osm_len:.1f} km")
    geo_named = [f for f in gr if f["properties"].get("Formatted_Street_Name")]
    osm_named = [w for w in osm_r if w["name"]]
    print(f"named: GeoNB {len(geo_named)}/{len(gr)} ({100*len(geo_named)/len(gr):.0f}%), "
          f"OSM {len(osm_named)}/{len(osm_r)} ({100*len(osm_named)/len(osm_r):.0f}%)")
    geo_names = {f["properties"]["Formatted_Street_Name"].strip().lower() for f in geo_named}
    osm_names = {w["name"].strip().lower() for w in osm_named}
    print(f"distinct street names: GeoNB {len(geo_names)}, OSM {len(osm_names)}, "
          f"shared {len(geo_names & osm_names)}")
    print("GeoNB names not in OSM:", sorted(geo_names - osm_names)[:12])
    print("OSM names not in GeoNB:", sorted(osm_names - geo_names)[:12])
    lanes = [f["properties"].get("Number_Of_Lanes") for f in gr]
    print(f"GeoNB segments with a lane count: {sum(1 for x in lanes if x)}/{len(gr)} "
          f"(OSM ways with lanes tag downtown: ~0)")
    speeds = [f["properties"].get("Speed_Restrictions_Both") for f in gr]
    print(f"GeoNB segments with a speed limit: {sum(1 for x in speeds if x)}/{len(gr)}")
    drive = {"motorway", "trunk", "primary", "secondary", "tertiary", "unclassified",
             "residential", "living_street", "motorway_link", "trunk_link",
             "primary_link", "secondary_link", "tertiary_link", "service"}
    dlen = sum(line_len_m(w["coords"]) for w in osm_r if w["class"] in drive) / 1000
    plen = sum(line_len_m(w["coords"]) for w in osm_r if w["class"] in
               {"footway", "path", "cycleway", "steps", "pedestrian", "corridor"}) / 1000
    print(f"OSM drivable classes only: {dlen:.1f} km (vs GeoNB network {geo_len:.1f} km); "
          f"OSM paths/footways/cycleways: {plen:.1f} km (GeoNB NBRN carries none)")


if __name__ == "__main__":
    main()
