#!/usr/bin/env python3
"""NRCan HRDEM 2018 1 m DTM: clip the city's southern gap and measure the seam.

The existing city DTM mosaic (fredericton_dtm_1m.tif, GeoNB 2024 LiDAR, EPSG:2953)
stops at northing 7,433,000, leaving the southern ~22.7 km² of the city boundary
without terrain. NRCan's HRDEM (CanElevation) 2018 provincial 1 m COG covers it:
  https://canelevation-dem.s3.ca-central-1.amazonaws.com/hrdem-lidar/NB-ERD_2018_aoi1-1m-dtm.tif
This script, with no LAZ processing:
  1. builds the gap polygon = city boundary minus the mosaic extent (EPSG:2953);
  2. warps the COG (EPSG:3979) onto the mosaic's 1 m grid (EPSG:2953, bilinear),
     cut to the gap polygon plus an overlap margin for seam blending;
  3. compares HRDEM with the mosaic where both have data and writes seam stats
     (overall, by distance north of the seam, and per-kilometre along the seam).

Output (under <out>/C1-nrcan-hrdem-2018/):
  hrdem2018_dtm_gap_epsg2953_1m.tif   Float32, nodata -9999 (same as the mosaic), CGVD2013
  gap_strip_epsg2953.gpkg             the gap polygon used for the cutline
  hrdem2018_seam_stats.json           coverage + seam statistics
  stac_item.json                      the NRCan STAC item (provenance)

Needs GDAL Python bindings (python3-gdal / osgeo) and numpy. The mosaic is
~GB-scale and lives on the fola boxes, not in git: pass it with --mosaic.

Usage:
    python3 scripts/extract_hrdem_gap.py --out /mnt/folaDriveB/maps-of-nb-extracts/2026-10-24 \
        --mosaic /mnt/folaDriveB/lidar/city_dtm/fredericton_dtm_1m.tif
"""
import argparse
import json
import math
import sys
import time
from pathlib import Path

import extract_common as ec
import numpy as np
from osgeo import gdal, ogr, osr

gdal.UseExceptions()
ogr.UseExceptions()
osr.UseExceptions()

STAC_ITEM = "https://datacube.services.geo.ca/stac/api/collections/hrdem-lidar/items/NB-ERD_2018_aoi1-1m"
DTM_URL = "https://canelevation-dem.s3.ca-central-1.amazonaws.com/hrdem-lidar/NB-ERD_2018_aoi1-1m-dtm.tif"
LICENCE = "OGL-Canada-2.0 (Open Government Licence - Canada 2.0), per the STAC collection 'license' field"
SRC_NODATA = -32767.0
SEAM_BANDS = [(0, 250), (250, 500), (500, 1000), (1000, 2000), (2000, 1e9)]


def srs(epsg: int) -> osr.SpatialReference:
    s = osr.SpatialReference()
    s.ImportFromEPSG(epsg)
    s.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return s


def boundary_2953() -> ogr.Geometry:
    rings = ec.boundary_rings(ec.load_boundary())
    poly = ogr.Geometry(ogr.wkbPolygon)
    for r in rings:
        ring = ogr.Geometry(ogr.wkbLinearRing)
        for x, y in r:
            ring.AddPoint_2D(x, y)
        poly.AddGeometry(ring)
    poly.AssignSpatialReference(srs(4326))
    poly.Transform(osr.CoordinateTransformation(srs(4326), srs(2953)))
    return poly.Buffer(0)


def mosaic_rect(ds) -> ogr.Geometry:
    gt = ds.GetGeoTransform()
    x0, y1 = gt[0], gt[3]
    x1, y0 = x0 + gt[1] * ds.RasterXSize, y1 + gt[5] * ds.RasterYSize
    return ogr.CreateGeometryFromWkt(f"POLYGON(({x0} {y0},{x1} {y0},{x1} {y1},{x0} {y1},{x0} {y0}))")


def write_gap_gpkg(path: Path, gap: ogr.Geometry, cutline: ogr.Geometry):
    if path.exists():
        path.unlink()
    ds = ogr.GetDriverByName("GPKG").CreateDataSource(str(path))
    lyr = ds.CreateLayer("gap", srs(2953), ogr.wkbMultiPolygon)
    lyr.CreateField(ogr.FieldDefn("role", ogr.OFTString))
    for role, g in (("gap", gap), ("cutline_with_overlap", cutline)):
        f = ogr.Feature(lyr.GetLayerDefn())
        f.SetField("role", role)
        f.SetGeometry(ogr.ForceToMultiPolygon(g.Clone()))
        lyr.CreateFeature(f)
    ds = None


