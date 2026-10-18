// Build-output regression tests (node:test, no dependencies).
// Guards the 2026-10-18 production bug: the MapLibre worker file was
// missing from dist/assets, so every GeoJSON layer (3D buildings, game
// mesh) silently rendered nothing while raster imagery kept working.
// Run via `npm test` (builds first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(webRoot, 'dist');
const assets = join(dist, 'assets');

test('dist/index.html exists and references a JS bundle', () => {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  assert.match(html, /assets\/index-[^"]+\.js/, 'index.html should load the built bundle');
});

test('MapLibre worker file is emitted next to the bundle', () => {
  const worker = join(assets, 'maplibre-gl-worker.mjs');
  assert.ok(existsSync(worker), 'dist/assets/maplibre-gl-worker.mjs is missing — GeoJSON layers will not render');
  assert.ok(statSync(worker).size > 100_000, 'worker file looks truncated');
});

test('bundle resolves the worker by its unhashed name', () => {
  const bundle = readdirSync(assets).find((f) => /^index-.*\.js$/.test(f));
  assert.ok(bundle, 'bundle not found in dist/assets');
  const js = readFileSync(join(assets, bundle), 'utf8');
  assert.ok(js.includes('maplibre-gl-worker.mjs'), 'bundle does not reference maplibre-gl-worker.mjs');
});
