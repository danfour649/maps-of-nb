// The rest of the GeoNB catalogue: property, imagery by year, the LiDAR
// terrain set, flood mapping, wetland protection zones, local governance and
// a hybrid road overlay — the breadth of the province's own Map Viewer, with
// the things it lacks: per-layer opacity, a click that answers for every layer
// that is on (not just assessment), elevation at the click, and no layer that
// is switched on by default only to swallow clicks.
import * as maplibregl from 'maplibre-gl';
import { bboxOf, labelPoint, parsePropertyId, type LngLat } from './geo';
import { toAssessment, PAN_FIELDS, txt, type Assessment } from './property';
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
export type OverlayKey = 'parcels' | 'localgov' | 'roads' | 'psw' | 'flood';
const OVERLAYS: Record<OverlayKey, { tiles: string; minzoom?: number; opacity: number; attribution: string }> = {
  // Scale limits below mirror the services' own (they draw nothing further out).
  parcels: { tiles: mapExport('GeoNB_SNB_Parcels'), minzoom: 13, opacity: 0.9, attribution: `Parcels, assessment ${SNB}` },
  localgov: { tiles: mapExport('GeoNB_ELG_Local_Governance'), opacity: 0.85, attribution: 'Local governance © GNB Environment and Local Government' },
  roads: { tiles: mapExport('GeoNB_Basemap_NBRN'), opacity: 1, attribution: `Roads ${SNB}` },
  psw: { tiles: mapExport('GeoNB_ENV_Wetlands', '0,1'), minzoom: 11, opacity: 0.8, attribution: 'Wetlands © GNB Environment and Local Government' },
  flood: { tiles: mapExport('GeoNB_ENV_Flood', '2,3,4,5,7'), opacity: 0.7, attribution: 'Flood mapping © GNB Environment and Local Government' },
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
  const on: Record<OverlayKey, boolean> = { parcels: false, localgov: false, roads: false, psw: false, flood: false };
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
    identifyActive: () => on.parcels || on.localgov || !!terrain,
    identify,
    clearFocus: () => focus([]),
    searchProperty,
    setOverlay(key, value) {
      if (on[key] === value) return;
      on[key] = value;
      map.setLayoutProperty(`cat-${key}`, 'visibility', value ? 'visible' : 'none');
      const min = OVERLAYS[key].minzoom;
      if (value && min && map.getZoom() < min) opts.toast(t('cat.zoomin'));
      if (!value && key === 'parcels') focus([]);
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
      if (on.flood) out.push({ color: '#3fae2a', label: t('layer.flood') });
      if (on.psw) out.push({ color: '#2fa39b', label: t('layer.psw') });
      return out;
    },
  };
  return api;
}