def gap_mask(ds, gap: ogr.Geometry) -> np.ndarray:
    """Rasterise the gap polygon onto ds's grid (uint8, 1 inside)."""
    mem = gdal.GetDriverByName("MEM").Create("", ds.RasterXSize, ds.RasterYSize, 1, gdal.GDT_Byte)
    mem.SetGeoTransform(ds.GetGeoTransform())
    mem.SetProjection(ds.GetProjection())
    v = ogr.GetDriverByName("Memory").CreateDataSource("m")
    lyr = v.CreateLayer("g", srs(2953), ogr.wkbPolygon)
    f = ogr.Feature(lyr.GetLayerDefn())
    f.SetGeometry(gap)
    lyr.CreateFeature(f)
    gdal.RasterizeLayer(mem, [1], lyr, burn_values=[1])
    return mem.GetRasterBand(1).ReadAsArray()


def pct(a, q):
    return float(np.percentile(a, q)) if a.size else None


def summarize(d: np.ndarray) -> dict:
    if d.size == 0:
        return {"n": 0}
    ad = np.abs(d)
    return {"n": int(d.size), "mean_m": round(float(d.mean()), 4), "median_m": round(float(np.median(d)), 4),
            "sd_m": round(float(d.std()), 4), "mae_m": round(float(ad.mean()), 4),
            "rmse_m": round(float(np.sqrt((d.astype("f8") ** 2).mean())), 4),
            "median_abs_m": round(pct(ad, 50), 4), "p90_abs_m": round(pct(ad, 90), 4),
            "p99_abs_m": round(pct(ad, 99), 4), "min_m": round(float(d.min()), 3),
            "max_m": round(float(d.max()), 3), "frac_abs_gt_1m": round(float((ad > 1).mean()), 5)}


