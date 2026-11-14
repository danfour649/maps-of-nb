import * as maplibregl from 'maplibre-gl';
import { Protocol, PMTiles } from 'pmtiles';
import { featKey, osmToGeojson, centroids, matchPct } from './geo';
import { t, getLang, setLang, detectLang, onLang, locale, TOUR_TEXT } from './i18n';
import { parseState, writeState, LAYER_KEYS, type BaseKey, type LayerKey } from './urlstate';
import { initProtected, type ProtectedApi, type LandKey } from './protected';
import { initSearch } from './search';
import { initMeasure } from './measure';
import { initPrint } from './print';
import { initCatalog, sampleElevations, OVERLAY_KEYS, type CatalogApi } from './catalog';

// Baked vector tiles (scripts/bake_tiles.py) served as a static archive.
// When reachable, the heavy layers render from tiles; otherwise the viewer
// falls back to live ArcGIS queries (paged + cell-cached fetchLayer below).
// Same-origin static asset (web/public/fredericton.pmtiles, deployed by
// Vercel): GitHub release assets don't send CORS headers, so the release
// copy (tag tiles-v1) is the human/game download, not the viewer's source.
const TILES_URL = '/fredericton.pmtiles';
const TILES_HAS_CONTOURS = true; // flips true when the v2 bake adds the contours layer
let tilesOn = false;
{
  const proto = new Protocol();
  maplibregl.addProtocol('pmtiles', proto.tile);
}
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

const ARCGIS = 'https://geonb.snb.ca/arcgis/rest/services';
const exportTile = (service: string, transparent: boolean) =>
  `${ARCGIS}/${service}/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857` +
  `&size=256,256&format=png32&transparent=${transparent}&dpi=96&f=image`;

const VIEWS: Record<string, { center: [number, number]; zoom: number }> = {
  downtown: { center: [-66.6431, 45.9636], zoom: 15.5 },
  unb: { center: [-66.6450, 45.9445], zoom: 14.5 },
  northside: { center: [-66.6285, 45.9789], zoom: 14.5 },
  city: { center: [-66.66, 45.96], zoom: 12 },
};
// The default framing (Daniel's ruling, 2026-11-14): the province with its
// neighbours around it — Maine, Nova Scotia, PEI and the Gulf in shot, the
// way his phone screenshot of the McFam embed framed it — not a tight fit
// to the province's own bounds ([-69.1, 44.55]–[-63.7, 48.1]), which runs
// it edge to edge. Those bounds expanded by ~1.3° of longitude and ~0.7°
// of latitude a side; fitBounds scales the frame to whatever screen (or
// McFam iframe) the map opens in, so the framing holds on a phone and on
// a desktop alike. Centred on [-66.4, ~46.4].
const PROVINCE_FRAME: [[number, number], [number, number]] = [[-70.4, 43.9], [-62.4, 48.9]];

{
  let saved: string | null = null;
  try { saved = localStorage.getItem('lang'); } catch { /* private mode */ }
  setLang(detectLang(location.search, saved, navigator.language));
}

