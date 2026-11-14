// Pure data shaping for GeoNB's Survey Control Network — the provincial
// geodetic framework of brass-marked monuments (the NB Control Survey System).
// No MapLibre/DOM here so the shaping rules are unit-tested
// (test/features.test.ts).
import { haversineM, type LngLat } from './geo';

export type SurveyNet = 'hpn' | 'conv';

export type SurveyPoint = {
  net: SurveyNet;
  /** Monument number, as text (the services mix numbers and strings). */
  mon: string;
  /** Station name — High Precision Network only. */
  name: string;
  pt: LngLat;
  /** Orthometric height (HPN) or published elevation (conventional), metres. */
  heightM: number | null;
  /** NAD83 (CSRS) grid coordinates, metres. */
  easting: number | null;
  northing: number | null;
  status: string;
  /** Survey order (HPN) or class code. */
  orderClass: string;
  /** Last inspection date, ISO yyyy-mm-dd — HPN only. */
  inspected: string | null;
  /** Field-sketch reference. */
  sketch: string;
};

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const str = (v: unknown) => String(v ?? '').trim();

/** One clean record per GeoJSON feature; features without a point or a
 *  monument number are dropped rather than rendered half-empty. The two
 *  networks publish different field names for the same facts. */
export function toSurveyPoint(f: any, net: SurveyNet): SurveyPoint | null {
  const p = f?.properties ?? {};
  const c = f?.geometry?.coordinates;
  if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') return null;
  const mon = str(p.Mon);
  if (!mon) return null;
  const epoch = typeof p.DateInsp === 'number' && p.DateInsp > 0 ? p.DateInsp : null;
  return {
    net,
    mon,
    name: net === 'hpn' ? str(p.Name) : '',
    pt: [c[0], c[1]],
    heightM: net === 'hpn' ? (num(p.OrthoHt) ?? num(p.LevHt)) : num(p.Elev),
    easting: net === 'hpn' ? num(p.E83CS) : num(p.E83adj),
    northing: net === 'hpn' ? num(p.N83CS) : num(p.N83adj),
    status: str(p.Status),
    orderClass: net === 'hpn' ? (str(p.Order_) || str(p.class)) : str(p.class),
    inspected: epoch ? new Date(epoch).toISOString().slice(0, 10) : null,
    sketch: net === 'hpn' ? str(p.sketchNum) : str(p.sketch),
  };
}

/** The nearest monument within maxM metres of a click, or null. */
export function nearestSurvey(
  points: SurveyPoint[], pt: LngLat, maxM: number,
): { item: SurveyPoint; dist: number } | null {
  let best: { item: SurveyPoint; dist: number } | null = null;
  for (const item of points) {
    const d = haversineM(pt, item.pt);
    if (d <= maxM && (!best || d < best.dist)) best = { item, dist: d };
  }
  return best;
}
