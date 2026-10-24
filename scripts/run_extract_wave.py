#!/usr/bin/env python3
"""Run the whole full-city extraction wave into one dated folder, then build MANIFEST.md.

Each extractor is its own script and can be run alone; this just chains them, keeps a log per step
under <out>/_logs/, and carries on when one source fails (the failure is recorded in that source's
_source.json and in the manifest).

  arcgis   scripts/extract_arcgis_layers.py   A1 A2 A3 A5 A6 (city), B3 B4 B5 B8 (GeoNB)
  hrdem    scripts/extract_hrdem_gap.py       C1 (needs GDAL python bindings + the DTM mosaic)
  gtfs     scripts/extract_gtfs.py            A4
  overture scripts/extract_overture.py        D1 (runs under `uv run`, which supplies duckdb)
  eccc     scripts/extract_eccc_samples.py    C4

Usage:
    python3 scripts/run_extract_wave.py --out /mnt/folaDriveB/maps-of-nb-extracts/$(date +%F)
    python3 scripts/run_extract_wave.py --out OUT --only gtfs,eccc
"""
import argparse
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
STEPS = {
    "arcgis": [sys.executable, "-u", str(HERE / "extract_arcgis_layers.py")],
    "hrdem": [sys.executable, "-u", str(HERE / "extract_hrdem_gap.py")],
    "gtfs": [sys.executable, "-u", str(HERE / "extract_gtfs.py")],
    "overture": ["uv", "run", "--quiet", str(HERE / "extract_overture.py")],
    "eccc": [sys.executable, "-u", str(HERE / "extract_eccc_samples.py")],
}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", default="", help=f"comma-separated subset of: {', '.join(STEPS)}")
    ap.add_argument("--mosaic", default=None, help="DTM mosaic for the HRDEM seam stats (default in the script)")
    args = ap.parse_args()
    out = Path(args.out)
    logs = out / "_logs"
    logs.mkdir(parents=True, exist_ok=True)
    only = [x.strip() for x in args.only.split(",") if x.strip()] or list(STEPS)
    unknown = [x for x in only if x not in STEPS]
    if unknown:
        ap.error(f"unknown step(s): {unknown}")
    if "overture" in only and shutil.which("uv") is None:
        print("!! uv not found: install it (https://docs.astral.sh/uv/) or run extract_overture.py with duckdb installed")

    results = {}
    for name in only:
        cmd = STEPS[name] + ["--out", str(out)]
        if name == "hrdem" and args.mosaic:
            cmd += ["--mosaic", args.mosaic]
        t0 = time.time()
        print(f"== {name}: {' '.join(cmd)}", flush=True)
        with open(logs / f"{name}.log", "w") as log:
            try:
                rc = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT).returncode
            except FileNotFoundError as exc:
                log.write(str(exc))
                rc = 127
        results[name] = rc
        print(f"   exit {rc} in {time.time() - t0:.0f}s (log: {logs / (name + '.log')})", flush=True)

    rc = subprocess.run([sys.executable, str(HERE / "build_extract_manifest.py"), "--out", str(out)]).returncode
    failed = {k: v for k, v in results.items() if v}
    print("summary:", "all steps ok" if not failed else f"failed steps {failed}", "| manifest rc", rc)
    return 1 if failed or rc else 0


if __name__ == "__main__":
    sys.exit(main())