const style: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    'geonb-imagery': {
      type: 'raster', tileSize: 256, maxzoom: 18,
      tiles: [exportTile('GeoNB_Basemap_Imagery', false)],
      attribution: 'Imagery © GeoNB / Service New Brunswick',
    },
    'geonb-topo': {
      type: 'raster', tileSize: 256, maxzoom: 18,
      tiles: [exportTile('GeoNB_Basemap_Topo', false)],
      attribution: 'Basemap © GeoNB / Service New Brunswick',
    },
    'geonb-grey': {
      type: 'raster', tileSize: 256, maxzoom: 18,
      tiles: [exportTile('GeoNB_Basemap_Grey', false)],
      attribution: 'Basemap © GeoNB / Service New Brunswick',
    },
    'esri-imagery': {
      type: 'raster', tileSize: 256, maxzoom: 18,
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    },
    'geonb-imagery-year': {
      type: 'raster', tileSize: 256, maxzoom: 18,
      tiles: [exportTile('GeoNB_SNB_ImageryYear', true)],
      attribution: 'Imagery year © GeoNB',
    },
    'geonb-buildings': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    'nbtiles': { type: 'vector', url: 'pmtiles://' + TILES_URL },
    'gm-buildings': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    'city-boundary': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    'cmp-osm-buildings': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    'cmp-osm-roads': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    'cmp-geonb-buildings': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    'cmp-geonb-roads': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    'geonb-contours': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    'geonb-wetlands': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    'terrarium-dem': {
      type: 'raster-dem', tileSize: 256, maxzoom: 15,
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      attribution: 'Terrain: Mapzen / open elevation data (preview — the game gets GeoNB LiDAR)',
    },
    'gm-roads': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  },
  layers: [
    { id: 'geonb-imagery', type: 'raster', source: 'geonb-imagery', layout: { visibility: 'none' } },
    { id: 'geonb-topo', type: 'raster', source: 'geonb-topo', layout: { visibility: 'none' } },
    { id: 'geonb-grey', type: 'raster', source: 'geonb-grey', layout: { visibility: 'none' } },
    { id: 'esri-imagery', type: 'raster', source: 'esri-imagery', layout: { visibility: 'visible' } },
    {
      id: 'geonb-imagery-year', type: 'raster', source: 'geonb-imagery-year',
      layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.55 },
    },
    {
      id: 'buildings-3d', type: 'fill-extrusion', source: 'geonb-buildings',
      layout: { visibility: 'none' },
      paint: {
        'fill-extrusion-height': ['max', ['-', ['get', 'max_b_elev'], ['get', 'min_g_elev']], 0],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.85,
        'fill-extrusion-color': [
          'interpolate', ['linear'], ['-', ['get', 'max_b_elev'], ['get', 'min_g_elev']],
          0, '#7fa6bd', 8, '#c9a86a', 18, '#d96f3c', 30, '#b83a2a',
        ],
      },
    },
    {
      id: 't-buildings-3d', type: 'fill-extrusion', source: 'nbtiles', 'source-layer': 'buildings',
      layout: { visibility: 'none' },
      paint: {
        'fill-extrusion-height': ['max', ['-', ['get', 'max_b_elev'], ['get', 'min_g_elev']], 0],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.85,
        'fill-extrusion-color': [
          'interpolate', ['linear'], ['-', ['get', 'max_b_elev'], ['get', 'min_g_elev']],
          0, '#7fa6bd', 8, '#c9a86a', 18, '#d96f3c', 30, '#b83a2a',
        ],
      },
    },
    {
      id: 't-gm-buildings', type: 'fill-extrusion', source: 'nbtiles', 'source-layer': 'buildings',
      layout: { visibility: 'none' },
      paint: {
        'fill-extrusion-height': ['max', ['-', ['get', 'max_b_elev'], ['get', 'min_g_elev']], 0],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.92,
        'fill-extrusion-color': [
          'interpolate', ['linear'], ['-', ['get', 'max_b_elev'], ['get', 'min_g_elev']],
          0, '#3d5a73', 8, '#8a6f4d', 18, '#c65a2e', 30, '#e03a1e',
        ],
      },
    },
    {
      id: 't-gm-roads', type: 'line', source: 'nbtiles', 'source-layer': 'roads',
      layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#ffb454',
        'line-width': ['interpolate', ['linear'], ['coalesce', ['get', 'Number_Of_Lanes'], 2], 1, 1.5, 2, 2.5, 4, 5, 6, 7],
        'line-opacity': 0.95,
      },
    },
    {
      id: 't-wetlands-fill', type: 'fill', source: 'nbtiles', 'source-layer': 'wetlands',
      layout: { visibility: 'none' }, paint: { 'fill-color': '#3f9d63', 'fill-opacity': 0.4 },
    },
    {
      id: 't-wetlands-line', type: 'line', source: 'nbtiles', 'source-layer': 'wetlands',
      layout: { visibility: 'none' }, paint: { 'line-color': '#2e7d4f', 'line-width': 1.2 },
    },
    {
      id: 't-contours-line', type: 'line', source: 'nbtiles', 'source-layer': 'contours',
      layout: { visibility: 'none' }, minzoom: 12.5,
      paint: { 'line-color': '#c9a86a', 'line-width': 1, 'line-opacity': 0.85 },
    },
    {
      id: 't-contours-label', type: 'symbol', source: 'nbtiles', 'source-layer': 'contours',
      layout: {
        visibility: 'none', 'symbol-placement': 'line',
        'text-field': ['concat', ['to-string', ['get', 'Contour']], ' m'],
        'text-size': 10, 'text-font': ['Noto Sans Regular'],
      },
      minzoom: 13.5,
      paint: { 'text-color': '#e8d5a8', 'text-halo-color': 'rgba(20,16,8,0.85)', 'text-halo-width': 1.2 },
    },
    {
      id: 'boundary-fill', type: 'fill', source: 'city-boundary',
      paint: { 'fill-color': '#7fd0ff', 'fill-opacity': 0.045 },
    },
    {
      id: 'boundary-line', type: 'line', source: 'city-boundary',
      paint: { 'line-color': '#7fd0ff', 'line-width': 1.6, 'line-dasharray': [2, 1.2], 'line-opacity': 0.85 },
    },
    {
      id: 'wetlands-fill', type: 'fill', source: 'geonb-wetlands', layout: { visibility: 'none' },
      paint: { 'fill-color': '#3f9d63', 'fill-opacity': 0.4 },
    },
    {
      id: 'wetlands-line', type: 'line', source: 'geonb-wetlands', layout: { visibility: 'none' },
      paint: { 'line-color': '#2e7d4f', 'line-width': 1.2 },
    },
    {
      id: 'contours-line', type: 'line', source: 'geonb-contours', layout: { visibility: 'none' },
      paint: { 'line-color': '#c9a86a', 'line-width': 1, 'line-opacity': 0.85 },
    },
    {
      id: 'contours-label', type: 'symbol', source: 'geonb-contours', layout: {
        visibility: 'none', 'symbol-placement': 'line',
        'text-field': ['concat', ['to-string', ['get', 'Contour']], ' m'],
        'text-size': 10, 'text-font': ['Noto Sans Regular'],
      },
      paint: { 'text-color': '#e8d5a8', 'text-halo-color': 'rgba(20,16,8,0.85)', 'text-halo-width': 1.2 },
    },
    {
      id: 'cmp-geonb-roads', type: 'line', source: 'cmp-geonb-roads', layout: { visibility: 'none' },
      paint: { 'line-color': '#4fc3f7', 'line-width': 2.5 },
    },
    {
      id: 'cmp-osm-roads', type: 'line', source: 'cmp-osm-roads', layout: { visibility: 'none' },
      paint: { 'line-color': '#ff9f43', 'line-width': 2, 'line-dasharray': [1.6, 1] },
    },
    {
      id: 'cmp-geonb-buildings', type: 'line', source: 'cmp-geonb-buildings', layout: { visibility: 'none' },
      paint: { 'line-color': '#4fc3f7', 'line-width': 1.8 },
    },
    {
      id: 'cmp-osm-buildings', type: 'fill', source: 'cmp-osm-buildings', layout: { visibility: 'none' },
      paint: { 'fill-color': '#ff9f43', 'fill-opacity': 0.4 },
    },
    { id: 'gm-bg', type: 'background', layout: { visibility: 'none' }, paint: { 'background-color': '#0b0f14' } },
    {
      id: 'gm-hillshade', type: 'hillshade', source: 'terrarium-dem',
      layout: { visibility: 'none' },
      paint: { 'hillshade-shadow-color': '#000000', 'hillshade-exaggeration': 0.6, 'hillshade-highlight-color': '#3a4a5a' },
    },
    {
      id: 'gm-roads', type: 'line', source: 'gm-roads', layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#ffb454',
        'line-width': ['interpolate', ['linear'], ['coalesce', ['get', 'Number_Of_Lanes'], 2], 1, 1.5, 2, 2.5, 4, 5, 6, 7],
        'line-opacity': 0.95,
      },
    },
    {
      id: 'gm-buildings', type: 'fill-extrusion', source: 'gm-buildings', layout: { visibility: 'none' },
      paint: {
        'fill-extrusion-height': ['max', ['-', ['get', 'max_b_elev'], ['get', 'min_g_elev']], 0],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.92,
        'fill-extrusion-color': [
          'interpolate', ['linear'], ['-', ['get', 'max_b_elev'], ['get', 'min_g_elev']],
          0, '#3d5a73', 8, '#8a6f4d', 18, '#c65a2e', 30, '#e03a1e',
        ],
      },
    },
  ],
};

