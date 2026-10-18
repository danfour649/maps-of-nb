import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

const ARCGIS = 'https://geonb.snb.ca/arcgis/rest/services';
const exportTile = (service: string, transparent: boolean) =>
  `${ARCGIS}/${service}/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857` +
  `&size=512,512&format=png32&transparent=${transparent}&dpi=96&f=image`;

const VIEWS: Record<string, { center: [number, number]; zoom: number }> = {
  downtown: { center: [-66.6431, 45.9636], zoom: 15.5 },
  unb: { center: [-66.6450, 45.9445], zoom: 14.5 },
  northside: { center: [-66.6285, 45.9789], zoom: 14.5 },
  city: { center: [-66.66, 45.96], zoom: 12 },
};

const style: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/tiles/{fontstack}/{range}.pbf',
  sources: {
    'geonb-imagery': {
      type: 'raster', tileSize: 512, maxzoom: 18,
      tiles: [exportTile('GeoNB_Basemap_Imagery', false)],
      attribution: 'Imagery © GeoNB / Service New Brunswick',
    },
    'geonb-topo': {
      type: 'raster', tileSize: 512, maxzoom: 18,
      tiles: [exportTile('GeoNB_Basemap_Topo', false)],
      attribution: 'Basemap © GeoNB / Service New Brunswick',
    },
    'esri-imagery': {
      type: 'raster', tileSize: 256, maxzoom: 18,
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    },
    'geonb-imagery-year': {
      type: 'raster', tileSize: 512, maxzoom: 18,
      tiles: [exportTile('GeoNB_SNB_ImageryYear', true)],
      attribution: 'Imagery year © GeoNB',
    },
    'geonb-buildings': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    'gm-buildings': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    'terrarium-dem': {
      type: 'raster-dem', tileSize: 256, maxzoom: 15,
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      attribution: 'Terrain: Mapzen / open elevation data (preview — the game gets GeoNB LiDAR)',
    },
    'gm-roads': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  },
  layers: [
    { id: 'geonb-imagery', type: 'raster', source: 'geonb-imagery', layout: { visibility: 'visible' } },
    { id: 'geonb-topo', type: 'raster', source: 'geonb-topo', layout: { visibility: 'none' } },
    { id: 'esri-imagery', type: 'raster', source: 'esri-imagery', layout: { visibility: 'none' } },
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

const map = new maplibregl.Map({
  container: 'map',
  style,
  center: VIEWS.downtown.center,
  zoom: VIEWS.downtown.zoom,
  hash: true,
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
// Test hook: integration tests drive the live map instance.
(window as unknown as { __map?: maplibregl.Map }).__map = map;
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

const BASES = ['geonb-imagery', 'geonb-topo', 'esri-imagery'] as const;
document.querySelectorAll<HTMLButtonElement>('#basemap-seg button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#basemap-seg button').forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
    const chosen = btn.dataset.base!;
    for (const id of BASES) {
      map.setLayoutProperty(id, 'visibility', id === chosen ? 'visible' : 'none');
    }
  });
});

document.getElementById('year-toggle')?.addEventListener('change', (e) => {
  const on = (e.target as HTMLInputElement).checked;
  map.setLayoutProperty('geonb-imagery-year', 'visibility', on ? 'visible' : 'none');
});

document.querySelectorAll<HTMLButtonElement>('#views button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const v = VIEWS[btn.dataset.view!];
    if (v) { stopTour(); map.flyTo({ center: v.center, zoom: v.zoom, pitch: 0, duration: 1600 }); }
  });
});

// ---------- 3D buildings from GeoNB's LiDAR-derived footprints ----------
const hint = document.getElementById('b3d-hint');
let buildingsOn = false;
let fetchTimer: number | undefined;

