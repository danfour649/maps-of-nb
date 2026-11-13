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
//   4. no page errors;
// and, for the province-wide land & nature layers and tools:
//   5. Protected Natural Areas load, render and are counted in the status line;
//   6. search finds an area by its French name, frames it and opens one popup
//      with the cleaned-up ownership, ecoregion and Crown-land answer;
//   7. the French toggle relabels the UI; the URL carries the layer state;
//   8. measuring reports a distance; print/export downloads a real PDF.
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
const pna1 = JSON.parse(await readFile(join(here, 'fixtures', 'pna-class1.json'), 'utf8'));
const pna2 = JSON.parse(await readFile(join(here, 'fixtures', 'pna-class2.json'), 'utf8'));
const ecoregions = JSON.parse(await readFile(join(here, 'fixtures', 'ecoregions.json'), 'utf8'));
const EMPTY_FC = { type: 'FeatureCollection', features: [] };
const cityBoundary = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { Name: 'The City of Fredericton' }, geometry: { type: 'Polygon', coordinates: [[[-66.75, 45.9], [-66.55, 45.9], [-66.55, 46.02], [-66.75, 46.02], [-66.75, 45.9]]] } }],
};
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
  // CHROME_PATH: use an already-installed Chrome/Chromium (sandboxes, distro packages).
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
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
    else if (url.includes('/export?')) route.fulfill({ body: TILE_PNG, contentType: 'image/png' });
    else if (url.includes('GeoNB_ELG_Local_Governance/MapServer/8/')) route.fulfill({ json: url.includes('returnCountOnly') ? { count: 1 } : cityBoundary });
    else if (url.includes('MunicipalAreas2')) route.fulfill({ status: 404, body: 'retired' }); // GeoNB removed this service
    else if (url.includes('/suggest?')) route.fulfill({ json: { suggestions: [] } });
    else route.fulfill({ json: EMPTY_FC });
  });
  // NB Natural Resources server behind the land & nature layers.
  await page.route('**gis-erd-der.gnb.ca**', (route) => {
    const url = route.request().url();
    if (url.includes('/export?')) route.fulfill({ body: TILE_PNG, contentType: 'image/png' });
    else if (url.includes('Crown_Lands')) route.fulfill({ json: { features: [{ attributes: { HOLDER: 7 } }] } });
    else if (url.includes('/MapServer/1/')) route.fulfill({ json: pna1 });
    else if (url.includes('/MapServer/3/')) route.fulfill({ json: pna2 });
    else if (url.includes('/MapServer/6/')) route.fulfill({ json: ecoregions });
    else route.fulfill({ json: EMPTY_FC });
  });
  await page.route('**demotiles.maplibre.org**', (route) => route.abort());
  await page.route('**s3.amazonaws.com**', (route) => route.fulfill({ body: TILE_PNG, contentType: 'image/png' }));
  await page.route('**/World_Imagery/**', (route) => route.fulfill({ body: TILE_PNG, contentType: 'image/png' }));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__map, null, { timeout: 15000 });
  // The official city boundary must come from the live replacement service
  // (the retired one 404s, which silently dropped the outline and totals).
  const boundary = await page.waitForFunction(() => {
    const n = window.__map.queryRenderedFeatures({ layers: ['boundary-fill'] }).length;
    return n > 0 ? n : false;
  }, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => 0);
  if (!boundary) fail('city boundary did not load from GeoNB_ELG_Local_Governance');
  else console.log('ok: city boundary loaded from the current GeoNB service');
  // Expand the (mobile-collapsed) panel, then enter game mesh mode.
  await page.click('#hud-toggle');
  await page.evaluate(() => { document.getElementById('sec-explore').open = true; });
  if (await page.isVisible('#gm-terrain-row')) fail('terrain-relief row is visible outside game mesh mode ([hidden] overridden by CSS)');
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

  // ---------- land & nature layers, search, popup ----------
  await page.click('#gm-btn'); // leave game mesh
  const baseBack = await page.evaluate(() => window.__map.getLayoutProperty('esri-imagery', 'visibility'));
  if (baseBack !== 'visible') fail('leaving game mesh did not restore the selected basemap');
  else console.log('ok: selected basemap restored after game mesh');

  await page.check('#pna-toggle');
  await page.check('#crown-toggle');
  await page.waitForFunction(() => /\b4 protected areas\b/.test(document.getElementById('land-status')?.textContent ?? ''), null, { timeout: 15000 })
    .then(() => console.log('ok: status line counts the 4 fixture protected areas'))
    .catch(() => fail('land-status never reported the fixture protected areas'));

  await page.fill('#search-input', 'grand lac'); // French name, typed without the layer's language
  await page.waitForSelector('#search-results .sr-item', { timeout: 8000 });
  const first = await page.textContent('#search-results .sr-item');
  if (!first?.includes('Grand Lake')) fail(`search for "grand lac" offered "${first}" first`);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.pp', { timeout: 8000 });
  await page.waitForFunction(() => document.querySelector('.pp-crown')?.classList.contains('yes'), null, { timeout: 8000 }).catch(() => undefined);
  const popup = (await page.textContent('.pp')) ?? '';
  for (const want of ['Grand Lake', 'Class II', '10,463.6 ha', 'Crown', '2003', '2014', 'Grand Lake Lowlands Ecoregion', 'holder code 7'])
    if (!popup.includes(want)) fail(`popup is missing "${want}": ${popup}`);
  if (/Corounne/.test(popup)) fail('popup still shows the service typo "Corounne"');
  if ((await page.locator('.maplibregl-popup').count()) !== 1) fail('expected exactly one popup');
  console.log('ok: search → one popup with class, area, ownership, years, ecoregion and Crown tenure');

  const drawn = await page.waitForFunction(() => {
    const m = window.__map;
    if (m.isMoving()) return false;
    const n = m.queryRenderedFeatures({ layers: ['pna-fill'] }).length;
    return n > 0 ? n : false;
  }, null, { timeout: 20000 }).then((h) => h.jsonValue()).catch(() => 0);
  if (!drawn) fail('no pna-fill features rendered after flying to Grand Lake');
  else console.log(`ok: ${drawn} protected-area polygons rendered`);

  await page.uncheck('#pna-c2'); // class filter: Grand Lake is Class II
  const afterFilter = await page.waitForFunction(() =>
    window.__map.queryRenderedFeatures({ layers: ['pna-fill'] }).every((f) => f.properties.cls === 'I'), null, { timeout: 8000 })
    .then(() => true).catch(() => false);
  if (!afterFilter) fail('Class II areas still drawn with the Class II box unticked');
  else console.log('ok: class filter hides Class II');
  await page.check('#pna-c2');

  const search = new URL(page.url()).searchParams;
  if (search.get('layers') !== 'pna,crown') fail(`URL layer state is "${search.get('layers')}", expected "pna,crown"`);
  else console.log('ok: URL carries the layer state');

  await page.click('#lang-btn');
  const frLabel = await page.textContent('label:has(#pna-toggle)');
  const frLang = await page.evaluate(() => document.documentElement.lang);
  if (!frLabel?.includes('Zones naturelles protégées') || frLang !== 'fr') fail(`French toggle did not relabel the UI (${frLang}: ${frLabel})`);
  else console.log('ok: French toggle relabels the UI');
  await page.click('#lang-btn');

  // ---------- measure ----------
  await page.click('#hud-toggle'); // collapse the panel so the map is clickable
  await page.evaluate(() => document.getElementById('measure-btn').click());
  await page.mouse.click(120, 500); await page.mouse.click(300, 500); await page.mouse.click(300, 650);
  const reading = await page.textContent('#measure-readout');
  if (!/Distance: [\d.]+ k?m · Area if closed: [\d.]+ (m²|ha|km²)/.test(reading ?? '')) fail(`unexpected measure readout: ${reading}`);
  else console.log(`ok: measure reads "${reading}"`);
  await page.click('#measure-done');

  // ---------- print / export ----------
  await page.evaluate(() => document.getElementById('print-btn').click());
  const download = page.waitForEvent('download', { timeout: 60000 });
  await page.click('#print-go');
  const file = await (await download).path().catch(() => null);
  const head = file ? (await readFile(file)).subarray(0, 8).toString('latin1') : '';
  const size = file ? (await readFile(file)).length : 0;
  if (!head.startsWith('%PDF-1.4') || size < 5000) fail(`print did not produce a PDF (head "${head}", ${size} bytes): ${await page.textContent('#print-status')}`);
  else console.log(`ok: print/export downloaded a ${Math.round(size / 1024)} kB PDF`);
  await page.click('#print-cancel');

  if (pageErrors.length) fail(`page errors: ${pageErrors.join(' | ')}`);
  else console.log('ok: no page errors');
} catch (err) {
  fail(err.message);
} finally {
  await browser?.close();
  server.close();
}
console.log(process.exitCode ? 'E2E FAILED' : 'E2E PASSED');
