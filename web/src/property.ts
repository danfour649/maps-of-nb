// Pure shaping of GeoNB property-assessment records (unit-tested).
import { parseUsDate } from './geo';

export type Assessment = {
  pan: string; location: string; description: string; authority: string; year: string;
  assessed: number | null; levy: number | null; saleDate: string | null; salePrice: number | null; geometry: any;
};
const num = (v: unknown) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : null; };
export const txt = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
export const PAN_FIELDS = 'Pan,Location,Descript,TA_Desc,Assess_Yr,Trans_Date,Sale_Val,Assess_Val,Tax_Levy';

/** One clean record per assessment polygon (the service stores money as strings). */
export function toAssessment(f: any): Assessment {
  const p = f?.properties ?? {};
  return {
    pan: txt(p.Pan), location: txt(p.Location), description: txt(p.Descript), authority: txt(p.TA_Desc), year: txt(p.Assess_Yr),
    assessed: num(p.Assess_Val), levy: num(p.Tax_Levy), saleDate: parseUsDate(p.Trans_Date), salePrice: num(p.Sale_Val),
    geometry: f?.geometry ?? null,
  };
}
