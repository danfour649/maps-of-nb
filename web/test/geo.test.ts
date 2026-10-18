import { describe, it, expect } from 'vitest';
import { featKey, osmToGeojson, centroids, matchPct } from '../src/geo';

describe('featKey', () => {
  it('prefers the top-level id, then OBJECTID_1, OBJECTID, Road_Segment_ID', () => {
    expect(featKey({ id: 7, properties: { OBJECTID_1: 9 } })).toBe('id:7');
    expect(featKey({ properties: { OBJECTID_1: 9, OBJECTID: 3 } })).toBe('id:9');
    expect(featKey({ properties: { OBJECTID: 3 } })).toBe('id:3');
    expect(featKey({ properties: { Road_Segment_ID: 42 } })).toBe('id:42');
  });
  it('falls back to geometry when no id exists', () => {
    const f = { properties: {}, geometry: { type: 'Point', coordinates: [-66.6, 45.9] } };
    expect(featKey(f)).toContain('-66.6');
  });
});

describe('osmToGeojson', () => {
  const el = {
    type: 'way', tags: { building: 'yes' },
    geometry: [{ lon: -66.64, lat: 45.96 }, { lon: -66.63, lat: 45.96 }, { lon: -66.63, lat: 45.97 }],
  };
  it('closes building polygons', () => {
    const fc = osmToGeojson([el], 'building');
    const ring = fc.features[0].geometry.coordinates[0];
    expect(fc.features[0].geometry.type).toBe('Polygon');
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(fc.features[0].properties).toEqual({ building: 'yes' });
  });
  it('keeps roads as open LineStrings', () => {
    const fc = osmToGeojson([el], 'road');
    expect(fc.features[0].geometry.type).toBe('LineString');
    expect(fc.features[0].geometry.coordinates).toHaveLength(3);
  });
  it('skips elements without usable geometry', () => {
    expect(osmToGeojson([{ type: 'node', tags: {} }, { geometry: [{ lon: 0, lat: 0 }] }], 'road').features).toHaveLength(0);
    expect(osmToGeojson([], 'building').features).toHaveLength(0);
  });
});

describe('centroids', () => {
  it('averages polygon outer-ring vertices', () => {
    const fc = { features: [{ geometry: { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] } }] };
    // ring includes the closing point twice-weighted, as in real GeoJSON
    expect(centroids(fc)[0]).toEqual([0.8, 0.8]);
  });
  it('averages line vertices', () => {
    const fc = { features: [{ geometry: { type: 'LineString', coordinates: [[0, 0], [3, 3]] } }] };
    expect(centroids(fc)[0]).toEqual([1.5, 1.5]);
  });
});

describe('matchPct', () => {
  const a: [number, number][] = [[-66.64, 45.96], [-66.65, 45.97]];
  it('is 100 for identical sets', () => {
    expect(matchPct(a, a, 15)).toBe(100);
  });
  it('is 0 for disjoint sets and empty inputs', () => {
    expect(matchPct(a, [[-66.0, 45.0]], 15)).toBe(0);
    expect(matchPct([], a, 15)).toBe(0);
    expect(matchPct(a, [], 15)).toBe(0);
  });
  it('counts partial overlap', () => {
    expect(matchPct(a, [[-66.64, 45.96]], 15)).toBe(50);
  });
  it('respects the radius: ~100 m away does not match at 15 m', () => {
    const near: [number, number][] = [[-66.64 + 100 / 78847, 45.96]];
    expect(matchPct([a[0]], near, 15)).toBe(0);
    expect(matchPct([a[0]], near, 150)).toBe(100);
  });
});
