// Measure tool: click out a path, read distance and (from three points) the
// enclosed area. Geodesic maths live in geo.ts; this is the map plumbing.
import * as maplibregl from 'maplibre-gl';
import { pathLengthM, ringAreaM2, formatDistance, formatArea, type LngLat } from './geo';
import { t, onLang } from './i18n';

export function initMeasure(map: maplibregl.Map, opts: { onToggle?: (active: boolean) => void }) {
  const panel = document.getElementById('measure-panel')!;
  const readout = document.getElementById('measure-readout')!;
  const btn = document.getElementById('measure-btn') as HTMLButtonElement;
  let active = false;
  let pts: LngLat[] = [];

  map.addSource('measure', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'measure-fill', type: 'fill', source: 'measure', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#7fd0ff', 'fill-opacity': 0.15 } });
  map.addLayer({ id: 'measure-line', type: 'line', source: 'measure', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#7fd0ff', 'line-width': 2.5 } });
  map.addLayer({ id: 'measure-pts', type: 'circle', source: 'measure', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 4.5, 'circle-color': '#0b0f14', 'circle-stroke-color': '#7fd0ff', 'circle-stroke-width': 2 } });

  function draw() {
    const features: any[] = pts.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: {} }));
    if (pts.length >= 2) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts }, properties: {} });
    if (pts.length >= 3) features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]]] }, properties: {} });
    (map.getSource('measure') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features });
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
  document.getElementById('measure-undo')!.addEventListener('click', () => { pts.pop(); draw(); });
  document.getElementById('measure-clear')!.addEventListener('click', () => { pts = []; draw(); });
  document.getElementById('measure-done')!.addEventListener('click', () => setActive(false));
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && active && !document.querySelector('dialog[open]')) setActive(false); });
  onLang(() => { btn.textContent = t(active ? 'tools.measure.on' : 'tools.measure'); if (active) draw(); });

  return { isActive: () => active, stop: () => { if (active) setActive(false); } };
}