// A URL hash (#zoom/lat/lng…) is an explicit position — a shared link or the
// McFam embed's old deep link — and MapLibre's hash handling honours it over
// the constructor view. With no hash the map opens on the default framing:
// the whole province, survey system up (DEFAULT_STATE in urlstate.ts).
const hasHashPosition = /^#\d/.test(location.hash);
const map = new maplibregl.Map({
  container: 'map',
  style,
  ...(hasHashPosition
    ? { center: VIEWS.downtown.center, zoom: VIEWS.downtown.zoom }
    : { bounds: PROVINCE_FRAME, fitBoundsOptions: { padding: 24 } }),
  hash: true,
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
// Test hook: integration tests drive the live map instance.
(window as unknown as { __map?: maplibregl.Map }).__map = map;
// Top-right: the control panel owns the left edge on short screens.
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'top-right');

map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), 'bottom-right');

// Cursor coordinates (centre of the view on touch devices, which have no cursor).
{
  const el = document.createElement('div');
  el.className = 'maplibregl-ctrl coords-ctrl';
  const show = (lng: number, lat: number) => { el.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)} · z${map.getZoom().toFixed(1)}`; };
  map.addControl({ onAdd: () => el, onRemove: () => el.remove() }, 'top-right');
  map.on('mousemove', (e) => show(e.lngLat.lng, e.lngLat.lat));
  map.on('move', () => { if (!matchMedia('(hover: hover)').matches) { const c = map.getCenter(); show(c.lng, c.lat); } });
  const c = map.getCenter(); show(c.lng, c.lat);
}

// ---------- Basemap + imagery-year: one place decides what the rasters show ----------
// (Leaving game-mesh mode used to force GeoNB imagery on regardless of the
// selected basemap, and left the year overlay off while its box stayed ticked.)
const BASE_LAYER: Record<BaseKey, string> = { esri: 'esri-imagery', geonb: 'geonb-imagery', topo: 'geonb-topo', grey: 'geonb-grey' };
let currentBase: BaseKey = 'esri';
let yearOn = false;
function syncBasemap() {
  for (const [key, id] of Object.entries(BASE_LAYER))
    map.setLayoutProperty(id, 'visibility', !gmOn && key === currentBase ? 'visible' : 'none');
  map.setLayoutProperty('geonb-imagery-year', 'visibility', !gmOn && yearOn ? 'visible' : 'none');
  document.querySelectorAll<HTMLButtonElement>('#basemap-seg button')
    .forEach((b) => b.classList.toggle('on', b.dataset.base === currentBase));
}
document.querySelectorAll<HTMLButtonElement>('#basemap-seg button').forEach((btn) => {
  btn.addEventListener('click', () => { currentBase = btn.dataset.base as BaseKey; syncBasemap(); saveState(); });
});

document.getElementById('year-toggle')?.addEventListener('change', (e) => {
  yearOn = (e.target as HTMLInputElement).checked;
  syncBasemap();
});

document.querySelectorAll<HTMLButtonElement>('#views button').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.view === 'city' && cityBounds) {
      stopTour();
      map.fitBounds(cityBounds, { padding: 30, duration: 1600 });
      return;
    }
    if (btn.dataset.view === 'province') {
      stopTour();
      map.fitBounds(PROVINCE_FRAME, { padding: 24, pitch: 0, bearing: 0, duration: 1800 });
      return;
    }
    const v = VIEWS[btn.dataset.view!];
    if (v) { stopTour(); map.flyTo({ center: v.center, zoom: v.zoom, pitch: 0, duration: 1600 }); }
  });
});

// ---------- Shared ArcGIS vector loading: paging + grid-cell cache ----------
// GeoNB caps every response at 1,000-2,000 features and flags the overflow
// with properties.exceededTransferLimit. The first loaders ignored the flag,
// so dense viewports silently lost most features (a zoom-13 view of the city
// holds ~18k buildings; the service hands back 2,000). fetchLayer() pages
// until the flag clears and caches per fixed grid cell, so panning back to
// a visited area costs no requests. Pre-baked PMTiles are the planned
// successor; this keeps the live-ArcGIS path honest until then.
const PAGE_SIZE = 1000;
const CELL_DEG = 0.02;
type FColl = { type: 'FeatureCollection'; features: any[] };
const cellCache = new Map<string, Map<string, any[]>>();
const cellInflight = new Map<string, Promise<any[]>>();


async function fetchCellFeatures(
  service: string, layer: number, fields: string, orderField: string,
  env: [number, number, number, number],
): Promise<any[]> {
  const out: any[] = [];
  let offset = 0;
  for (;;) {
    const q = new URLSearchParams({
      where: '1=1', geometry: env.join(','), geometryType: 'esriGeometryEnvelope',
      inSR: '4326', outSR: '4326', outFields: fields, returnGeometry: 'true',
      f: 'geojson', resultRecordCount: String(PAGE_SIZE),
      resultOffset: String(offset), orderByFields: orderField,
    });
    const resp = await fetch(`${ARCGIS}/${service}/MapServer/${layer}/query?${q}`);
    if (!resp.ok) throw new Error('arcgis ' + resp.status);
    const gj = await resp.json();
    const batch = gj.features ?? [];
    out.push(...batch);
    if (!gj.properties?.exceededTransferLimit || batch.length === 0) break;
    offset += batch.length;
    if (offset > 60000) break; // sanity stop; cells are ~2 km across
  }
  return out;
}

async function fetchLayer(
  service: string, layer: number, fields: string, orderField: string,
  bounds: { getWest(): number; getSouth(): number; getEast(): number; getNorth(): number },
): Promise<FColl> {
  const cacheKey = `${service}/${layer}/${fields}`;
  let cells = cellCache.get(cacheKey);
  if (!cells) { cells = new Map(); cellCache.set(cacheKey, cells); }
  const i0 = Math.floor(bounds.getWest() / CELL_DEG), i1 = Math.floor(bounds.getEast() / CELL_DEG);
  const j0 = Math.floor(bounds.getSouth() / CELL_DEG), j1 = Math.floor(bounds.getNorth() / CELL_DEG);
  const jobs: Promise<void>[] = [];
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const key = `${i},${j}`;
      if (cells.has(key)) continue;
      let p = cellInflight.get(cacheKey + '|' + key);
      if (!p) {
        const env: [number, number, number, number] =
          [i * CELL_DEG, j * CELL_DEG, (i + 1) * CELL_DEG, (j + 1) * CELL_DEG];
        p = fetchCellFeatures(service, layer, fields, orderField, env)
          .then((feats) => { cells!.set(key, feats); return feats; })
          .finally(() => cellInflight.delete(cacheKey + '|' + key));
        cellInflight.set(cacheKey + '|' + key, p);
      }
      jobs.push(p.then(() => undefined));
    }
  }
  await Promise.all(jobs);
  const seen = new Set<string>();
  const features: any[] = [];
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      for (const f of cells.get(`${i},${j}`) ?? []) {
        const k = featKey(f);
        if (seen.has(k)) continue;
        seen.add(k);
        features.push(f);
      }
    }
  }
  return { type: 'FeatureCollection', features };
}

// ---------- 3D buildings from GeoNB's LiDAR-derived footprints ----------
const hint = document.getElementById('b3d-hint');
let buildingsOn = false;
let fetchTimer: number | undefined;

async function refreshBuildings() {
  if (!buildingsOn || tilesOn) return;
  if (map.getZoom() < 14.5) {
    (map.getSource('geonb-buildings') as maplibregl.GeoJSONSource)
      .setData({ type: 'FeatureCollection', features: [] });
    if (hint) hint.textContent = t('b3d.zoom');
    return;
  }
  if (hint) hint.textContent = '';
  const token = ++buildingsToken;
  try {
    const gj = await fetchLayer('GeoNB_SNB_Buildings', 0, 'min_g_elev,max_b_elev', 'OBJECTID_1', map.getBounds());
    if (token !== buildingsToken || !buildingsOn) return; // a newer pan superseded this load
    (map.getSource('geonb-buildings') as maplibregl.GeoJSONSource).setData(gj);
  } catch { /* keep last data on transient errors */ }
}
let buildingsToken = 0;

document.getElementById('b3d-toggle')?.addEventListener('change', (e) => {
  buildingsOn = (e.target as HTMLInputElement).checked;
  map.setLayoutProperty('buildings-3d', 'visibility', buildingsOn ? 'visible' : 'none');
  syncTilesVisibility();
  if (buildingsOn) {
    if (!restoring) map.easeTo({ pitch: 55, duration: 1200 }); // a shared link carries its own pitch
    refreshBuildings();
  } else {
    map.easeTo({ pitch: 0, duration: 1200 });
    if (hint) hint.textContent = '';
  }
});
map.on('moveend', () => {
  window.clearTimeout(fetchTimer);
  fetchTimer = window.setTimeout(refreshBuildings, 500);
});

// ---------- Fredericton landmark tour ----------
// Copy for each stop lives in i18n.ts (TOUR_TEXT), in both languages, same order.
type Stop = { center: [number, number]; zoom: number; pitch: number; bearing: number };
const STOPS: Stop[] = [
  {
    center: [-66.6357, 45.9590], zoom: 16.5, pitch: 55, bearing: -20,
  },
  {
    center: [-66.6353, 45.9573], zoom: 16.5, pitch: 55, bearing: 30,
  },
  {
    center: [-66.6374, 45.9601], zoom: 16.5, pitch: 50, bearing: -35,
  },
  {
    center: [-66.6416, 45.9622], zoom: 16.5, pitch: 55, bearing: 15,
  },
  {
    center: [-66.6418, 45.9652], zoom: 15.5, pitch: 45, bearing: -60,
  },
  {
    center: [-66.6298, 45.9560], zoom: 15.5, pitch: 45, bearing: 70,
  },
  {
    center: [-66.6413, 45.9482], zoom: 15.5, pitch: 50, bearing: -25,
  },
];

const caption = document.getElementById('caption')!;
const captionTitle = document.getElementById('caption-title')!;
const captionBody = document.getElementById('caption-body')!;
const tourBtn = document.getElementById('tour-btn') as HTMLButtonElement;
let tourTimers: number[] = [];
let touring = false;

function stopTour() {
  tourTimers.forEach((t) => window.clearTimeout(t));
  tourTimers = [];
  touring = false;
  caption.hidden = true;
  tourBtn.textContent = t('tour.start');
  tourBtn.classList.remove('stop');
}

function startTour() {
  stopTour();
  touring = true;
  tourBtn.textContent = t('tour.stop');
  tourBtn.classList.add('stop');
  const STEP_MS = 7000;
  STOPS.forEach((stop, i) => {
    tourTimers.push(window.setTimeout(() => {
      const text = TOUR_TEXT[getLang()][i];
      captionTitle.textContent = text.name;
      captionBody.textContent = text.body;
      caption.hidden = false;
      map.flyTo({ center: stop.center, zoom: stop.zoom, pitch: stop.pitch, bearing: stop.bearing, duration: 3000 });
    }, i * STEP_MS));
  });
  tourTimers.push(window.setTimeout(stopTour, STOPS.length * STEP_MS + 1500));
}

tourBtn.addEventListener('click', () => (touring ? stopTour() : startTour()));
map.on('mousedown', () => { if (touring) stopTour(); });
map.on('touchstart', () => { if (touring) stopTour(); });

// ---------- City boundary (official local-government polygons, Jan 2023) ----------
// GeoNB retired GeoNB_ELG_MunicipalAreas2 (it 404s), which silently dropped the
// boundary outline, the true "Whole city" fit and the citywide totals. The same
// polygons are served from GeoNB_ELG_Local_Governance, layer 8 (large scale).
let cityTotals: { buildings: number; roads: number } | null = null;
async function loadBoundary() {
  try {
    const q = new URLSearchParams({
      where: "Name='The City of Fredericton'", outFields: 'Name,Type',
      returnGeometry: 'true', outSR: '4326', f: 'geojson', geometryPrecision: '5',
    });
    const resp = await fetch(`${ARCGIS}/GeoNB_ELG_Local_Governance/MapServer/8/query?${q}`);
    if (!resp.ok) throw new Error('boundary ' + resp.status);
    const gj = await resp.json();
    (map.getSource('city-boundary') as maplibregl.GeoJSONSource).setData(gj);
    // "Whole city" fits the real boundary, not a guessed bbox.
    const coords: number[][] = [];
    const walk = (c: unknown) => {
      if (Array.isArray(c) && typeof c[0] === 'number') coords.push(c as number[]);
      else if (Array.isArray(c)) c.forEach(walk);
    };
    walk(gj.features?.[0]?.geometry?.coordinates);
    if (coords.length) {
      const xs = coords.map((c) => c[0]); const ys = coords.map((c) => c[1]);
      cityBounds = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
    }
    // Citywide totals (POST — the polygon is too large for a GET URL).
    try {
      const rings = gj.features[0].geometry.coordinates;
      const poly = JSON.stringify({ rings, spatialReference: { wkid: 4326 } });
      const count = async (service: string, layer: number) => {
        const body = new URLSearchParams({
          where: '1=1', geometry: poly, geometryType: 'esriGeometryPolygon',
          inSR: '4326', spatialRel: 'esriSpatialRelIntersects', returnCountOnly: 'true', f: 'json',
        });
        const r = await fetch(`${ARCGIS}/${service}/MapServer/${layer}/query`, { method: 'POST', body });
        const j = await r.json();
        return typeof j.count === 'number' ? j.count : null;
      };
      const [b, r] = await Promise.all([
        count('GeoNB_SNB_Buildings', 0), count('GeoNB_Basemap_NBRN', 1),
      ]);
      if (b !== null && r !== null) cityTotals = { buildings: b, roads: r };
    } catch { /* totals are decorative; the mesh does not depend on them */ }
  } catch { /* boundary is decorative; the map works without it */ }
}
let cityBounds: [[number, number], [number, number]] | null = null;
map.on('load', loadBoundary);

// ---------- Game mesh explorer (GTA Fredericton mesh, city-wide) ----------
// Same export layers scripts/extract_game_mesh.py produces in batch
// (buildings + roads), loaded per-viewport inside the city boundary.
const gmBtn = document.getElementById('gm-btn') as HTMLButtonElement;
const gmStats = document.getElementById('gm-stats')!;
let gmOn = false;
let gmLoading = false;

async function gmFetch(service: string, layer: number, fields: string, _bbox: string) {
  const order = service.includes('Buildings') ? 'OBJECTID_1' : 'OBJECTID';
  return fetchLayer(service, layer, fields, order, map.getBounds());
}

function cityTotalsText() {
  return cityTotals
    ? t('gm.totals', { b: cityTotals.buildings.toLocaleString(locale()), r: cityTotals.roads.toLocaleString(locale()) })
    : '';
}

let gmToken = 0;
async function loadGmViewport() {
  if (!gmOn || gmLoading) return;
  const token = ++gmToken;
  if (map.getZoom() < 13) {
    if (!tilesOn) {
      (map.getSource('gm-buildings') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: [] });
      (map.getSource('gm-roads') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: [] });
    }
    gmStats.textContent = t('gm.zoom') + cityTotalsText();
    return;
  }
  if (tilesOn) {
    window.setTimeout(() => {
      if (!gmOn) return;
      let b = 0, r = 0;
      try {
        b = map.queryRenderedFeatures({ layers: ['t-gm-buildings'] }).length;
        r = map.queryRenderedFeatures({ layers: ['t-gm-roads'] }).length;
      } catch { /* layers not ready yet */ }
      gmStats.innerHTML = t('gm.inview', { b, r, src: t('gm.baked') }) + cityTotalsText() + t('gm.pipeline');
    }, 800);
    return;
  }
  gmLoading = true;
  try {
    const b = map.getBounds();
    const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
    const [bj, rj] = await Promise.all([
      gmFetch('GeoNB_SNB_Buildings', 0, 'min_g_elev,max_b_elev', bbox),
      gmFetch('GeoNB_Basemap_NBRN', 1, 'Number_Of_Lanes,Route_Name_English_1', bbox),
    ]);
    if (token !== gmToken) return; // superseded by a newer pan
    (map.getSource('gm-buildings') as maplibregl.GeoJSONSource).setData(bj);
    (map.getSource('gm-roads') as maplibregl.GeoJSONSource).setData(rj);
    gmStats.innerHTML = t('gm.inview', { b: bj.features?.length ?? 0, r: rj.features?.length ?? 0, src: '' }) +
      cityTotalsText() + t('gm.pipeline');
  } catch {
    gmStats.textContent = t('gm.retry');
  } finally {
    gmLoading = false;
  }
}
let gmDebounce: ReturnType<typeof setTimeout> | undefined;
map.on('moveend', () => {
  if (!gmOn) return;
  clearTimeout(gmDebounce);
  gmDebounce = setTimeout(loadGmViewport, 350);
});

gmBtn.addEventListener('click', async () => {
  gmOn = !gmOn;
  gmBtn.classList.toggle('on', gmOn);
  gmBtn.textContent = t(gmOn ? 'gm.exit' : 'gm.enter');
  syncBasemap();
  map.setLayoutProperty('gm-bg', 'visibility', gmOn ? 'visible' : 'none');
  const gmTerrain = document.getElementById('gm-terrain') as HTMLInputElement;
  const relief = gmOn && gmTerrain.checked;
  map.setLayoutProperty('gm-hillshade', 'visibility', relief ? 'visible' : 'none');
  map.setTerrain(relief ? { source: 'terrarium-dem', exaggeration: 1.3 } : null);
  (document.getElementById('gm-terrain-row') as HTMLElement).hidden = !gmOn;
  map.setLayoutProperty('gm-roads', 'visibility', gmOn ? 'visible' : 'none');
  map.setLayoutProperty('gm-buildings', 'visibility', gmOn ? 'visible' : 'none');
  gmStats.hidden = !gmOn;
  syncTilesVisibility();
  if (gmOn) {
    stopTour();
    gmStats.textContent = t('gm.loading');
    map.flyTo({ center: [-66.6400, 45.9625], zoom: 15.2, pitch: 60, bearing: -25, duration: 1800 });
    setTimeout(loadGmViewport, 2000);
  } else {
    map.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
  }
});

// ---------- Collapsible control panel (mobile) ----------
const hud = document.getElementById('hud')!;
const hudToggle = document.getElementById('hud-toggle') as HTMLButtonElement;
function setHudCollapsed(collapsed: boolean) {
  hud.classList.toggle('collapsed', collapsed);
  hudToggle.setAttribute('aria-expanded', String(!collapsed));
}
hudToggle.addEventListener('click', () =>
  setHudCollapsed(!hud.classList.contains('collapsed')));
if (window.innerWidth <= 560) setHudCollapsed(true);
// Short laptop screens: start with the Fredericton extras folded so the tools stay in view.
if (window.innerHeight < 860) document.getElementById('sec-explore')?.removeAttribute('open');

document.getElementById('gm-terrain')!.addEventListener('change', (e) => {
  const on = (e.target as HTMLInputElement).checked && gmOn;
  map.setLayoutProperty('gm-hillshade', 'visibility', on ? 'visible' : 'none');
  map.setTerrain(on ? { source: 'terrarium-dem', exaggeration: 1.3 } : null);
});

// ---------- OSM comparison overlay ----------
// GeoNB (blue) vs OpenStreetMap (orange) for the current viewport, with a
// centroid-match overlap figure — the numbers behind docs/osm-geonb-overlap.md.
const cmpBtn = document.getElementById('cmp-btn') as HTMLButtonElement;
const cmpStats = document.getElementById('cmp-stats')!;
let cmpOn = false;
let cmpLoading = false;




let cmpToken = 0;
async function loadCompare() {
  if (!cmpOn || cmpLoading) return;
  (loadCompare as any)._t = ++cmpToken;
  if (map.getZoom() < 13) {
    cmpStats.textContent = t('cmp.zoom');
    return;
  }
  cmpLoading = true;
  cmpStats.textContent = t('cmp.fetching');
  try {
    const b = map.getBounds();
    const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
    const [gb, gr] = await Promise.all([
      gmFetch('GeoNB_SNB_Buildings', 0, 'min_g_elev,max_b_elev', bbox),
      gmFetch('GeoNB_Basemap_NBRN', 1, 'Number_Of_Lanes,Formatted_Street_Name', bbox),
    ]);
    const q = `[out:json][timeout:60];(way["building"](${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()});way["highway"](${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}););out geom;`;
    const oresp = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: 'data=' + encodeURIComponent(q),
    });
    if (!oresp.ok) throw new Error('overpass busy');
    const oj = await oresp.json();
    const ob = osmToGeojson(oj.elements.filter((e: any) => e.tags?.building), 'building');
    const oroads = osmToGeojson(oj.elements.filter((e: any) => e.tags?.highway), 'road');
    // A newer pan superseded this load: drop it before it paints stale data.
    if ((loadCompare as any)._t !== cmpToken) return;
    (map.getSource('cmp-geonb-buildings') as maplibregl.GeoJSONSource).setData(gb);
    (map.getSource('cmp-geonb-roads') as maplibregl.GeoJSONSource).setData(gr);
    (map.getSource('cmp-osm-buildings') as maplibregl.GeoJSONSource).setData(ob);
    (map.getSource('cmp-osm-roads') as maplibregl.GeoJSONSource).setData(oroads);
    const g2o = matchPct(centroids(gb), centroids(ob), 15);
    const o2g = matchPct(centroids(ob), centroids(gb), 15);
    cmpStats.innerHTML = t('cmp.result', {
      gb: gb.features?.length ?? 0, ob: ob.features.length, gr: gr.features?.length ?? 0, or: oroads.features.length, g2o, o2g,
    });
  } catch {
    cmpStats.textContent = t('cmp.retry');
  } finally {
    cmpLoading = false;
  }
}
let cmpDebounce: ReturnType<typeof setTimeout> | undefined;
map.on('moveend', () => {
  if (!cmpOn) return;
  clearTimeout(cmpDebounce);
  cmpDebounce = setTimeout(loadCompare, 400);
});

cmpBtn.addEventListener('click', () => {
  cmpOn = !cmpOn;
  cmpBtn.classList.toggle('on', cmpOn);
  cmpBtn.textContent = t(cmpOn ? 'cmp.hide' : 'cmp.show');
  for (const id of ['cmp-geonb-roads', 'cmp-osm-roads', 'cmp-geonb-buildings', 'cmp-osm-buildings'])
    map.setLayoutProperty(id, 'visibility', cmpOn ? 'visible' : 'none');
  cmpStats.hidden = !cmpOn;
  if (cmpOn) loadCompare();
});

// ---------- Contours + wetlands overlays (GeoNB) ----------
// Contours are a QA/slope overlay (terrain heights come from the LiDAR DTM,
// not from lines); wetlands are a game surface-type layer. Both load per
// viewport when their toggle is on. See data-sources/002 and 003.
let contoursOn = false;
let wetlandsOn = false;

let overlayToken = 0;
async function refreshOverlays() {
  if (tilesOn && TILES_HAS_CONTOURS) return;
  const token = ++overlayToken;
  if (contoursOn) {
    if (map.getZoom() >= 12.5) {
      try {
        const gj = await fetchLayer('GeoNB_SNB_Contours', 1, 'Contour', 'OBJECTID', map.getBounds());
        if (token !== overlayToken) return;
        (map.getSource('geonb-contours') as maplibregl.GeoJSONSource).setData(gj);
      } catch { /* GeoNB flaky; next pan retries */ }
    }
  }
  if (wetlandsOn) {
    try {
      const gj = await fetchLayer('GeoNB_ENV_Wetlands', 2, 'WETLAND_CLASS,STATUS,Hectares', 'OBJECTID', map.getBounds());
      if (token !== overlayToken) return;
      (map.getSource('geonb-wetlands') as maplibregl.GeoJSONSource).setData(gj);
    } catch { /* as above */ }
  }
}
let overlayDebounce: ReturnType<typeof setTimeout> | undefined;
map.on('moveend', () => {
  if (!contoursOn && !wetlandsOn) return;
  clearTimeout(overlayDebounce);
  overlayDebounce = setTimeout(refreshOverlays, 350);
});

document.getElementById('contours-toggle')?.addEventListener('change', (e) => {
  contoursOn = (e.target as HTMLInputElement).checked;
  map.setLayoutProperty('contours-line', 'visibility', contoursOn ? 'visible' : 'none');
  map.setLayoutProperty('contours-label', 'visibility', contoursOn ? 'visible' : 'none');
  syncTilesVisibility();
  if (contoursOn) refreshOverlays();
});
document.getElementById('wetlands-toggle')?.addEventListener('change', (e) => {
  wetlandsOn = (e.target as HTMLInputElement).checked;
  map.setLayoutProperty('wetlands-fill', 'visibility', wetlandsOn ? 'visible' : 'none');
  map.setLayoutProperty('wetlands-line', 'visibility', wetlandsOn ? 'visible' : 'none');
  syncTilesVisibility();
  if (wetlandsOn) refreshOverlays();
});

// ---------- Tiles mode sync ----------
// tilesOn flips the heavy layers between the baked PMTiles variants (t-*)
// and the live ArcGIS GeoJSON variants. Toggle flags stay the single source
// of truth; this function just routes visibility to the active variant set.
function vis(id: string, on: boolean) {
  try { map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); } catch { /* layer may not exist yet */ }
}
function syncTilesVisibility() {
  vis('buildings-3d', buildingsOn && !tilesOn);
  vis('t-buildings-3d', buildingsOn && tilesOn);
  vis('gm-buildings', gmOn && !tilesOn);
  vis('t-gm-buildings', gmOn && tilesOn);
  vis('gm-roads', gmOn && !tilesOn);
  vis('t-gm-roads', gmOn && tilesOn);
  vis('contours-line', contoursOn && !(tilesOn && TILES_HAS_CONTOURS));
  vis('t-contours-line', contoursOn && tilesOn && TILES_HAS_CONTOURS);
  vis('contours-label', contoursOn && !(tilesOn && TILES_HAS_CONTOURS));
  vis('t-contours-label', contoursOn && tilesOn && TILES_HAS_CONTOURS);
  vis('wetlands-fill', wetlandsOn && !tilesOn);
  vis('t-wetlands-fill', wetlandsOn && tilesOn);
  vis('wetlands-line', wetlandsOn && !tilesOn);
  vis('t-wetlands-line', wetlandsOn && tilesOn);
}
async function probeTiles() {
  try {
    const p = new PMTiles(TILES_URL);
    const header = await Promise.race([
      p.getHeader(),
      new Promise<null>((res) => setTimeout(() => res(null), 6000)),
    ]);
    if (header) {
      tilesOn = true;
      syncTilesVisibility();
      if (gmOn) loadGmViewport();
    }
  } catch { /* archive unreachable: live ArcGIS path stays active */ }
}
map.on('load', probeTiles);

// ---------- Language toggle ----------
const langBtn = document.getElementById('lang-btn') as HTMLButtonElement;
function refreshDynamicLabels() {
  langBtn.textContent = getLang() === 'fr' ? 'EN' : 'FR';
  tourBtn.textContent = t(touring ? 'tour.stop' : 'tour.start');
  gmBtn.textContent = t(gmOn ? 'gm.exit' : 'gm.enter');
  cmpBtn.textContent = t(cmpOn ? 'cmp.hide' : 'cmp.show');
  if (hint?.textContent) hint.textContent = t('b3d.zoom');
  if (gmOn) loadGmViewport();
  if (cmpOn) loadCompare();
}
onLang(refreshDynamicLabels);
refreshDynamicLabels();
langBtn.addEventListener('click', () => {
  if (touring) stopTour();
  setLang(getLang() === 'fr' ? 'en' : 'fr', { persist: true });
  // Keep an explicit ?lang= in step so a copied link opens in the language on screen.
  const p = new URLSearchParams(location.search);
  if (p.has('lang')) { p.set('lang', getLang()); history.replaceState(history.state, '', `?${p}${location.hash}`); }
});

// ---------- Toast ----------
const toastEl = document.getElementById('toast')!;
let toastTimer: number | undefined;
function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, 3200);
}

// ---------- Shareable state: position lives in the hash, layers in the query ----------
let restoring = false;
let land: ProtectedApi | null = null;
let catalog: CatalogApi | null = null;
const LAND_KEYS: LandKey[] = ['pna', 'crown', 'ecoregions', 'ecodistricts'];
const layerBox = (key: LayerKey) => document.querySelector<HTMLInputElement>(`input[data-layer="${key}"]`);
function saveState() {
  if (restoring) return;
  const layers = LAYER_KEYS.filter((k) => layerBox(k)?.checked);
  const next = writeState(location.search, {
    base: currentBase, layers, pnaClasses: land?.getClasses() ?? ['I', 'II'],
    imagery: catalog?.getVintage() ?? '', terrain: catalog?.getTerrain() ?? '',
  });
  if (next !== location.search) history.replaceState(history.state, '', (next || location.pathname) + location.hash);
}
for (const key of LAYER_KEYS) layerBox(key)?.addEventListener('change', saveState);

document.getElementById('share-btn')!.addEventListener('click', async () => {
  saveState();
  const p = new URLSearchParams(location.search);
  p.set('lang', getLang());
  const url = `${location.origin}${location.pathname}?${p.toString().replaceAll('%2C', ',')}${location.hash}`;
  try { await navigator.clipboard.writeText(url); toast(t('share.copied')); }
  catch { history.replaceState(history.state, '', url); toast(t('share.failed')); }
});

// ---------- Land & nature layers, search, measure, print ----------
map.on('load', () => {
  const measure = initMeasure(map, { elevations: sampleElevations });
  const c1 = document.getElementById('pna-c1') as HTMLInputElement;
  const c2 = document.getElementById('pna-c2') as HTMLInputElement;
  const api = initProtected(map, {
    statusEl: document.getElementById('land-status')!,
    extra: { active: () => cat.identifyActive(), identify: (pt, root, ctx) => cat.identify(pt, root, ctx), clear: () => cat.clearFocus() },
    suppressClicks: () => measure.isActive(),
    onChange: () => {
      for (const key of LAND_KEYS) { const box = layerBox(key); if (box) box.checked = api.isOn(key); }
      c1.checked = api.getClasses().includes('I');
      c2.checked = api.getClasses().includes('II');
      document.getElementById('pna-classes')!.hidden = !api.isOn('pna');
      saveState();
    },
  });
  land = api;
  const cat = initCatalog(map, {
    toast,
    openPopupAt: (pt) => api.openPopupAt(pt),
    onChange: () => {
      for (const key of OVERLAY_KEYS) { const box = layerBox(key); if (box) box.checked = cat.isOn(key); }
      saveState();
    },
  });
  catalog = cat;
  for (const key of OVERLAY_KEYS)
    layerBox(key)?.addEventListener('change', (e) => cat.setOverlay(key, (e.target as HTMLInputElement).checked));
  for (const key of LAND_KEYS)
    layerBox(key)?.addEventListener('change', (e) => api.setLayer(key, (e.target as HTMLInputElement).checked));
  const classesFromBoxes = () => api.setClasses([...(c1.checked ? ['I' as const] : []), ...(c2.checked ? ['II' as const] : [])]);
  c1.addEventListener('change', classesFromBoxes);
  c2.addEventListener('change', classesFromBoxes);
  document.getElementById('pna-classes')!.hidden = true;

  initSearch(map, {
    pnaIndex: api.pnaIndex, focusPna: (e) => { stopTour(); api.focusPna(e); },
    extra: (q) => cat.searchProperty(q),
  });
  initPrint(map, {
    legend: () => [
      ...api.legend(),
      ...cat.legend(),
      ...(wetlandsOn ? [{ color: '#3f9d63', label: t('layer.wetlands') }] : []),
      ...(contoursOn ? [{ color: '#c9a86a', label: t('layer.contours') }] : []),
    ],
  });

  // Reopen whatever a shared link had switched on.
  const state = parseState(location.search);
  restoring = true;
  currentBase = state.base;
  syncBasemap();
  api.setClasses(state.pnaClasses);
  cat.setVintage(state.imagery);
  cat.setTerrain(state.terrain);
  for (const key of state.layers) {
    const box = layerBox(key);
    if (box && !box.checked) { box.checked = true; box.dispatchEvent(new Event('change')); }
  }
  restoring = false;
});
