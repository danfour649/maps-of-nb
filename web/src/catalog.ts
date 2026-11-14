// The rest of the GeoNB catalogue: property, imagery by year, the LiDAR
// terrain set, flood mapping, wetland protection zones, local governance and
// a hybrid road overlay — the breadth of the province's own Map Viewer, with
// the things it lacks: per-layer opacity, a click that answers for every layer
// that is on (not just assessment), elevation at the click, and no layer that
// is switched on by default only to swallow clicks.
import * as maplibregl from 'maplibre-gl';
import { bboxOf, labelPoint, parsePropertyId, nearestSounding, type LngLat } from './geo';
import { toAssessment, PAN_FIELDS, txt, type Assessment } from './property';
import { toSurveyPoint, nearestSurvey, type SurveyPoint } from './survey';
import { t, getLang, locale, onLang } from './i18n';

const GEONB = 'https://geonb.snb.ca/arcgis/rest/services';
const IMAGE = 'https://geonb.snb.ca/image/rest/services';
const SNB = '© GeoNB / Service New Brunswick';
const mapExport = (service: string, layers?: string) =>
  `${GEONB}/${service}/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256` +
  `&format=png32&transparent=true&dpi=96&f=image${layers ? `&layers=show:${layers}` : ''}`;
const imageExport = (service: string) =>
  `${IMAGE}/${service}/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=jpgpng&f=image`;

// ---------- registry ----------
export type OverlayKey = 'parcels' | 'localgov' | 'roads' | 'survey' | 'psw' | 'flood' | 'bathy';
// CHS renders its bathymetric grid to a depth-coloured picture (red = shallow,
// blue = deep); the WMS carries no depth values, only pixels.
const NONNA_WMS = 'https://nonna-geoserver.data.chs-shc.ca/geoserver/wms?service=WMS&version=1.1.1&request=GetMap' +
  '&layers=nonna:NONNA%20100&styles=&srs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png&transparent=true';
const SOUNDINGS_URL = '/bathymetry-fredericton.geojson';
// Static survey-view assets built by scripts/build_survey_assets.py from
// GeoNB's own downloads: every located monument as [lng, lat, destroyed]
// triples, and the provincial outline (the twelve Regional Service
// Commission polygons unioned). GeoNB's survey MapServer draws nothing
// below 1:3.5M (HPN) / 1:50k (Conventional), so the viewer draws these
// itself or a province-wide survey view would show no pins at all.
const SURVEY_DOTS_URL = '/survey-monuments.json';
const NB_BOUNDARY_URL = '/nb-boundary.geojson';
const OVERLAYS: Record<OverlayKey, { tiles: string; minzoom?: number; opacity: number; attribution: string }> = {
  // Scale limits below mirror the services' own (they draw nothing further out).
  parcels: { tiles: mapExport('GeoNB_SNB_Parcels'), minzoom: 13, opacity: 0.9, attribution: `Parcels, assessment ${SNB}` },
  localgov: { tiles: mapExport('GeoNB_ELG_Local_Governance'), opacity: 0.85, attribution: 'Local governance © GNB Environment and Local Government' },
  roads: { tiles: mapExport('GeoNB_Basemap_NBRN'), opacity: 1, attribution: `Roads ${SNB}` },
  survey: { tiles: mapExport('GeoNB_SNB_SurveyControlNetwork'), minzoom: 11, opacity: 1, attribution: `Survey control ${SNB}` },
  psw: { tiles: mapExport('GeoNB_ENV_Wetlands', '0,1'), minzoom: 11, opacity: 0.8, attribution: 'Wetlands © GNB Environment and Local Government' },
  flood: { tiles: mapExport('GeoNB_ENV_Flood', '2,3,4,5,7'), opacity: 0.7, attribution: 'Flood mapping © GNB Environment and Local Government' },
  bathy: { tiles: NONNA_WMS, opacity: 0.75, attribution: 'Bathymetry © Canadian Hydrographic Service (NONNA) — not for navigation' },
};
export const OVERLAY_KEYS = Object.keys(OVERLAYS) as OverlayKey[];

