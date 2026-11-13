// Shareable layer state. MapLibre's hash already carries position
// (#zoom/lat/lng/bearing/pitch); these query params carry what is switched
// on, so a copied link reopens the same map — the thing the provincial
// viewers cannot do at all.

export const BASE_KEYS = ['esri', 'geonb', 'topo', 'grey'] as const;
export type BaseKey = (typeof BASE_KEYS)[number];
export const LAYER_KEYS = ['year', 'b3d', 'contours', 'wetlands', 'pna', 'crown', 'ecoregions', 'ecodistricts',
  'parcels', 'localgov', 'roads', 'psw', 'flood'] as const;
export type LayerKey = (typeof LAYER_KEYS)[number];

export type ViewState = {
  base: BaseKey; layers: LayerKey[]; pnaClasses: ('I' | 'II')[];
  /** Imagery-year and LiDAR-terrain picks ('' = none); validated by the catalogue. */
  imagery: string; terrain: string;
};
export const DEFAULT_STATE: ViewState = { base: 'esri', layers: [], pnaClasses: ['I', 'II'], imagery: '', terrain: '' };

export function parseState(search: string): ViewState {
  const p = new URLSearchParams(search);
  const base = BASE_KEYS.find((k) => k === p.get('base')) ?? DEFAULT_STATE.base;
  const wanted = (p.get('layers') ?? '').split(',');
  const layers = LAYER_KEYS.filter((k) => wanted.includes(k));
  const cls = p.get('pna');
  const pnaClasses: ('I' | 'II')[] = cls === 'I' ? ['I'] : cls === 'II' ? ['II'] : cls === 'none' ? [] : ['I', 'II'];
  const slug = (v: string | null) => (v && /^[a-z0-9]{1,16}$/.test(v) ? v : '');
  return { base, layers, pnaClasses, imagery: slug(p.get('img')), terrain: slug(p.get('terrain')) };
}

/** Write state into a query string, keeping unrelated params (lang, utm…)
 *  and dropping ours when they are at their defaults so plain links stay plain. */
export function writeState(search: string, s: ViewState): string {
  const p = new URLSearchParams(search);
  if (s.base === DEFAULT_STATE.base) p.delete('base'); else p.set('base', s.base);
  const layers = LAYER_KEYS.filter((k) => s.layers.includes(k));
  if (layers.length) p.set('layers', layers.join(',')); else p.delete('layers');
  const both = s.pnaClasses.includes('I') && s.pnaClasses.includes('II');
  if (both) p.delete('pna'); else p.set('pna', s.pnaClasses[0] ?? 'none');
  if (s.imagery) p.set('img', s.imagery); else p.delete('img');
  if (s.terrain) p.set('terrain', s.terrain); else p.delete('terrain');
  const out = p.toString().replaceAll('%2C', ',');
  return out ? '?' + out : '';
}
