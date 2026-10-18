#!/usr/bin/env python3
"""List the live GeoNB ArcGIS REST service catalogue.

Hits https://geonb.snb.ca/arcgis/rest/services and prints every service,
flagging the imagery-related ones. Stdlib only — no dependencies.

Usage: python3 scripts/list_geonb_services.py
"""
import json
import urllib.request

REST_ROOT = "https://geonb.snb.ca/arcgis/rest/services"
IMAGERY_KEYWORDS = ("imag", "ortho", "photo", "lidar", "basemap")


def fetch_json(url: str) -> dict:
    # GeoNB's ArcGIS server 403s the default Python user agent — send a normal one.
    req = urllib.request.Request(url, headers={"User-Agent": "maps-of-nb/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def main() -> None:
    root = fetch_json(f"{REST_ROOT}?f=json")
    services = [s["name"] for s in root.get("services", [])]
    print(f"{len(services)} services at {REST_ROOT}\n")

    print("Imagery-related:")
    for name in sorted(services):
        if any(k in name.lower() for k in IMAGERY_KEYWORDS):
            print(f"  {name}")

    for folder in root.get("folders", []):
        sub = fetch_json(f"{REST_ROOT}/{folder}?f=json")
        sub_services = [s["name"] for s in sub.get("services", [])]
        if sub_services:
            print(f"\nFolder {folder}/ ({len(sub_services)}):")
            for name in sorted(sub_services):
                print(f"  {name}")


if __name__ == "__main__":
    main()
