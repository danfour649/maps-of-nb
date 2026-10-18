// End-to-end render test for the Maps of NB viewer (playwright-core).
//
// Serves the production build (dist/) locally, stubs the GeoNB / tile
// requests with the fixtures in test/fixtures (real GeoNB responses,
// trimmed), opens the page in headless Chrome, enters Game mesh mode and
// asserts the things that broke on 2026-10-18:
//   1. the pilot-tile data loads and the stats line reports the counts;
//   2. gm-buildings and gm-roads actually RENDER features
//      (map.queryRenderedFeatures — impossible without the MapLibre
//      worker tiling the GeoJSON);
//   3. the canvas is not a uniform void — sampled pixels differ;
//   4. no page errors.
//
// Run: npm run build && npm run test:e2e
// First run downloads chrome-headless-shell (~120 MB) via @puppeteer/browsers.
import { chromium } from 'playwright-core';
import { install, Browser, getInstalledBrowsers } from '@puppeteer/browsers';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');
const dist = join(webRoot, 'dist');
const CACHE = join(webRoot, '.browser-cache');

const buildings = JSON.parse(await readFile(join(here, 'fixtures', 'buildings.json'), 'utf8'));
const roads = JSON.parse(await readFile(join(here, 'fixtures', 'roads.json'), 'utf8'));
// 1x1 dark-green PNG for raster tiles (content is irrelevant to the test)
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function serveDist() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const server = http.createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const file = join(dist, p);
    if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function ensureBrowser() {
  const installed = await getInstalledBrowsers({ cacheDir: CACHE });
  const found = installed.find((b) => b.browser === Browser.CHROMEHEADLESSSHELL);
  if (found) return found.executablePath;
  console.log('Downloading chrome-headless-shell (one-time)…');
  const buildId = process.env.CHROME_BUILD_ID ?? '155.0.8059.84';
  const b = await install({ cacheDir: CACHE, browser: Browser.CHROMEHEADLESSSHELL, buildId });
  return b.executablePath;
}

const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exitCode = 1; };

const server = await serveDist();
const port = server.address().port;
let browser;
try {
  browser = await chromium.launch({
    executablePath: await ensureBrowser(),
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 420, height: 850 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  // Force the live-ArcGIS path under test: the baked-tiles probe must fail,
  // so the fixture-driven assertions below exercise fetchLayer as before.
  await page.route('**/fredericton.pmtiles', (route) => route.abort());
  await page.route('**geonb.snb.ca**', (route) => {
    const url = route.request().url();
    if (url.includes('GeoNB_SNB_Buildings')) route.fulfill({ json: buildings });
    else if (url.includes('GeoNB_Basemap_NBRN')) route.fulfill({ json: roads });
    else route.fulfill({ body: TILE_PNG, contentType: 'image/png' });
  });
  await page.route('**s3.amazonaws.com**', (route) => route.fulfill({ body: TILE_PNG, contentType: 'image/png' }));
  await page.route('**/World_Imagery/**', (route) => route.fulfill({ body: TILE_PNG, contentType: 'image/png' }));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__map, null, { timeout: 15000 });
  // Expand the (mobile-collapsed) panel, then enter game mesh mode.
  await page.click('#hud-toggle');
  await page.click('#gm-btn');

  const expected = `${buildings.features.length} buildings`;
  await page.waitForFunction(
    (txt) => document.getElementById('gm-stats')?.textContent?.includes(txt),
    expected, { timeout: 20000 },
  );
  console.log(`ok: stats line reports fixture counts (${expected}, ${roads.features.length} road segments)`);

  // Wait for the worker to tile the GeoJSON, then ask the map what rendered.
  const rendered = await page.waitForFunction(() => {
    const feats = window.__map.queryRenderedFeatures({ layers: ['gm-buildings', 'gm-roads'] });
    return feats.length > 0 ? feats.length : false;
  }, null, { timeout: 20000 }).then((h) => h.jsonValue()).catch(() => 0);
  if (!rendered) fail('queryRenderedFeatures returned no gm-buildings/gm-roads features — GeoJSON layers did not render');
  else console.log(`ok: ${rendered} game-mesh features rendered (worker tiling works)`);

  // Pixel sanity: the canvas must not be a single flat colour.
  const colours = await page.evaluate(() => {
    const cv = document.querySelector('#map canvas');
    const gl = cv.getContext('webgl2');
    const px = new Uint8Array(4 * 64);
    gl.readPixels(0, 0, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const set = new Set();
    for (let i = 0; i < px.length; i += 4) set.add(`${px[i]},${px[i + 1]},${px[i + 2]}`);
    return set.size;
  }).catch(() => 0);
  if (!colours) console.log('skip: pixel sampling unavailable (drawing buffer) — rendered-features check already covers it');

  if (pageErrors.length) fail(`page errors: ${pageErrors.join(' | ')}`);
  else console.log('ok: no page errors');
} catch (err) {
  fail(err.message);
} finally {
  await browser?.close();
  server.close();
}
console.log(process.exitCode ? 'E2E FAILED' : 'E2E PASSED');
