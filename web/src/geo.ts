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

// ---------- Measuring, hit-testing and text helpers (search, measure, popups) ----------

const R_EARTH = 6371008.8; // mean Earth radius, metres
const rad = (d: number) => (d * Math.PI) / 180;
export type LngLat = [number, number];

/** Great-circle distance between two [lng, lat] points, in metres. */
export function haversineM(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]), dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Length of a path of [lng, lat] vertices, in metres. */
export function pathLengthM(pts: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += haversineM(pts[i - 1], pts[i]);
  return total;
}

/** Area enclosed by a ring of [lng, lat] vertices on the sphere, in square
 *  metres. The ring is closed implicitly; winding does not matter. */
export function ringAreaM2(ring: LngLat[]): number {
  if (ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    sum += rad(q[0] - p[0]) * (2 + Math.sin(rad(p[1])) + Math.sin(rad(q[1])));
  }
  return Math.abs((sum * R_EARTH * R_EARTH) / 2);
}

function inRing(pt: LngLat, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when pt lies inside a GeoJSON Polygon / MultiPolygon geometry
 *  (holes respected). */
export function pointInGeometry(pt: LngLat, geom: any): boolean {
  if (!geom) return false;
  const polys: number[][][][] =
    geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  return polys.some((rings) => rings.length > 0 && inRing(pt, rings[0]) && !rings.slice(1).some((h) => inRing(pt, h)));
}

/** [west, south, east, north] of any GeoJSON geometry, or null when empty. */
export function bboxOf(geom: any): [number, number, number, number] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (c: any) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number') {
      if (c[0] < w) w = c[0];
      if (c[0] > e) e = c[0];
      if (c[1] < s) s = c[1];
      if (c[1] > n) n = c[1];
    } else c.forEach(walk);
  };
  walk(geom?.coordinates);
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

/** A point guaranteed to sit on the biggest part of a polygon geometry —
 *  where its label goes. Vertex mean when that lands inside, otherwise the
 *  midpoint of the widest interior span along the part's middle latitude
 *  (handles crescents and rings, where the mean falls outside). */
export function labelPoint(geom: any): LngLat | null {
  const polys: number[][][][] =
    geom?.type === 'Polygon' ? [geom.coordinates] : geom?.type === 'MultiPolygon' ? geom.coordinates : [];
  let best: number[][][] | null = null, bestArea = -1;
  for (const rings of polys) {
    if (!rings.length) continue;
    const a = ringAreaM2(rings[0] as LngLat[]);
    if (a > bestArea) { bestArea = a; best = rings; }
  }
  if (!best) return null;
  const outer = best[0];
  let x = 0, y = 0;
  for (const p of outer) { x += p[0]; y += p[1]; }
  const mean: LngLat = [x / outer.length, y / outer.length];
  const part = { type: 'Polygon', coordinates: best };
  if (pointInGeometry(mean, part)) return mean;
  const bb = bboxOf(part)!;
  const lat = (bb[1] + bb[3]) / 2;
  const xs: number[] = [];
  for (const ring of best) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat)) xs.push(((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    }
  }
  xs.sort((a, b) => a - b);
  let span: LngLat | null = null, width = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i + 1] - xs[i] > width) { width = xs[i + 1] - xs[i]; span = [(xs[i] + xs[i + 1]) / 2, lat]; }
  }
  return span ?? mean;
}

/** Lower-case, accent-free, punctuation-free form for matching, so
 *  "Île Verte", "ile verte" and "ILE-VERTE" all compare equal. */
export function foldText(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Match quality of a query against a name: 3 = starts the name, 2 = starts
 *  a word in it, 1 = appears somewhere, 0 = no match. Both sides folded. */
export function matchScore(name: string, query: string): number {
  const n = foldText(name), q = foldText(query);
  if (!q || !n) return 0;
  if (n.startsWith(q)) return 3;
  if ((' ' + n).includes(' ' + q)) return 2;
  return n.includes(q) ? 1 : 0;
}

/** Parse "45.96, -66.64", "-66.64 45.96" or "45.96N 66.64W" into [lng, lat].
 *  Order is inferred for New Brunswick-ish input (a negative or >90 value is
 *  the longitude); returns null for anything that is not a coordinate pair. */
export function parseCoords(input: string): LngLat | null {
  const m = input.trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([NSEW])?\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([NSEW])?$/i);
  if (!m) return null;
  let a = parseFloat(m[1]), b = parseFloat(m[3]);
  const ha = m[2]?.toUpperCase(), hb = m[4]?.toUpperCase();
  if (ha === 'S' || ha === 'W') a = -Math.abs(a);
  if (hb === 'S' || hb === 'W') b = -Math.abs(b);
  let lat: number, lng: number;
  if (ha === 'E' || ha === 'W' || hb === 'N' || hb === 'S') { lng = a; lat = b; }
  else if (ha === 'N' || ha === 'S' || hb === 'E' || hb === 'W') { lat = a; lng = b; }
  else if (Math.abs(a) > 90 || (a < 0 && b > 0)) { lng = a; lat = b; }
  else { lat = a; lng = b; }
  // Bare "45.96 66.64": a positive longitude this far west is a missing minus sign.
  if (!ha && !hb && lng > 0 && lat > 40 && lat < 50 && lng > 60 && lng < 70) lng = -lng;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lng, lat];
}

