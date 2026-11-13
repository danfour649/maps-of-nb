// Province-wide land & nature layers: Protected Natural Areas (Class I / II),
// Crown land, ecoregions and ecodistricts, from the NB Department of Natural
// Resources ArcGIS server that backs the province's own PNA viewer.
//
// What this does that the provincial viewer does not:
//  - one layer per class (theirs lists each class twice);
//  - Crown land and ecodistricts draw at every zoom (theirs drop out on zoom-in);
//  - area names are labelled on the map;
//  - one popup answers "what is here" instead of paging through stacked ones;
//  - the data carries a retrieval date, and both official languages.
import * as maplibregl from 'maplibre-gl';
import { pointInGeometry, labelPoint, type LngLat } from './geo';
import { toPnaEntry, pnaName, type PnaEntry } from './pna';
import { t, getLang, locale, onLang } from './i18n';

const ERD = 'https://gis-erd-der.gnb.ca/arcgis/rest/services/PNAs';
const ERD_ATTRIB = 'Protected areas, Crown land, ecoregions © NB Department of Natural Resources';
export const PNA_COLORS = { I: '#e5484d', II: '#f2c230' } as const;
export const CROWN_COLOR = '#df73ff';
const ECO_COLORS = ['#6a8caf', '#4f9d8e', '#8fae5d', '#3d7ea6', '#c9a86a', '#b77fbd', '#d98c5f'];

export type LandKey = 'pna' | 'crown' | 'ecoregions' | 'ecodistricts';
type FColl = { type: 'FeatureCollection'; features: any[] };
const EMPTY: FColl = { type: 'FeatureCollection', features: [] };

async function queryAll(layer: number, fields: string, offsetDeg: number): Promise<any[]> {
  const out: any[] = [];
  for (let offset = 0; offset < 5000;) {
    const q = new URLSearchParams({
      where: '1=1', outFields: fields, outSR: '4326', f: 'geojson', returnGeometry: 'true',
      maxAllowableOffset: String(offsetDeg), geometryPrecision: '5',
      orderByFields: 'OBJECTID', resultOffset: String(offset), resultRecordCount: '1000',
    });
    const resp = await fetch(`${ERD}/PNA_Map_Viewer/MapServer/${layer}/query?${q}`);
    if (!resp.ok) throw new Error('erd ' + resp.status);
    const gj = await resp.json();
    if (gj.error) throw new Error('erd ' + (gj.error.message ?? 'error'));
    const batch = gj.features ?? [];
    out.push(...batch);
    if (!(gj.exceededTransferLimit ?? gj.properties?.exceededTransferLimit) || !batch.length) break;
    offset += batch.length;
  }
  return out;
}

/** Cache a loader's promise, but forget failures so the next toggle retries. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => (p ??= load().catch((err) => { p = null; throw err; }));
}

export type ProtectedApi = {
  setLayer(key: LandKey, on: boolean): void;
  isOn(key: LandKey): boolean;
  setClasses(classes: ('I' | 'II')[]): void;
  getClasses(): ('I' | 'II')[];
  /** All protected areas, cleaned (loads on first call). */
  pnaIndex(): Promise<PnaEntry[]>;
  /** Switch the layer on, frame the area and open its popup. */
  focusPna(entry: PnaEntry): void;
  /** Swatches for whatever is switched on (print legend). */
  legend(): { color: string; label: string }[];
};