type Region = [en: string, fr: string];
type Vintage = { key: string; service: string; year: string; region: Region; bounds: [number, number, number, number] };
// Coverage boxes are each service's own extent (EPSG:2953) projected to
// lat/long on 2026-11-13; see data-sources/007. Newest first.
export const VINTAGES: Vintage[] = [
  { key: 'best', service: 'Imagery/HighResolution_Imagery', year: '', region: ['Best available, province-wide', 'Meilleure disponible, toute la province'], bounds: [-69.076, 44.845, -63.739, 48.083] },
  { key: '2025se', service: 'Imagery/Imagery2025', year: '2025', region: ['southeast NB (15 cm)', 'sud-est du N.-B. (15 cm)'], bounds: [-66.591, 45.01, -63.751, 46.275] },
  { key: '2025sj', service: 'Imagery/SaintJohn2025', year: '2025', region: ['Saint John (5 cm)', 'Saint John (5 cm)'], bounds: [-66.35, 45.12, -65.67, 45.568] },
  { key: '2024c', service: 'Imagery/SNB_2024', year: '2024', region: ['central NB (15 cm)', 'centre du N.-B. (15 cm)'], bounds: [-67.223, 45.892, -65.37, 46.959] },
  { key: '2024e', service: 'Imagery/NB_2024', year: '2024', region: ['eastern NB (7.5 cm)', 'est du N.-B. (7,5 cm)'], bounds: [-65.847, 46.012, -64.485, 47.683] },
  { key: '2023f', service: 'Imagery/NB_2023', year: '2023', region: ['Fredericton (7.5 cm)', 'Fredericton (7,5 cm)'], bounds: [-66.793, 45.843, -66.505, 46.056] },
  { key: '2023n', service: 'Imagery/SNB_2023', year: '2023', region: ['northern NB (20 cm)', 'nord du N.-B. (20 cm)'], bounds: [-68.544, 45.931, -64.897, 48.016] },
  { key: '2022fiona', service: 'Imagery/NB_2022_Hurricane_Fiona', year: '2022', region: ['after Hurricane Fiona, east coast', 'après l’ouragan Fiona, côte est'], bounds: [-65.648, 45.963, -63.658, 48.044] },
  { key: '2022', service: 'Imagery/NB_2022', year: '2022', region: ['northern NB (7.5 cm)', 'nord du N.-B. (7,5 cm)'], bounds: [-68.488, 46.011, -64.483, 47.513] },
  { key: '2021', service: 'Imagery/NB_2021', year: '2021', region: ['Shediac – Cap-Pelé coast', 'côte de Shediac à Cap-Pelé'], bounds: [-64.576, 46.181, -64.18, 46.249] },
  { key: '2020f', service: 'Imagery/Fredericton_2020', year: '2020', region: ['Fredericton (5 cm)', 'Fredericton (5 cm)'], bounds: [-66.802, 45.869, -66.55, 46.04] },
  { key: '2020sj', service: 'Imagery/NB_2020', year: '2020', region: ['Saint John (7.5 cm)', 'Saint John (7,5 cm)'], bounds: [-66.225, 45.226, -65.859, 45.495] },
  { key: '2018', service: 'Imagery/SNB_2018_Ortho', year: '2018', region: ['northern NB (10 cm)', 'nord du N.-B. (10 cm)'], bounds: [-69.076, 46.509, -65.641, 48.083] },
  { key: '2017', service: 'Imagery/NB_2017', year: '2017', region: ['scattered blocks, province-wide', 'blocs épars, toute la province'], bounds: [-68.763, 44.577, -63.739, 48.077] },
  { key: '2016', service: 'Imagery/NB_2016', year: '2016', region: ['northern NB (7.5 cm)', 'nord du N.-B. (7,5 cm)'], bounds: [-68.476, 46.007, -63.742, 48.022] },
  { key: '2015', service: 'Imagery/NB_2015', year: '2015', region: ['southern NB (7.5 cm)', 'sud du N.-B. (7,5 cm)'], bounds: [-67.648, 44.855, -64.317, 46.184] },
  { key: '2014', service: 'Imagery/NB_2014', year: '2014', region: ['Moncton (7.5 cm)', 'Moncton (7,5 cm)'], bounds: [-64.921, 46.025, -64.631, 46.175] },
];
export const TERRAINS: { key: string; service: string; label: string }[] = [
  { key: 'hillshade', service: 'Elevation/DEM_Hillshade_Multi_MNE_Ombrage_Multiple', label: 'terrain.hillshade' },
  { key: 'relief', service: 'Elevation/DEM_Shaded_Relief_MNE_Relief_Ombre', label: 'terrain.relief' },
  { key: 'surface', service: 'Elevation/DSM_Hillshade_Multi_MNT_Ombrage_Multiple', label: 'terrain.surface' },
  { key: 'slope', service: 'Elevation/DEM_Slope_Degree_MNE_Pente_Degre', label: 'terrain.slope' },
];

