#!/bin/sh
# One-time setup for the tile-baking environment (kept out of the repo env).
set -e
cd "$(dirname "$0")/.."
python3 -m venv tools/.venv
tools/.venv/bin/pip install -r tools/requirements-bake.txt
echo "bake env ready: tools/.venv"
