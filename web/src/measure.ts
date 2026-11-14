// Measure tool: click out a path, read distance and (from three points) the
// enclosed area. Geodesic maths live in geo.ts; this is the map plumbing.
import * as maplibregl from 'maplibre-gl';
import { pathLengthM, ringAreaM2, formatDistance, formatArea, samplePath, profileStats, type LngLat } from './geo';
import { t, onLang } from './i18n';

export function initMeasure(
  map: maplibregl.Map,
  opts: { onToggle?: (active: boolean) => void; elevations?: (pts: LngLat[]) => Promise<(number | null)[]> },
) {
  const panel = document.getElementById('measure-panel')!;
  const readout = document.getElementById('measure-readout')!;
  const btn = document.getElementById('measure-btn') as HTMLButtonElement;
  const profileBtn = document.getElementById('measure-profile') as HTMLButtonElement;
  const chart = document.getElementById('measure-chart')!;
  let active = false;
  let pts: LngLat[] = [];
  let profileSeq = 0;

  // Elevation profile along the measured path, from the province's 1 m LiDAR DEM.
  async function drawProfile() {
    if (!opts.elevations || pts.length < 2) return;
    const mine = ++profileSeq;
    chart.hidden = false;
    chart.textContent = t('profile.loading');
    try {
      const samples = samplePath(pts, 120);
      const z = await opts.elevations(samples.map((s) => s.pt));
      if (mine !== profileSeq) return;
      const stats = profileStats(z);
      if (!stats) { chart.textContent = t('profile.none'); return; }
      const W = 320, H = 90, total = samples[samples.length - 1].d, span = Math.max(stats.max - stats.min, 1);
      const xy = samples.flatMap((s, i) => (z[i] === null ? [] : [`${((s.d / total) * W).toFixed(1)},${(H - 4 - ((z[i]! - stats.min) / span) * (H - 12)).toFixed(1)}`]));
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', t('profile.aria'));
      const area = document.createElementNS(svg.namespaceURI, 'polygon');
      area.setAttribute('points', `0,${H} ${xy.join(' ')} ${W},${H}`); area.setAttribute('class', 'prof-area');
      const line = document.createElementNS(svg.namespaceURI, 'polyline');
      line.setAttribute('points', xy.join(' ')); line.setAttribute('class', 'prof-line');
      svg.append(area, line);
      const cap = document.createElement('div');
      cap.className = 'prof-cap';
      const m = (v: number) => `${Math.round(v)} m`;
      cap.textContent = t('profile.stats', { min: m(stats.min), max: m(stats.max), up: m(stats.up), down: m(stats.down) });
      chart.replaceChildren(svg, cap);
    } catch {
      if (mine === profileSeq) chart.textContent = t('profile.none');
    }
  }
  const resetProfile = () => { profileSeq++; chart.hidden = true; chart.replaceChildren(); };

  map.addSource('measure', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'measure-fill', type: 'fill', source: 'measure', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#7fd0ff', 'fill-opacity': 0.15 } });
  map.addLayer({ id: 'measure-line', type: 'line', source: 'measure', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#7fd0ff', 'line-width': 2.5 } });
  map.addLayer({ id: 'measure-pts', type: 'circle', source: 'measure', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 4.5, 'circle-color': '#0b0f14', 'circle-stroke-color': '#7fd0ff', 'circle-stroke-width': 2 } });

  function draw() {
    const features: any[] = pts.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: {} }));
    if (pts.length >= 2) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts }, properties: {} });
    if (pts.length >= 3) features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]]] }, properties: {} });
    (map.getSource('measure') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features });
    resetProfile();
    profileBtn.hidden = !opts.elevations || pts.length < 2;
    if (pts.length < 2) readout.textContent = t('measure.hint');
    else {
      readout.replaceChildren();
      const b = document.createElement('b'); b.textContent = formatDistance(pathLengthM(pts));
      readout.append(`${t('measure.distance')}: `, b);
      if (pts.length >= 3) {
        const a = document.createElement('b'); a.textContent = formatArea(ringAreaM2(pts));
        readout.append(` · ${t('measure.area')}: `, a);
      }
    }
  }
  function setActive(next: boolean) {
    active = next;
    pts = [];
    draw();
    panel.hidden = !active;
    btn.classList.toggle('on', active);
    btn.textContent = t(active ? 'tools.measure.on' : 'tools.measure');
    map.getCanvas().style.cursor = active ? 'crosshair' : '';
    if (active) map.doubleClickZoom.disable(); else map.doubleClickZoom.enable();
    opts.onToggle?.(active);
  }

  map.on('click', (e) => { if (active) { pts.push([e.lngLat.lng, e.lngLat.lat]); draw(); } });
  btn.addEventListener('click', () => setActive(!active));
  profileBtn.addEventListener('click', () => void drawProfile());
  document.getElementById('measure-undo')!.addEventListener('click', () => { pts.pop(); draw(); });
  document.getElementById('measure-clear')!.addEventListener('click', () => { pts = []; draw(); });
  document.getElementById('measure-done')!.addEventListener('click', () => setActive(false));
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && active && !document.querySelector('dialog[open]')) setActive(false); });
  onLang(() => { btn.textContent = t(active ? 'tools.measure.on' : 'tools.measure'); if (active) draw(); });

  return { isActive: () => active, stop: () => { if (active) setActive(false); } };
}