def seam_stats(hrdem_vrt, mosaic, seam_n: float, strip_rows: int = 500) -> dict:
    """Compare HRDEM (warped onto the mosaic grid) with the mosaic. d = HRDEM - mosaic."""
    gt = mosaic.GetGeoTransform()
    mb = mosaic.GetRasterBand(1)
    hb = hrdem_vrt.GetRasterBand(1)
    m_nd = mb.GetNoDataValue()
    all_d, band_d, km_d = [], {b: [] for b in SEAM_BANDS}, {}
    ndist = []
    t0 = time.time()
    for r0 in range(0, mosaic.RasterYSize, strip_rows):
        rows = min(strip_rows, mosaic.RasterYSize - r0)
        m = mb.ReadAsArray(0, r0, mosaic.RasterXSize, rows).astype("f4")
        h = hb.ReadAsArray(0, r0, mosaic.RasterXSize, rows).astype("f4")
        valid = (m != m_nd) & (h != m_nd) & np.isfinite(m) & np.isfinite(h)
        if not valid.any():
            continue
        d = (h - m)[valid]
        ri, ci = np.nonzero(valid)
        north = gt[3] + gt[5] * (r0 + ri + 0.5)
        east = gt[0] + gt[1] * (ci + 0.5)
        dist = north - seam_n
        all_d.append(d)
        ndist.append(dist.astype("f4"))
        for b in SEAM_BANDS:
            sel = (dist >= b[0]) & (dist < b[1])
            if sel.any():
                band_d[b].append(d[sel])
        near = dist < 500
        if near.any():
            for k in np.unique((east[near] // 1000).astype(int)):
                km_d.setdefault(int(k), []).append(d[near & ((east // 1000).astype(int) == k)])
        print(f"  seam strip rows {r0}-{r0 + rows}: {int(valid.sum()):,} px both-valid ({time.time() - t0:.0f}s)")
    out = {"definition": "d = HRDEM_2018 - mosaic_2024 (m), pixels valid in both",
           "seam_northing_epsg2953": seam_n}
    if not all_d:
        out["overall"] = {"n": 0}
        return out
    d = np.concatenate(all_d)
    out["overall"] = summarize(d)
    out["overall_trimmed_abs_lt_5m"] = summarize(d[np.abs(d) < 5])
    out["by_distance_north_of_seam_m"] = {
        f"{int(b[0])}-{'inf' if b[1] > 1e8 else int(b[1])}": summarize(np.concatenate(v)) if v else {"n": 0}
        for b, v in band_d.items()}
    out["along_seam_0_500m_band_per_easting_km"] = {
        f"E{k * 1000}": summarize(np.concatenate(v)) for k, v in sorted(km_d.items())}
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--mosaic", default="/mnt/folaDriveB/lidar/city_dtm/fredericton_dtm_1m.tif")
    ap.add_argument("--overlap-m", type=float, default=250.0, help="margin around the gap kept for seam blending")
    ap.add_argument("--no-seam-stats", action="store_true")
    args = ap.parse_args()

    gdal.SetConfigOption("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    gdal.SetConfigOption("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")
    gdal.SetConfigOption("GDAL_HTTP_MAX_RETRY", "5")
    gdal.SetConfigOption("GDAL_HTTP_RETRY_DELAY", "2")
    gdal.SetConfigOption("VSI_CACHE", "TRUE")
    gdal.SetConfigOption("GDAL_NUM_THREADS", "ALL_CPUS")

    folder = Path(args.out) / "C1-nrcan-hrdem-2018"
    folder.mkdir(parents=True, exist_ok=True)
    try:
        stac = ec.fetch_json(STAC_ITEM)
        ec.write_json(folder / "stac_item.json", stac)
    except Exception as exc:
        stac = None
        print(f"  (STAC item fetch failed, continuing: {exc})")

    mosaic = gdal.Open(args.mosaic)
    rect = mosaic_rect(mosaic)
    city = boundary_2953()
    gap = city.Difference(rect)
    gap_km2 = gap.GetArea() / 1e6
    mgt = mosaic.GetGeoTransform()
    seam_n = mgt[3] + mgt[5] * mosaic.RasterYSize
    print(f"city {city.GetArea() / 1e6:.2f} km², gap {gap_km2:.2f} km², seam northing {seam_n:.0f}")

    cutline = gap.Buffer(args.overlap_m)
    gpkg = folder / "gap_strip_epsg2953.gpkg"
    write_gap_gpkg(gpkg, gap, cutline)
    minx, maxx, miny, maxy = cutline.GetEnvelope()
    te = (math.floor(minx), math.floor(miny), math.ceil(maxx), math.ceil(maxy))
    print(f"clip window EPSG:2953 {te}  ({te[2] - te[0]} x {te[3] - te[1]} px)")

    src = f"/vsicurl/{DTM_URL}"
    tif = folder / "hrdem2018_dtm_gap_epsg2953_1m.tif"
    t0 = time.time()
    gdal.Warp(str(tif), src, dstSRS="EPSG:2953", xRes=1, yRes=1, outputBounds=te,
              resampleAlg="bilinear", srcNodata=SRC_NODATA, dstNodata=-9999, outputType=gdal.GDT_Float32,
              cutlineDSName=str(gpkg), cutlineLayer="gap", cutlineWhere="role='cutline_with_overlap'",
              multithread=True, warpMemoryLimit=1024,
              creationOptions=["COMPRESS=DEFLATE", "PREDICTOR=3", "TILED=YES", "BLOCKXSIZE=512",
                               "BLOCKYSIZE=512", "BIGTIFF=IF_SAFER"])
    print(f"warp done in {time.time() - t0:.0f}s -> {tif.name} ({tif.stat().st_size:,} B)")

    clip = gdal.Open(str(tif))
    arr = clip.GetRasterBand(1).ReadAsArray()
    valid = arr != -9999
    in_gap = gap_mask(clip, gap).astype(bool)
    cov = {"gap_km2": round(gap_km2, 3),
           "gap_pixels": int(in_gap.sum()),
           "gap_pixels_with_data": int((valid & in_gap).sum()),
           "gap_coverage_pct": round(100.0 * float((valid & in_gap).sum()) / max(1, int(in_gap.sum())), 3),
           "overlap_margin_m": args.overlap_m,
           "clip_pixels_with_data": int(valid.sum()),
           "elevation_m_min_max_mean": [round(float(arr[valid].min()), 2), round(float(arr[valid].max()), 2),
                                        round(float(arr[valid].mean()), 2)] if valid.any() else None}
    print("coverage:", json.dumps(cov))
    del arr, valid, in_gap

    stats = {"hrdem_dtm": DTM_URL, "stac_item": STAC_ITEM, "mosaic": args.mosaic,
             "crs": "EPSG:2953 (NAD83(CSRS) / New Brunswick Stereographic); vertical CGVD2013 for both inputs",
             "clip_window_epsg2953": te, "coverage": cov}
    if not args.no_seam_stats:
        vrt = gdal.Warp("", src, format="VRT", dstSRS="EPSG:2953", xRes=1, yRes=1,
                        outputBounds=(mgt[0], seam_n, mgt[0] + mgt[1] * mosaic.RasterXSize, mgt[3]),
                        resampleAlg="bilinear", srcNodata=SRC_NODATA, dstNodata=-9999,
                        outputType=gdal.GDT_Float32)
        stats["seam"] = seam_stats(vrt, mosaic, seam_n)
        print("seam overall:", json.dumps(stats["seam"].get("overall")))
    ec.write_json(folder / "hrdem2018_seam_stats.json", stats)

    ec.finalize_source(
        folder, "C1", "NRCan HRDEM 2018 1 m DTM - southern gap clip + seam stats", DTM_URL, LICENCE,
        cov["gap_pixels_with_data"],
        [tif, gpkg, folder / "hrdem2018_seam_stats.json"] + ([folder / "stac_item.json"] if stac else []),
        f"records = 1 m pixels with data inside the {gap_km2:.2f} km² gap; coverage {cov['gap_coverage_pct']}%. "
        "STAC item NB-ERD_2018_aoi1-1m (acquired 2018-08-25). Large raster: kept out of git.",
        {"stac_item": STAC_ITEM, "coverage": cov, "seam_overall": stats.get("seam", {}).get("overall")})
    return 0


if __name__ == "__main__":
    sys.exit(main())