/** "842 m" / "3.42 km" */
export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 100000 ? 2 : 1)} km`;
}

/** "640 m²" / "2.31 ha" / "14.2 km²" — hectares in the range land people use them. */
export function formatArea(m2: number): string {
  if (m2 < 10000) return `${Math.round(m2)} m²`;
  if (m2 < 1e7) return `${(m2 / 10000).toFixed(2)} ha`;
  return `${(m2 / 1e6).toFixed(m2 < 1e9 ? 2 : 0)} km²`;
}

/** "96 Rue REGENT Street Aucun, Fredericton" -> "96 Rue REGENT Street, Fredericton":
 *  the address locator spells out an empty direction field as "Aucun" (none). */
export function tidyAddress(text: string): string {
  return text.replace(/\s+Aucun\b/gi, '').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();
}

/** SQL LIKE prefix for the place-name service: upper-cased, quotes doubled,
 *  LIKE wildcards stripped so user input cannot widen the match. */
export function likePrefix(query: string): string {
  return query.trim().toUpperCase().replace(/[%_]/g, '').replace(/'/g, "''");
}

// ---------- Elevation profile + property-number helpers ----------

/** n points spaced evenly along a path, each with its distance from the
 *  start in metres. Vertices are not guaranteed to be hit; n >= 2. */
export function samplePath(pts: LngLat[], n: number): { pt: LngLat; d: number }[] {
  if (pts.length < 2 || n < 2) return [];
  const seg = pts.slice(1).map((p, i) => haversineM(pts[i], p));
  const total = seg.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return [];
  const out: { pt: LngLat; d: number }[] = [];
  let i = 0, before = 0;
  for (let k = 0; k < n; k++) {
    const d = (total * k) / (n - 1);
    while (i < seg.length - 1 && d > before + seg[i]) { before += seg[i]; i++; }
    const f = seg[i] > 0 ? Math.min(1, (d - before) / seg[i]) : 0;
    out.push({ pt: [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f], d });
  }
  return out;
}

/** Min / max / total climb and drop of an elevation series; gaps (null) are skipped. */
export function profileStats(elev: (number | null)[]): { min: number; max: number; up: number; down: number } | null {
  const v = elev.filter((e): e is number => e !== null && Number.isFinite(e));
  if (!v.length) return null;
  let up = 0, down = 0;
  for (let i = 1; i < v.length; i++) { const dz = v[i] - v[i - 1]; if (dz > 0) up += dz; else down -= dz; }
  return { min: Math.min(...v), max: Math.max(...v), up, down };
}

/** A typed property number: "PID 01460625", "pan 887339" or a bare 4-8 digit
 *  number. Returns the integer the services index on, or null. */
export function parsePropertyId(q: string): { n: number; kind: 'pid' | 'pan' | 'either' } | null {
  const m = q.trim().match(/^(pid|pan|nid|npe)?\s*[:#]?\s*(\d{4,8})$/i);
  if (!m) return null;
  const tag = m[1]?.toLowerCase();
  return { n: parseInt(m[2], 10), kind: tag === 'pid' || tag === 'nid' ? 'pid' : tag ? 'pan' : 'either' };
}

/** GeoNB stores dates as "7/9/2019" (month/day/year) strings. ISO out, or null. */
export function parseUsDate(s: unknown): string | null {
  const m = String(s ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const mo = Number(m[1]), d = Number(m[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Closest sounding to pt within maxM metres, or null. Linear scan — the
 *  Fredericton reach holds ~2,400 soundings. */
export function nearestSounding<T extends { pt: LngLat }>(list: T[], pt: LngLat, maxM: number): { item: T; dist: number } | null {
  let best: T | null = null, bestD = maxM;
  for (const s of list) {
    const d = haversineM(s.pt, pt);
    if (d <= bestD) { bestD = d; best = s; }
  }
  return best ? { item: best, dist: bestD } : null;
}
