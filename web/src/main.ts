import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

const ARCGIS = 'https://geonb.snb.ca/arcgis/rest/services';
const exportTile = (service: string, transparent: boolean) =>
  `${ARCGIS}/${service}/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857` +
  `&size=512,512&format=png32&transparent=${transparent}&dpi=96&f=image`;

const VIEWS: Record<string, { center: [number, number]; zoom: number }> = {
  downtown: { center: [-66.6431, 45.9636], zoom: 15.5 },
  unb: { center: [-66.7095, 45.9475], zoom: 14.5 },
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
  },
  layers: [
    { id: 'geonb-imagery', type: 'raster', source: 'geonb-imagery', layout: { visibility: 'visible' } },
    { id: 'geonb-topo', type: 'raster', source: 'geonb-topo', layout: { visibility: 'none' } },
    { id: 'esri-imagery', type: 'raster', source: 'esri-imagery', layout: { visibility: 'none' } },
    {
      id: 'geonb-imagery-year', type: 'raster', source: 'geonb-imagery-year',
      layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.55 },
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
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
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
    if (v) map.flyTo({ center: v.center, zoom: v.zoom, duration: 1600 });
  });
});
