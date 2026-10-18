// Pure geospatial helpers shared by the viewer's loaders and the OSM
// comparison overlay. Kept free of MapLibre/DOM imports so they can be
// unit-tested in isolation (web/test/geo.test.ts).

/** Stable dedupe key for an ArcGIS GeoJSON feature: the service's own id
 *  when present, otherwise a geometry-derived fallback. */
export function featKey(f: any): string {
  const p = f.properties ?? {};
  const id = f.id ?? p.OBJECTID_1 ?? p.OBJECTID ?? p.Road_Segment_ID;
  if (id !== undefined && id !== null) return 'id:' + id;
  const c = f.geometry?.coordinates;
  return 'g:' + JSON.stringify(f.geometry?.type) + ':' + JSON.stringify(c?.[0]?.[0] ?? c);
}

/** Convert Overpass API elements (with `geometry` arrays) to a GeoJSON
 *  FeatureCollection of Polygons (buildings) or LineStrings (roads). */
export function osmToGeojson(elements: any[], want: 'building' | 'road') {
  const feats: any[] = [];
  for (const el of elements ?? []) {
    const g = el.geometry;
    if (!g || g.length < 2) continue;
    const coords = g.map((p: any) => [p.lon, p.lat]);
    feats.push({
      type: 'Feature',
      geometry: want === 'building'
        ? { type: 'Polygon', coordinates: [[...coords, coords[0]]] }
        : { type: 'LineString', coordinates: coords },
      properties: el.tags ?? {},
    });
  }
  return { type: 'FeatureCollection', features: feats };
}

/** One representative point per feature: mean of the outer ring (polygons)
 *  or of the line vertices. Good enough for proximity matching. */
export function centroids(fc: any): [number, number][] {
  return (fc.features ?? []).map((f: any) => {
    const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates;
    let x = 0, y = 0;
    for (const p of ring) { x += p[0]; y += p[1]; }
    return [x / ring.length, y / ring.length] as [number, number];
  });
}

/** Percentage of src points with a dst point within radiusM metres
 *  (equirectangular approximation at ~46 deg N). Capped at 2500 points
 *  per side to bound the O(n^2) scan in the browser. */
export function matchPct(src: [number, number][], dst: [number, number][], radiusM: number): number {
  if (!src.length || !dst.length) return 0;
  const cap = 2500;
  let hits = 0;
  const n = Math.min(src.length, cap);
  for (const s of src.slice(0, cap)) {
    for (const t of dst.slice(0, cap)) {
      const dx = (s[0] - t[0]) * 78847, dy = (s[1] - t[1]) * 110540;
      if (dx * dx + dy * dy <= radiusM * radiusM) { hits++; break; }
    }
  }
  return Math.round((100 * hits) / n);
}
