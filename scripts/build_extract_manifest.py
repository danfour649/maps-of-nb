#!/usr/bin/env python3
"""Build MANIFEST.md (+ MANIFEST.json) for an extraction-wave output folder.

Reads every <out>/*/_source.json written by the extract_*.py scripts and renders, per source: URL, licence,
pulled-at, records, and a bytes + sha256 line per file. Files on disk that are not listed in a _source.json
are flagged (so nothing ships unrecorded), and a source's recorded sha256 is re-verified against the file.

Optionally copies the manifest and the small stats files into the repo (--repo-out) — raw extracts stay out of git.

Usage:
    python3 scripts/build_extract_manifest.py --out /mnt/folaDriveB/maps-of-nb-extracts/2026-10-24 \
        --repo-out data/extracts/2026-10-24
"""
import argparse
import json
import shutil
import socket
import sys
from pathlib import Path

import extract_common as ec

DEFERRED = [
    ("City of Fredericton 2023 3D photogrammetry mesh (EagleView, ArcGIS SceneServer `3D_View_Fredericton`)",
     "125.8 GB. Licence unverified (no licence stated; third-party vendor product) - not extracted."),
    ("GeoNB 2023 7.5 cm orthophotos (`GeoNB_SNB_ImageIndex`, 624 one-km tiles)",
     "~92 GB for the whole city. Out of scope for this wave; pull windows on demand via the GeoNB export service."),
]


def human(n: int) -> str:
    if n < 1024:
        return f"{n:,} B"
    for power, unit in enumerate(("KB", "MB", "GB"), start=1):
        if n < 1024 ** (power + 1) or unit == "GB":
            return f"{n / 1024 ** power:.1f} {unit}"


def load_sources(out: Path) -> list:
    srcs = []
    for p in sorted(out.glob(f"*/{ec.SOURCE_FILE}")):
        rec = json.loads(p.read_text())
        rec["_folder"] = p.parent.name
        srcs.append(rec)
    return srcs


def verify(out: Path, rec: dict) -> list:
    problems = []
    listed = {e["file"] for e in rec.get("files", [])}
    for e in rec.get("files", []):
        path = out / rec["_folder"] / e["file"]
        if not path.exists():
            problems.append(f"missing file {e['file']}")
        elif path.stat().st_size != e["bytes"] or ec.sha256_file(path) != e["sha256"]:
            problems.append(f"checksum/size mismatch {e['file']}")
    for path in (out / rec["_folder"]).rglob("*"):
        if path.is_file() and path.name != ec.SOURCE_FILE:
            rel = str(path.relative_to(out / rec["_folder"]))
            if rel not in listed and rec.get("status") != "FAILED":
                problems.append(f"unlisted file {rel}")
    return problems


def render(out: Path, srcs: list) -> str:
    total = sum(e["bytes"] for s in srcs for e in s.get("files", []))
    lines = [
        f"# Full-city extraction wave - {out.name}", "",
        f"Output folder: `{out}` on `{socket.gethostname()}`. Built by `scripts/build_extract_manifest.py` from the "
        "per-source `_source.json` files; checksums re-verified at build time.", "",
        f"{len(srcs)} sources, {sum(len(s.get('files', [])) for s in srcs)} files, {human(total)} total.", "",
        "| Source | Records | Bytes | Status |", "|---|---|---|---|"]
    for s in srcs:
        b = sum(e["bytes"] for e in s.get("files", []))
        rec = s["records"] if not isinstance(s["records"], dict) else ", ".join(
            f"{k} {v}" for k, v in s["records"].items() if not isinstance(v, (dict, list)))
        lines.append(f"| {s['id']} {s['name']} | {rec} | {human(b)} | {s.get('status', 'ok')} |")
    for s in srcs:
        lines += ["", f"## {s['id']} - {s['name']}", "",
                  f"- **Source:** {s['url']}", f"- **Licence:** {s['licence']}", f"- **Pulled at:** {s['pulled_at']}",
                  f"- **Folder:** `{s['_folder']}/`"]
        if s.get("status") == "FAILED":
            lines.append(f"- **FAILED:** {s.get('error')}")
        else:
            rec = s["records"]
            lines.append(f"- **Records:** {json.dumps(rec) if isinstance(rec, dict) else rec}")
            if s.get("notes"):
                lines.append(f"- **Notes:** {s['notes']}")
            lines += ["", "| File | Bytes | sha256 |", "|---|---|---|"]
            lines += [f"| `{e['file']}` | {e['bytes']:,} | `{e['sha256']}` |" for e in s["files"]]
    lines += ["", "## Deferred (not extracted)", ""]
    lines += [f"- **{name}** - {why}" for name, why in DEFERRED]
    lines += ["", "## Re-running", "", "See `docs/data-extracts.md` in the maps-of-nb repo; "
              "`scripts/run_extract_wave.py --out <dir>` runs every extractor and rebuilds this manifest.", ""]
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--repo-out", default=None, help="copy MANIFEST.md/json + small stats files here (committed)")
    args = ap.parse_args()
    out = Path(args.out)
    srcs = load_sources(out)
    if not srcs:
        print("no _source.json files found", file=sys.stderr)
        return 1
    bad = {s["id"]: verify(out, s) for s in srcs}
    bad = {k: v for k, v in bad.items() if v}
    (out / "MANIFEST.md").write_text(render(out, srcs))
    ec.write_json(out / "MANIFEST.json", {"folder": str(out), "sources": [
        {k: v for k, v in s.items() if k != "_folder"} | {"folder": s["_folder"]} for s in srcs]})
    print(f"wrote {out / 'MANIFEST.md'} ({len(srcs)} sources)")
    for sid, probs in bad.items():
        print(f"  !! {sid}: {'; '.join(probs)}")
    if args.repo_out:
        dest = Path(args.repo_out)
        dest.mkdir(parents=True, exist_ok=True)
        shutil.copy(out / "MANIFEST.md", dest / "MANIFEST.md")
        shutil.copy(out / "MANIFEST.json", dest / "MANIFEST.json")
        for stats in out.glob("*/*_stats.json"):
            shutil.copy(stats, dest / stats.name)
        print(f"copied manifest + stats to {dest}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