// ---------- service calls ----------
async function getJson(url: string, init?: RequestInit): Promise<any> {
  const resp = await fetch(url, init);
  const j = await resp.json();
  if (!resp.ok || j.error) throw new Error(j.error?.message ?? `http ${resp.status}`);
  return j;
}
const pointQuery = (pt: LngLat, extra: Record<string, string>) => new URLSearchParams({
  geometry: `${pt[0]},${pt[1]}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', ...extra,
});

/** LiDAR ground elevation (1 m DEM) at each point, metres; null where there is no data. */
export async function sampleElevations(pts: LngLat[]): Promise<(number | null)[]> {
  if (!pts.length) return [];
  const body = new URLSearchParams({
    geometry: JSON.stringify({ points: pts, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryMultipoint', returnFirstValueOnly: 'true', f: 'json',
  });
  const j = await getJson(`${IMAGE}/Elevation/DEM_Raw_MNE_Brut/ImageServer/getSamples`, { method: 'POST', body });
  const out: (number | null)[] = pts.map(() => null);
  for (const s of j.samples ?? []) {
    const v = parseFloat(s.value);
    if (Number.isFinite(v) && s.locationId < out.length) out[s.locationId] = v;
  }
  return out;
}


async function assessmentsWhere(params: URLSearchParams): Promise<Assessment[]> {
  params.set('outFields', PAN_FIELDS); params.set('returnGeometry', 'true'); params.set('outSR', '4326');
  params.set('geometryPrecision', '6'); params.set('resultRecordCount', '4'); params.set('f', 'geojson');
  const j = await getJson(`${GEONB}/GeoNB_SNB_Pan/MapServer/0/query?${params}`);
  return (j.features ?? []).map(toAssessment);
}
async function parcelsWhere(params: URLSearchParams): Promise<any[]> {
  params.set('outFields', 'PID,COUNTY,Titles_Status'); params.set('returnGeometry', 'true'); params.set('outSR', '4326');
  params.set('geometryPrecision', '6'); params.set('resultRecordCount', '3'); params.set('f', 'geojson');
  return (await getJson(`${GEONB}/GeoNB_SNB_Parcels/MapServer/0/query?${params}`)).features ?? [];
}

// ---------- module ----------
export type CatalogApi = {
  /** Does a click have anything to ask the catalogue right now? */
  identifyActive(): boolean;
  /** Add this point's answers to an open popup (rows fill in as services reply). */
  identify(pt: LngLat, root: HTMLElement, ctx: HTMLElement): void;
  clearFocus(): void;
  /** Search hook: property numbers typed into the search box. */
  searchProperty(q: string): { group: string; label: string; sub?: string; run: () => Promise<void> }[];
  setOverlay(key: OverlayKey, on: boolean): void;
  isOn(key: OverlayKey): boolean;
  setVintage(key: string): void;
  getVintage(): string;
  setTerrain(key: string): void;
  getTerrain(): string;
  legend(): { color: string; label: string }[];
};

export function initCatalog(
  map: maplibregl.Map,
  opts: { toast: (msg: string) => void; onChange: () => void; openPopupAt: (pt: LngLat) => void },
): CatalogApi {
  const on: Record<OverlayKey, boolean> = { parcels: false, localgov: false, roads: false, survey: false, psw: false, flood: false, bathy: false };
  let soundings: { pt: LngLat; d: number; bed: number }[] = [];
  let soundingsLoad: Promise<void> | null = null;
  let vintage = '';
  let terrain = '';
  const imgSel = document.getElementById('img-select') as HTMLSelectElement;
  const imgOpacity = document.getElementById('img-opacity') as HTMLInputElement;
  const terSel = document.getElementById('terrain-select') as HTMLSelectElement;
  const terOpacity = document.getElementById('terrain-opacity') as HTMLInputElement;
  const before = (id: string) => (map.getLayer(id) ? id : undefined);

  for (const key of OVERLAY_KEYS) {
    const o = OVERLAYS[key];
    map.addSource(`cat-${key}`, { type: 'raster', tileSize: 256, tiles: [o.tiles], attribution: o.attribution, ...(o.minzoom ? { minzoom: o.minzoom } : {}) });
    map.addLayer({ id: `cat-${key}`, type: 'raster', source: `cat-${key}`, layout: { visibility: 'none' }, paint: { 'raster-opacity': o.opacity } }, before('buildings-3d'));
  }
  // Measured riverbed soundings for the Fredericton reach (CHS NONNA, via
  // scripts/import_bathymetry.py): real depths, where the WMS has only colours.
  map.addSource('cat-soundings', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'cat-soundings', type: 'circle', source: 'cat-soundings', minzoom: 11.5, layout: { visibility: 'none' },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 1.6, 15, 4, 17, 7],
      'circle-color': ['interpolate', ['linear'], ['get', 'd'], 2, '#c8f1ff', 4, '#5db7e8', 6, '#2a6fc4', 9, '#1a2f8f'],
      'circle-stroke-color': 'rgba(8,12,16,0.7)', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 12, 0, 15, 0.8],
    },
  }, before('boundary-fill'));
  const loadSoundings = () => (soundingsLoad ??= fetch(SOUNDINGS_URL).then((r) => r.json()).then((gj) => {
    soundings = (gj.features ?? []).map((f: any) => ({ pt: f.geometry.coordinates as LngLat, d: f.properties.d, bed: f.properties.bed }));
    (map.getSource('cat-soundings') as maplibregl.GeoJSONSource).setData(gj);
  }).catch(() => { soundingsLoad = null; }));

  // Survey view at province zoom: a dot for every monument in GeoNB's
  // published download, plus the provincial outline INSTEAD of the
  // Fredericton city outline (the hunt is province-wide; the city line
  // comes back when the survey layer goes off). The GeoNB raster takes
  // over as the detailed rendering from z15, where its Conventional
  // network starts to draw, so the dots hand over there.
  map.addSource('cat-survey-dots', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'cat-survey-dots', type: 'circle', source: 'cat-survey-dots', maxzoom: 15, layout: { visibility: 'none' },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 1.1, 8, 1.6, 11, 2.4, 14.9, 3.4],
      'circle-color': ['case', ['==', ['get', 'd'], 1], '#9a8f7a', '#d9a441'],
      'circle-opacity': ['case', ['==', ['get', 'd'], 1], 0.4, 0.85],
      'circle-stroke-color': 'rgba(8,12,16,0.55)',
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 8, 0, 12, 0.6],
    },
  }, before('boundary-fill'));
  let surveyDotsLoad: Promise<void> | null = null;
  const loadSurveyDots = () => (surveyDotsLoad ??= fetch(SURVEY_DOTS_URL).then((r) => r.json()).then((j) => {
    const features = (j.points ?? []).map((p: number[]) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [p[0], p[1]] }, properties: { d: p[2] },
    }));
    (map.getSource('cat-survey-dots') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features } as any);
  }).catch(() => { surveyDotsLoad = null; }));
  map.addSource('cat-nb-boundary', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'cat-nb-boundary-case', type: 'line', source: 'cat-nb-boundary', layout: { visibility: 'none' },
    paint: { 'line-color': 'rgba(8,14,20,0.55)', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3, 10, 4.5] },
  }, before('boundary-fill'));
  map.addLayer({
    id: 'cat-nb-boundary-line', type: 'line', source: 'cat-nb-boundary', layout: { visibility: 'none' },
    paint: { 'line-color': '#ffd166', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.6, 10, 2.4], 'line-opacity': 0.95 },
  }, before('boundary-fill'));
  let nbBoundaryLoad: Promise<void> | null = null;
  const loadNbBoundary = () => (nbBoundaryLoad ??= fetch(NB_BOUNDARY_URL).then((r) => r.json()).then((gj) => {
    (map.getSource('cat-nb-boundary') as maplibregl.GeoJSONSource).setData(gj);
  }).catch(() => { nbBoundaryLoad = null; }));

  map.addSource('cat-focus', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'cat-focus-fill', type: 'fill', source: 'cat-focus', paint: { 'fill-color': '#7fd0ff', 'fill-opacity': 0.18 } }, before('boundary-fill'));
  map.addLayer({ id: 'cat-focus-line', type: 'line', source: 'cat-focus', paint: { 'line-color': '#7fd0ff', 'line-width': 2.5 } }, before('boundary-fill'));
  const focus = (geoms: any[]) => (map.getSource('cat-focus') as maplibregl.GeoJSONSource).setData({
    type: 'FeatureCollection', features: geoms.filter(Boolean).map((g) => ({ type: 'Feature', geometry: g, properties: {} })),
  } as any);

  // One-of raster pickers (imagery year, LiDAR terrain): the source is created
  // when picked and dropped when replaced, so 20-odd services cost nothing idle.
  function swapRaster(slot: 'img' | 'terrain', service: string | null, bounds: number[] | undefined, opacity: number, attribution: string) {
    const id = `cat-${slot}`;
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
    if (!service) return;
    // 512 px tiles: a quarter of the requests, which matters on a server that mosaics per call.
    map.addSource(id, { type: 'raster', tileSize: 512, tiles: [imageExport(service)], attribution, ...(bounds ? { bounds: bounds as [number, number, number, number] } : {}) });
    // Imagery sits directly on the basemap; terrain shading goes over imagery.
    map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': opacity } },
      slot === 'img' ? before(map.getLayer('cat-terrain') ? 'cat-terrain' : 'geonb-imagery-year') : before('geonb-imagery-year'));
  }
  const vintageLabel = (v: Vintage) => (v.year ? `${v.year} — ${v.region[getLang() === 'fr' ? 1 : 0]}` : v.region[getLang() === 'fr' ? 1 : 0]);
  function fillSelects() {
    imgSel.replaceChildren(new Option(t('img.none'), ''), ...VINTAGES.map((v) => new Option(vintageLabel(v), v.key)));
    imgSel.value = vintage;
    terSel.replaceChildren(new Option(t('terrain.none'), ''), ...TERRAINS.map((x) => new Option(t(x.label), x.key)));
    terSel.value = terrain;
  }
  fillSelects();
  onLang(fillSelects);

  function applyVintage(key: string, fly: boolean) {
    const v = VINTAGES.find((x) => x.key === key);
    vintage = v ? v.key : '';
    imgSel.value = vintage;
    imgOpacity.hidden = !v;
    swapRaster('img', v?.service ?? null, v?.bounds, Number(imgOpacity.value) / 100, `Imagery ${v?.year ?? ''} ${SNB}`.replace('  ', ' '));
    if (v && fly) {
      const b = map.getBounds();
      const apart = b.getEast() < v.bounds[0] || b.getWest() > v.bounds[2] || b.getNorth() < v.bounds[1] || b.getSouth() > v.bounds[3];
      if (apart) {
        map.fitBounds([[v.bounds[0], v.bounds[1]], [v.bounds[2], v.bounds[3]]], { padding: 40, duration: 1600 });
        opts.toast(t('img.flew', { v: vintageLabel(v) }));
      }
    }
  }
  function applyTerrain(key: string) {
    const x = TERRAINS.find((y) => y.key === key);
    terrain = x ? x.key : '';
    terSel.value = terrain;
    terOpacity.hidden = !x;
    swapRaster('terrain', x?.service ?? null, undefined, Number(terOpacity.value) / 100, `LiDAR elevation ${SNB}`);
  }
  imgSel.addEventListener('change', () => { applyVintage(imgSel.value, true); opts.onChange(); });
  terSel.addEventListener('change', () => { applyTerrain(terSel.value); opts.onChange(); });
  imgOpacity.addEventListener('input', () => { if (map.getLayer('cat-img')) map.setPaintProperty('cat-img', 'raster-opacity', Number(imgOpacity.value) / 100); });
  terOpacity.addEventListener('input', () => { if (map.getLayer('cat-terrain')) map.setPaintProperty('cat-terrain', 'raster-opacity', Number(terOpacity.value) / 100); });

  // ---------- popup content ----------
  const el = (tag: string, cls?: string, text?: string) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const money = (n: number | null) => (n === null ? null : n.toLocaleString(locale(), { style: 'currency', currency: 'CAD', maximumFractionDigits: n % 1 ? 2 : 0 }));
  const fmtDate = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(locale(), { year: 'numeric', month: 'short', day: 'numeric' }) : null);

  function propertySection(a: Assessment, parcel?: any): HTMLElement {
    const sec = el('section', 'pp-sec');
    sec.append(el('div', 'pp-kind', t('prop.kind')), el('h3', undefined, a.location || `PAN ${a.pan}`));
    if (a.description) sec.append(el('div', 'pp-alt', a.description));
    const dl = el('dl');
    const row = (k: string, v: string | null) => { if (v) dl.append(el('dt', undefined, k), el('dd', undefined, v)); };
    row(t('prop.assessed', { y: a.year }), money(a.assessed));
    row(t('prop.levy', { y: a.year }), money(a.levy));
    const sale = [fmtDate(a.saleDate), money(a.salePrice)].filter(Boolean).join(' · ');
    row(t('prop.sale'), sale || null);
    row('PAN', a.pan);
    if (parcel) {
      row('PID', txt(parcel.properties?.PID));
      row(t('prop.title'), txt(parcel.properties?.Titles_Status));
    }
    row(t('prop.authority'), a.authority);
    sec.append(dl);
    const link = el('a', 'pp-link', t('prop.paol')) as HTMLAnchorElement;
    link.href = 'https://paol-efel.snb.ca/'; link.target = '_blank'; link.rel = 'noreferrer';
    sec.append(link);
    return sec;
  }

  const m3 = (n: number) => n.toLocaleString(locale(), { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  function surveySection(s: SurveyPoint, dist: number): HTMLElement {
    const sec = el('section', 'pp-sec');
    sec.append(el('div', 'pp-kind', t('survey.kind')), el('h3', undefined, s.name || t('survey.mon', { n: s.mon })));
    const dl = el('dl');
    const row = (k: string, v: string | null) => { if (v) dl.append(el('dt', undefined, k), el('dd', undefined, v)); };
    if (s.name) row(t('survey.monlabel'), s.mon);
    row(t('survey.net'), t(s.net === 'hpn' ? 'survey.hpn' : 'survey.conv'));
    row(t('survey.height'), s.heightM === null ? null : `${m3(s.heightM)} m`);
    row(t('survey.csrs'), s.easting === null || s.northing === null ? null : `${m3(s.easting)} E · ${m3(s.northing)} N`);
    row(t('survey.status'), s.status || null);
    row(t('survey.order'), s.orderClass || null);
    row(t('survey.insp'), fmtDate(s.inspected));
    row(t('survey.sketch'), s.sketch || null);
    if (dist > 15) row(t('survey.away'), `${Math.round(dist)} m`);
    sec.append(dl);
    return sec;
  }

  const SURVEY_FIELDS: Record<'hpn' | 'conv', string> = {
    hpn: 'Mon,Name,Status,DateInsp,OrthoHt,LevHt,E83CS,N83CS,Order_,class,sketchNum',
    conv: 'Mon,Status,Elev,E83adj,N83adj,class,sketch',
  };
  /** Nearest survey monument within 120 m of a click, from both networks.
   *  Points need an envelope, not a point query: a ±90 m box, then nearest. */
  async function surveyNear(pt: LngLat) {
    const dLat = 90 / 111_320, dLon = 90 / (111_320 * Math.cos((pt[1] * Math.PI) / 180));
    const env = `${pt[0] - dLon},${pt[1] - dLat},${pt[0] + dLon},${pt[1] + dLat}`;
    const q = (layer: number, net: 'hpn' | 'conv') => getJson(`${GEONB}/GeoNB_SNB_SurveyControlNetwork/MapServer/${layer}/query?${new URLSearchParams({
      geometry: env, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: SURVEY_FIELDS[net], returnGeometry: 'true', outSR: '4326', f: 'geojson', resultRecordCount: '40',
    })}`).then((j) => (j.features ?? []).map((f: any) => toSurveyPoint(f, net)).filter(Boolean) as SurveyPoint[])
      .catch(() => [] as SurveyPoint[]);
    return nearestSurvey([...(await q(0, 'hpn')), ...(await q(1, 'conv'))], pt, 120);
  }

  let seq = 0;
  function identify(pt: LngLat, root: HTMLElement, ctx: HTMLElement) {
    const mine = ++seq;
    const live = () => mine === seq && root.isConnected;
    focus([]);
    if (on.parcels) {
      const slot = el('section', 'pp-sec');
      slot.append(el('div', 'pp-kind', t('prop.kind')), el('p', 'pp-rule', t('prop.loading')));
      root.prepend(slot);
      Promise.all([assessmentsWhere(pointQuery(pt, {})), parcelsWhere(pointQuery(pt, {})).catch(() => [])]).then(([list, parcels]) => {
        if (!live()) return;
        if (!list.length) {
          const pid = txt(parcels[0]?.properties?.PID);
          slot.replaceChildren(el('div', 'pp-kind', t('prop.kind')), el('p', 'pp-rule', pid ? t('prop.noassess', { pid }) : t('prop.none')));
          focus(parcels.map((p: any) => p.geometry));
          return;
        }
        slot.replaceWith(...list.map((a, i) => propertySection(a, i === 0 ? parcels[0] : undefined)));
        focus(list.map((a) => a.geometry));
      }).catch(() => { if (live()) slot.replaceChildren(el('div', 'pp-kind', t('prop.kind')), el('p', 'pp-rule', t('prop.error'))); });
    }
    if (on.survey) {
      const slot = el('section', 'pp-sec');
      slot.append(el('div', 'pp-kind', t('survey.kind')), el('p', 'pp-rule', t('survey.loading')));
      root.prepend(slot);
      surveyNear(pt).then((hit) => {
        if (!live()) return;
        if (!hit) {
          slot.replaceChildren(el('div', 'pp-kind', t('survey.kind')), el('p', 'pp-rule', t('survey.none')));
          return;
        }
        slot.replaceWith(surveySection(hit.item, hit.dist));
      }).catch(() => { if (live()) slot.replaceChildren(el('div', 'pp-kind', t('survey.kind')), el('p', 'pp-rule', t('survey.error'))); });
    }
    if (on.localgov) {
      const dd = el('dd', undefined, '…');
      ctx.append(el('dt', undefined, t('gov.label')), dd);
      const fr = getLang() === 'fr';
      const q = (layer: number, fields: string) => getJson(`${GEONB}/GeoNB_ELG_Local_Governance/MapServer/${layer}/query?${pointQuery(pt, { outFields: fields, returnGeometry: 'false', f: 'json' })}`)
        .then((j) => j.features?.[0]?.attributes).catch(() => undefined);
      Promise.all([q(8, 'OFFICIAL_E,OFFICIAL_F'), q(5, 'OFFICIAL_E,OFFICIAL_F'), q(2, 'Region,Name')]).then(([lg, rd, rsc]) => {
        if (!live()) return;
        const place = lg ?? rd;
        dd.textContent = place ? txt(fr ? place.OFFICIAL_F : place.OFFICIAL_E) : t('gov.none');
        if (rsc) dd.append(el('span', 'pp-dim', ` · ${txt(fr ? rsc.Name : rsc.Region)}`));
      });
    }
    if (on.bathy) {
      // Transects are ~300 m apart, so any point in the channel is within ~150 m
      // of one; say how far the reading is from the click rather than pretend.
      const hit = nearestSounding(soundings, pt, 160);
      if (hit) {
        const one = (v: number) => v.toLocaleString(locale(), { maximumFractionDigits: 1 });
        const dd = el('dd', undefined, t('bathy.depth', { d: one(hit.item.d) }));
        dd.append(el('span', 'pp-dim', ` · ${t('bathy.bed', { z: one(hit.item.bed) })}`));
        if (hit.dist > 15) dd.append(el('span', 'pp-dim', ` · ${t('bathy.away', { m: Math.round(hit.dist / 10) * 10 })}`));
        ctx.append(el('dt', undefined, t('bathy.label')), dd);
      }
    }
    const dd = el('dd', undefined, '…');
    ctx.append(el('dt', undefined, t('elev.label')), dd);
    sampleElevations([pt]).then(([z]) => {
      if (live()) dd.textContent = z === null ? t('elev.none') : `${z.toLocaleString(locale(), { maximumFractionDigits: 1 })} m`;
    }).catch(() => { if (live()) dd.textContent = t('elev.none'); });
  }

  function searchProperty(q: string) {
    const id = parsePropertyId(q);
    if (!id) return [];
    const label = String(id.n).padStart(8, '0');
    return [{
      group: t('search.group.property'),
      label: `${id.kind === 'pid' ? 'PID' : id.kind === 'pan' ? 'PAN' : 'PID / PAN'} ${label}`,
      sub: t('search.property.sub'),
      run: async () => {
        const where = (field: string) => new URLSearchParams({ where: `${field}=${id.n}` });
        const [pans, pids] = await Promise.all([
          id.kind === 'pid' ? [] : assessmentsWhere(where('Pan_Int')).catch(() => []),
          id.kind === 'pan' ? [] : parcelsWhere(where('PID_INT')).catch(() => []),
        ]);
        const geom = pans[0]?.geometry ?? pids[0]?.geometry;
        const box = bboxOf(geom), at = labelPoint(geom);
        if (!box || !at) { opts.toast(t('search.property.none', { n: label })); return; }
        api.setOverlay('parcels', true);
        map.fitBounds([[box[0], box[1]], [box[2], box[3]]], { padding: 120, maxZoom: 18, duration: 1400 });
        opts.openPopupAt(at);
      },
    }];
  }

  const api: CatalogApi = {
    identifyActive: () => on.parcels || on.survey || on.localgov || on.bathy || !!terrain,
    identify,
    clearFocus: () => focus([]),
    searchProperty,
    setOverlay(key, value) {
      if (on[key] === value) return;
      on[key] = value;
      map.setLayoutProperty(`cat-${key}`, 'visibility', value ? 'visible' : 'none');
      const min = OVERLAYS[key].minzoom;
      // Survey no longer nags for zoom: its dots draw at every zoom.
      if (value && min && key !== 'survey' && map.getZoom() < min) opts.toast(t('cat.zoomin'));
      if (!value && key === 'parcels') focus([]);
      if (key === 'bathy') {
        map.setLayoutProperty('cat-soundings', 'visibility', value ? 'visible' : 'none');
        if (value) void loadSoundings();
      }
      if (key === 'survey') {
        map.setLayoutProperty('cat-survey-dots', 'visibility', value ? 'visible' : 'none');
        map.setLayoutProperty('cat-nb-boundary-case', 'visibility', value ? 'visible' : 'none');
        map.setLayoutProperty('cat-nb-boundary-line', 'visibility', value ? 'visible' : 'none');
        // The hunt is province-wide: while survey is on, the province
        // outline replaces the Fredericton city outline.
        if (map.getLayer('boundary-fill')) map.setLayoutProperty('boundary-fill', 'visibility', value ? 'none' : 'visible');
        if (map.getLayer('boundary-line')) map.setLayoutProperty('boundary-line', 'visibility', value ? 'none' : 'visible');
        if (value) { void loadSurveyDots(); void loadNbBoundary(); }
      }
      opts.onChange();
    },
    isOn: (key) => on[key],
    setVintage(key) { applyVintage(key, false); },
    getVintage: () => vintage,
    setTerrain(key) { applyTerrain(key); },
    getTerrain: () => terrain,
    legend() {
      const out: { color: string; label: string }[] = [];
      if (on.parcels) out.push({ color: '#f6b26b', label: t('layer.parcels') });
      if (on.survey) out.push({ color: '#d9a441', label: t('layer.survey') });
      if (on.flood) out.push({ color: '#3fae2a', label: t('layer.flood') });
      if (on.psw) out.push({ color: '#2fa39b', label: t('layer.psw') });
      if (on.bathy) out.push({ color: '#2a6fc4', label: t('layer.bathy') });
      return out;
    },
  };
  return api;
}