async function refreshBuildings() {
  if (!buildingsOn) return;
  if (map.getZoom() < 14.5) {
    (map.getSource('geonb-buildings') as maplibregl.GeoJSONSource)
      .setData({ type: 'FeatureCollection', features: [] });
    if (hint) hint.textContent = 'Zoom in closer — buildings load at street level.';
    return;
  }
  if (hint) hint.textContent = '';
  const b = map.getBounds();
  const q = new URLSearchParams({
    where: '1=1',
    geometry: `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`,
    geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326',
    outFields: 'min_g_elev,max_b_elev', returnGeometry: 'true',
    f: 'geojson', resultRecordCount: '3000',
  });
  try {
    const resp = await fetch(`${ARCGIS}/GeoNB_SNB_Buildings/MapServer/0/query?${q}`);
    const gj = await resp.json();
    (map.getSource('geonb-buildings') as maplibregl.GeoJSONSource).setData(gj);
  } catch { /* keep last data on transient errors */ }
}

document.getElementById('b3d-toggle')?.addEventListener('change', (e) => {
  buildingsOn = (e.target as HTMLInputElement).checked;
  map.setLayoutProperty('buildings-3d', 'visibility', buildingsOn ? 'visible' : 'none');
  if (buildingsOn) {
    map.easeTo({ pitch: 55, duration: 1200 });
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
type Stop = { name: string; body: string; center: [number, number]; zoom: number; pitch: number; bearing: number };
const STOPS: Stop[] = [
  {
    name: 'The Legislative Assembly',
    body: 'New Brunswick’s seat of government since 1882, on Queen Street. The dome you’re looking at was rebuilt after the original burned — the chamber inside still sits under it.',
    center: [-66.6357, 45.9590], zoom: 16.5, pitch: 55, bearing: -20,
  },
  {
    name: 'Christ Church Cathedral',
    body: 'Consecrated in 1853 and the first cathedral founded on British soil since the Norman Conquest. Its spire is the downtown skyline’s exclamation point — and a fixed point in every Fredericton photo since.',
    center: [-66.6353, 45.9573], zoom: 16.5, pitch: 55, bearing: 30,
  },
  {
    name: 'Beaverbrook Art Gallery',
    body: 'Gifted to the province by Lord Beaverbrook in 1959 — and home to Salvador Dalí’s enormous Santiago El Grande, which somehow ended up in Fredericton and never left.',
    center: [-66.6374, 45.9601], zoom: 16.5, pitch: 50, bearing: -35,
  },
  {
    name: 'Officers’ Square',
    body: 'The old military parade ground, now downtown’s living room — concerts, markets, and skating in winter. The Guard House and barracks along Queen Street are the 1820s originals.',
    center: [-66.6416, 45.9622], zoom: 16.5, pitch: 55, bearing: 15,
  },
  {
    name: 'Westmorland Street Bridge',
    body: 'The daily link between downtown and the north side, opened in 1982. Under it runs the river trail network — and in the game, this is where a lot of questionable driving happens.',
    center: [-66.6418, 45.9652], zoom: 15.5, pitch: 45, bearing: -60,
  },
  {
    name: 'Bill Thorpe Walking Bridge',
    body: 'The old railway bridge, now the spine of the trail system and the best sunset walk in the city. Trains crossed here until the 1990s; now it’s strollers, bikes, and dogs.',
    center: [-66.6298, 45.9560], zoom: 15.5, pitch: 45, bearing: 70,
  },
  {
    name: 'University of New Brunswick',
    body: 'Founded 1785 — one of the oldest public universities in North America, up the hill where it can keep an eye on the legislature. This is the last stop; the map is yours again.',
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
  tourBtn.textContent = '▶ Tour Fredericton';
  tourBtn.classList.remove('stop');
}

function startTour() {
  stopTour();
  touring = true;
  tourBtn.textContent = '■ Stop tour';
  tourBtn.classList.add('stop');
  const STEP_MS = 7000;
  STOPS.forEach((stop, i) => {
    tourTimers.push(window.setTimeout(() => {
      captionTitle.textContent = stop.name;
      captionBody.textContent = stop.body;
      caption.hidden = false;
      map.flyTo({ center: stop.center, zoom: stop.zoom, pitch: stop.pitch, bearing: stop.bearing, duration: 3000 });
    }, i * STEP_MS));
  });
  tourTimers.push(window.setTimeout(stopTour, STOPS.length * STEP_MS + 1500));
}

tourBtn.addEventListener('click', () => (touring ? stopTour() : startTour()));
map.on('mousedown', () => { if (touring) stopTour(); });

// ---------- Game mesh explorer (the GTA Fredericton pilot tile) ----------
// Same export layers scripts/extract_game_mesh.py produces in batch:
// buildings + roads for one downtown tile, fetched live from GeoNB.
const GM_BBOX = '-66.652,45.955,-66.628,45.970';
const gmBtn = document.getElementById('gm-btn') as HTMLButtonElement;
const gmStats = document.getElementById('gm-stats')!;
let gmOn = false;
let gmLoaded = false;

async function gmFetch(service: string, layer: number, fields: string) {
  const q = new URLSearchParams({
    where: '1=1', geometry: GM_BBOX, geometryType: 'esriGeometryEnvelope',
    inSR: '4326', outSR: '4326', outFields: fields, returnGeometry: 'true',
    f: 'geojson', resultRecordCount: '3000',
  });
  const resp = await fetch(`${ARCGIS}/${service}/MapServer/${layer}/query?${q}`);
  return resp.json();
}

async function loadGameMesh() {
  const [b, r] = await Promise.all([
    gmFetch('GeoNB_SNB_Buildings', 0, 'min_g_elev,max_b_elev'),
    gmFetch('GeoNB_Basemap_NBRN', 1, 'Number_Of_Lanes,Route_Name_English_1'),
  ]);
  (map.getSource('gm-buildings') as maplibregl.GeoJSONSource).setData(b);
  (map.getSource('gm-roads') as maplibregl.GeoJSONSource).setData(r);
  const heights = (b.features ?? []).map(
    (f: any) => ((f.properties?.max_b_elev ?? 0) as number) - ((f.properties?.min_g_elev ?? 0) as number),
  );
  const tallest = heights.length ? Math.max(...heights).toFixed(1) : '0';
  gmStats.innerHTML =
    `Pilot tile — downtown Fredericton: <b>${b.features?.length ?? 0} buildings</b>, ` +
    `<b>${r.features?.length ?? 0} road segments</b>, tallest building ${tallest} m. ` +
    `This is the export the PySpark pipeline feeds to GTA Fredericton (see scripts/extract_game_mesh.py).`;
  gmLoaded = true;
}

gmBtn.addEventListener('click', async () => {
  gmOn = !gmOn;
  gmBtn.classList.toggle('on', gmOn);
  gmBtn.textContent = gmOn ? '🎮 Exit game mesh' : '🎮 Game mesh explorer';
  const rasters = ['geonb-imagery', 'geonb-topo', 'esri-imagery', 'geonb-imagery-year'];
  for (const id of rasters) map.setLayoutProperty(id, 'visibility', gmOn ? 'none' : (id === 'geonb-imagery' ? 'visible' : 'none'));
  map.setLayoutProperty('gm-bg', 'visibility', gmOn ? 'visible' : 'none');
  const gmTerrain = document.getElementById('gm-terrain') as HTMLInputElement;
  const relief = gmOn && gmTerrain.checked;
  map.setLayoutProperty('gm-hillshade', 'visibility', relief ? 'visible' : 'none');
  map.setTerrain(relief ? { source: 'terrarium-dem', exaggeration: 1.3 } : null);
  (document.getElementById('gm-terrain-row') as HTMLElement).hidden = !gmOn;
  map.setLayoutProperty('gm-roads', 'visibility', gmOn ? 'visible' : 'none');
  map.setLayoutProperty('gm-buildings', 'visibility', gmOn ? 'visible' : 'none');
  gmStats.hidden = !gmOn;
  if (gmOn) {
    stopTour();
    if (!gmLoaded) { gmStats.textContent = 'Loading the pilot tile from GeoNB…'; await loadGameMesh(); }
    map.flyTo({ center: [-66.6400, 45.9625], zoom: 15.2, pitch: 60, bearing: -25, duration: 1800 });
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

document.getElementById('gm-terrain')!.addEventListener('change', (e) => {
  const on = (e.target as HTMLInputElement).checked && gmOn;
  map.setLayoutProperty('gm-hillshade', 'visibility', on ? 'visible' : 'none');
  map.setTerrain(on ? { source: 'terrarium-dem', exaggeration: 1.3 } : null);
});