export function initProtected(
  map: maplibregl.Map,
  opts: { statusEl: HTMLElement; suppressClicks: () => boolean; onChange?: () => void },
): ProtectedApi {
  const on: Record<LandKey, boolean> = { pna: false, crown: false, ecoregions: false, ecodistricts: false };
  let classes: ('I' | 'II')[] = ['I', 'II'];
  let entries: PnaEntry[] = [];
  let ecoregions: any[] = [];
  let ecodistricts: any[] = [];
  let retrieved: Date | null = null;
  let statusKey: 'idle' | 'loading' | 'error' = 'idle';

  const geo = (id: string) => map.getSource(id) as maplibregl.GeoJSONSource;
  const beforeIf = (id: string) => (map.getLayer(id) ? id : undefined);

  // ---------- sources + layers ----------
  map.addSource('erd-crown', {
    type: 'raster', tileSize: 256, attribution: ERD_ATTRIB,
    tiles: [`${ERD}/Crown_Lands/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857` +
      '&size=256,256&format=png32&transparent=true&dpi=96&f=image'],
  });
  for (const id of ['pna', 'pna-labels', 'pna-focus', 'ecoregions', 'ecoregion-labels', 'ecodistricts', 'ecodistrict-labels'])
    map.addSource(id, { type: 'geojson', data: EMPTY, attribution: id === 'pna' ? ERD_ATTRIB : undefined });

  const under = beforeIf('buildings-3d');   // draped on the basemap
  const mid = beforeIf('boundary-fill');    // with the other vector overlays
  const top = beforeIf('gm-bg');            // labels; game-mesh mode covers everything below it
  const hidden = { visibility: 'none' as const };
  const halo = { 'text-halo-color': 'rgba(8,12,16,0.9)', 'text-halo-width': 1.4 };
  const font = ['Noto Sans Regular'];

  // No minzoom/maxzoom on Crown land: tenure matters most zoomed in, which is
  // exactly where the provincial viewer's scale range switches it off.
  map.addLayer({ id: 'crown-raster', type: 'raster', source: 'erd-crown', layout: hidden, paint: { 'raster-opacity': 0.75 } }, under);
  map.addLayer({
    id: 'ecoregions-fill', type: 'fill', source: 'ecoregions', layout: hidden,
    paint: {
      'fill-color': ['match', ['get', 'REGION'], 1, ECO_COLORS[0], 2, ECO_COLORS[1], 3, ECO_COLORS[2], 4, ECO_COLORS[3], 5, ECO_COLORS[4], 6, ECO_COLORS[5], ECO_COLORS[6]],
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.3, 11, 0.12],
    },
  }, mid);
  map.addLayer({ id: 'ecoregions-line', type: 'line', source: 'ecoregions', layout: hidden, paint: { 'line-color': '#eaf3f9', 'line-width': 1.6, 'line-opacity': 0.9 } }, mid);
  map.addLayer({ id: 'ecodistricts-line', type: 'line', source: 'ecodistricts', layout: hidden, paint: { 'line-color': '#9fe3c5', 'line-width': 1, 'line-dasharray': [3, 2], 'line-opacity': 0.9 } }, mid);
  map.addLayer({
    id: 'pna-fill', type: 'fill', source: 'pna', layout: hidden,
    paint: {
      'fill-color': ['match', ['get', 'cls'], 'I', PNA_COLORS.I, PNA_COLORS.II],
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.6, 12, 0.32],
    },
  }, mid);
  map.addLayer({
    id: 'pna-line', type: 'line', source: 'pna', layout: hidden,
    paint: { 'line-color': ['match', ['get', 'cls'], 'I', '#ff8a8e', '#ffe07a'], 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.6, 12, 1.8] },
  }, mid);
  map.addLayer({ id: 'pna-focus', type: 'line', source: 'pna-focus', paint: { 'line-color': '#ffffff', 'line-width': 3, 'line-opacity': 0.95 } }, mid);
  map.addLayer({
    id: 'ecoregion-label', type: 'symbol', source: 'ecoregion-labels', maxzoom: 9.5,
    layout: { ...hidden, 'text-field': ['get', 'en'], 'text-font': font, 'text-size': 12, 'text-transform': 'uppercase', 'text-letter-spacing': 0.12, 'text-max-width': 8 },
    paint: { 'text-color': '#eaf3f9', ...halo },
  }, top);
  map.addLayer({
    id: 'ecodistrict-label', type: 'symbol', source: 'ecodistrict-labels', minzoom: 7.5,
    layout: { ...hidden, 'text-field': ['get', 'name'], 'text-font': font, 'text-size': 11, 'text-max-width': 8 },
    paint: { 'text-color': '#9fe3c5', ...halo },
  }, top);
  // Names on the map — biggest areas claim label space first, so the
  // province view names the major ones and zooming in fills in the rest.
  map.addLayer({
    id: 'pna-label', type: 'symbol', source: 'pna-labels',
    layout: {
      ...hidden, 'text-field': ['get', 'en'], 'text-font': font, 'text-max-width': 8, 'text-padding': 4,
      'text-size': ['interpolate', ['linear'], ['zoom'], 6, 10.5, 12, 13],
      'symbol-sort-key': ['-', ['get', 'ha']],
    },
    paint: { 'text-color': '#fff7df', ...halo },
  }, top);

  const classFilter = (): maplibregl.FilterSpecification => ['in', ['get', 'cls'], ['literal', classes]];
  function applyLang() {
    const k = getLang();
    for (const id of ['pna-label', 'ecoregion-label']) map.setLayoutProperty(id, 'text-field', ['get', k]);
    renderStatus();
  }
  function applyVisibility() {
    const v = (id: string, show: boolean) => map.setLayoutProperty(id, 'visibility', show ? 'visible' : 'none');
    v('crown-raster', on.crown);
    v('ecoregions-fill', on.ecoregions); v('ecoregions-line', on.ecoregions); v('ecoregion-label', on.ecoregions);
    v('ecodistricts-line', on.ecodistricts); v('ecodistrict-label', on.ecodistricts);
    v('pna-fill', on.pna); v('pna-line', on.pna); v('pna-label', on.pna);
    for (const id of ['pna-fill', 'pna-line', 'pna-label']) map.setFilter(id, classFilter());
    if (!on.pna) geo('pna-focus').setData(EMPTY);
  }
  function renderStatus() {
    const el = opts.statusEl;
    el.classList.toggle('warn', statusKey === 'error');
    if (statusKey === 'loading') el.textContent = t('land.loading');
    else if (statusKey === 'error') el.textContent = t('land.error');
    else if (on.pna && entries.length && retrieved) {
      el.textContent = t('pna.status', {
        n: entries.length,
        ha: Math.round(entries.reduce((s, e) => s + e.ha, 0)).toLocaleString(locale()),
        date: retrieved.toLocaleDateString(locale(), { year: 'numeric', month: 'short', day: 'numeric' }),
      });
    } else el.textContent = '';
    el.hidden = !el.textContent;
  }

  // ---------- loaders (each runs once; failures are retried on next toggle) ----------
  const loadPna = once(async () => {
    const fields = 'OBJECTID,NAME,NOM,CLASS,HECTARES,OWNER,IUCN_CATEGORY,MANAGED_BY,YEAR_PROTECTED,YEAR_AMENDED';
    // The service splits the classes across two scale-dependent layer pairs;
    // 1 and 3 are the full-detail halves and together hold every area once.
    const [c1, c2] = await Promise.all([queryAll(1, fields, 0.0001), queryAll(3, fields, 0.0001)]);
    const seen = new Set<number>();
    entries = [];
    for (const f of [...c1, ...c2]) {
      const e = toPnaEntry(f);
      if (e && !seen.has(e.id)) { seen.add(e.id); entries.push(e); }
    }
    retrieved = new Date();
    const props = (e: PnaEntry) => ({ id: e.id, cls: e.cls, ha: e.ha, en: e.nameEn, fr: e.nameFr });
    geo('pna').setData({ type: 'FeatureCollection', features: entries.map((e) => ({ type: 'Feature', id: e.id, geometry: e.geometry, properties: props(e) })) } as any);
    geo('pna-labels').setData({ type: 'FeatureCollection', features: entries.map((e) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: e.label }, properties: props(e) })) } as any);
    return entries;
  });
  const labelsFor = (feats: any[], props: (p: any) => Record<string, unknown>): FColl => ({
    type: 'FeatureCollection',
    features: feats.flatMap((f) => {
      const pt = labelPoint(f.geometry);
      return pt ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: pt }, properties: props(f.properties ?? {}) }] : [];
    }),
  });
  const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const loadEcoregions = once(async () => {
    ecoregions = await queryAll(6, 'REGION,REGION_NAME,REGION_NOM', 0.0005);
    geo('ecoregions').setData({ type: 'FeatureCollection', features: ecoregions } as any);
    geo('ecoregion-labels').setData(labelsFor(ecoregions, (p) => ({ en: clean(p.REGION_NAME), fr: clean(p.REGION_NOM) })) as any);
    return ecoregions;
  });
  const loadEcodistricts = once(async () => {
    ecodistricts = await queryAll(5, 'DISTRICT,DISTRICT_NAME_NOM,REGION_NAME,REGION_NOM', 0.0005);
    geo('ecodistricts').setData({ type: 'FeatureCollection', features: ecodistricts } as any);
    geo('ecodistrict-labels').setData(labelsFor(ecodistricts, (p) => ({ name: clean(p.DISTRICT_NAME_NOM) })) as any);
    return ecodistricts;
  });

  async function ensureLoaded(key: LandKey) {
    const jobs: Promise<unknown>[] = [];
    if (key === 'pna') { jobs.push(loadPna()); loadEcoregions().catch(() => undefined); } // ecoregion = popup context
    if (key === 'ecoregions') jobs.push(loadEcoregions());
    if (key === 'ecodistricts') jobs.push(loadEcodistricts());
    if (!jobs.length) return;
    statusKey = 'loading'; renderStatus();
    try { await Promise.all(jobs); statusKey = 'idle'; } catch { statusKey = 'error'; }
    renderStatus();
  }

  // ---------- popup ----------
  const popup = new maplibregl.Popup({ maxWidth: '320px', className: 'land-popup' });
  popup.on('close', () => geo('pna-focus')?.setData(EMPTY));

  const el = (tag: string, cls?: string, text?: string) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  function pnaSection(e: PnaEntry): HTMLElement {
    const lang = getLang();
    const sec = el('section', 'pp-sec');
    sec.append(el('div', 'pp-kind', t('pna.kind')));
    sec.append(el('h3', undefined, pnaName(e, lang)));
    const other = lang === 'fr' ? e.nameEn : e.nameFr;
    if (other && other !== pnaName(e, lang)) sec.append(el('div', 'pp-alt', other));
    const badge = el('div', 'pp-badge ' + (e.cls === 'I' ? 'c1' : 'c2'), t(e.cls === 'I' ? 'pna.c1.short' : 'pna.c2.short'));
    const rule = el('p', 'pp-rule');
    rule.append(badge, ' ' + t(e.cls === 'I' ? 'pna.c1.rule' : 'pna.c2.rule'));
    sec.append(rule);
    const dl = el('dl');
    const row = (k: string, v: string | null) => { if (v) dl.append(el('dt', undefined, k), el('dd', undefined, v)); };
    row(t('pna.area'), e.ha ? `${e.ha.toLocaleString(locale(), { maximumFractionDigits: e.ha < 100 ? 2 : 1 })} ha` : null);
    row(t('pna.owner'), lang === 'fr' ? e.ownerFr : e.ownerEn);
    const managed = /natural resources/i.test(e.managedBy) ? t('managed.dnr') : /^private$/i.test(e.managedBy) ? t('managed.private') : e.managedBy;
    row(t('pna.managed'), managed);
    row(t('pna.iucn'), e.iucn);
    row(t('pna.protected'), e.yearProtected ? String(e.yearProtected) : null);
    row(t('pna.expanded'), e.yearExpanded ? String(e.yearExpanded) : null);
    sec.append(dl);
    const zoom = el('button', 'pp-btn', t('pna.zoom')) as HTMLButtonElement;
    zoom.type = 'button';
    zoom.addEventListener('click', () => fit(e));
    sec.append(zoom);
    return sec;
  }
  const fit = (e: PnaEntry) => map.fitBounds([[e.bbox[0], e.bbox[1]], [e.bbox[2], e.bbox[3]]], { padding: 70, maxZoom: 15, duration: 1400 });

  let crownSeq = 0;
  async function crownAt(pt: LngLat): Promise<{ crown: boolean; holder?: number }> {
    const q = new URLSearchParams({
      geometry: `${pt[0]},${pt[1]}`, geometryType: 'esriGeometryPoint', inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects', outFields: 'HOLDER', returnGeometry: 'false', f: 'json',
    });
    const resp = await fetch(`${ERD}/Crown_Lands/MapServer/0/query?${q}`);
    const j = await resp.json();
    if (!resp.ok || j.error) throw new Error('crown query');
    const a = j.features?.[0]?.attributes;
    return a ? { crown: true, holder: a.HOLDER } : { crown: false };
  }

  function showPopupAt(pt: LngLat, forced?: PnaEntry) {
    const root = el('div', 'pp');
    const hits = forced ? [forced]
      : on.pna ? entries.filter((e) => classes.includes(e.cls) && pt[0] >= e.bbox[0] && pt[0] <= e.bbox[2] && pt[1] >= e.bbox[1] && pt[1] <= e.bbox[3] && pointInGeometry(pt, e.geometry))
        : [];
    hits.forEach((e) => root.append(pnaSection(e)));
    geo('pna-focus').setData({ type: 'FeatureCollection', features: hits.map((e) => ({ type: 'Feature', geometry: e.geometry, properties: {} })) } as any);

    const lang = getLang();
    const ctx = el('dl', 'pp-ctx');
    const region = (hits.length || on.ecoregions) ? ecoregions.find((f) => pointInGeometry(pt, f.geometry)) : undefined;
    if (region) ctx.append(el('dt', undefined, t('eco.region')), el('dd', undefined, clean(lang === 'fr' ? region.properties.REGION_NOM : region.properties.REGION_NAME)));
    const district = on.ecodistricts ? ecodistricts.find((f) => pointInGeometry(pt, f.geometry)) : undefined;
    if (district) ctx.append(el('dt', undefined, t('eco.district')), el('dd', undefined, clean(district.properties.DISTRICT_NAME_NOM)));
    if (on.crown) {
      const dd = el('dd', 'pp-crown', t('crown.checking'));
      ctx.append(el('dt', undefined, t('layer.crown')), dd);
      const seq = ++crownSeq;
      crownAt(pt).then((r) => {
        if (seq !== crownSeq) return;
        dd.textContent = r.crown ? t('crown.yes') : t('crown.no');
        dd.classList.add(r.crown ? 'yes' : 'no');
        if (r.crown && r.holder != null) dd.append(el('span', 'pp-dim', ` · ${t('crown.holder', { n: r.holder })}`));
      }).catch(() => { if (seq === crownSeq) dd.textContent = t('crown.unknown'); });
    }
    if (!root.childElementCount && !ctx.childElementCount) { popup.remove(); return; }
    if (ctx.childElementCount) {
      if (!hits.length) root.append(el('div', 'pp-kind', t('popup.here')));
      root.append(ctx);
    }
    popup.setLngLat(pt).setDOMContent(root).addTo(map);
  }

  map.on('click', (e) => {
    if (opts.suppressClicks()) return;
    if (!on.pna && !on.crown && !on.ecoregions && !on.ecodistricts) return;
    showPopupAt([e.lngLat.lng, e.lngLat.lat]);
  });
  map.on('mousemove', 'pna-fill', () => { if (!opts.suppressClicks()) map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'pna-fill', () => { if (!opts.suppressClicks()) map.getCanvas().style.cursor = ''; });
  onLang(() => { applyLang(); popup.remove(); });
  applyLang();

  const api: ProtectedApi = {
    setLayer(key, value) {
      if (on[key] === value) return;
      on[key] = value;
      applyVisibility();
      if (value) void ensureLoaded(key); else { popup.remove(); renderStatus(); }
      opts.onChange?.();
    },
    isOn: (key) => on[key],
    setClasses(next) { classes = next; applyVisibility(); popup.remove(); opts.onChange?.(); },
    getClasses: () => classes,
    pnaIndex: () => loadPna(),
    focusPna(entry) {
      if (!classes.includes(entry.cls)) classes = ['I', 'II'];
      if (on.pna) { applyVisibility(); opts.onChange?.(); } else api.setLayer('pna', true);
      fit(entry);
      showPopupAt(entry.label, entry);
    },
    legend() {
      const out: { color: string; label: string }[] = [];
      if (on.pna && classes.includes('I')) out.push({ color: PNA_COLORS.I, label: t('pna.c1') });
      if (on.pna && classes.includes('II')) out.push({ color: PNA_COLORS.II, label: t('pna.c2') });
      if (on.crown) out.push({ color: CROWN_COLOR, label: t('layer.crown') });
      return out;
    },
  };
  return api;
}
