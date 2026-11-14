// Pure data shaping for the province's Protected Natural Areas service —
// no MapLibre/DOM here so the cleanup rules are unit-tested (test/pna.test.ts).
import { bboxOf, labelPoint, matchScore, type LngLat } from './geo';
import type { Lang } from './i18n';

export type PnaEntry = {
  id: number;
  nameEn: string;
  nameFr: string;
  cls: 'I' | 'II';
  ha: number;
  ownerEn: string;
  ownerFr: string;
  managedBy: string;
  iucn: string;
  yearProtected: number | null;
  yearExpanded: number | null;
  bbox: [number, number, number, number];
  label: LngLat;
  geometry: any;
};

const tidy = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').replace(/- (?=\p{Lu})/gu, '-').trim();
const year = (v: unknown) => (typeof v === 'number' && v > 1800 ? v : null);

/** The service packs both languages into one OWNER string ("English/Français")
 *  and ships the typo "Corounne" for every Crown-owned area. Split it and
 *  repair it; single-language owners are used for both. */
export function splitOwner(raw: unknown): { en: string; fr: string } {
  const s = tidy(raw);
  if (!s) return { en: '', fr: '' };
  const i = s.indexOf('/');
  const en = i < 0 ? s : s.slice(0, i).trim();
  const fr = (i < 0 ? s : s.slice(i + 1).trim()).replace(/Corounne/i, 'Couronne');
  return { en, fr: fr || en };
}

/** One clean record per GeoJSON feature; features without usable geometry
 *  or name are dropped rather than rendered half-empty. */
export function toPnaEntry(f: any): PnaEntry | null {
  const p = f?.properties ?? {};
  const bbox = bboxOf(f?.geometry);
  const label = labelPoint(f?.geometry);
  const nameEn = tidy(p.NAME), nameFr = tidy(p.NOM);
  if (!bbox || !label || !(nameEn || nameFr)) return null;
  const owner = splitOwner(p.OWNER);
  return {
    id: Number(p.OBJECTID ?? f.id),
    nameEn: nameEn || nameFr,
    nameFr: nameFr || nameEn,
    cls: tidy(p.CLASS).toUpperCase() === 'I' ? 'I' : 'II',
    ha: Number(p.HECTARES) || 0,
    ownerEn: owner.en,
    ownerFr: owner.fr,
    managedBy: tidy(p.MANAGED_BY),
    iucn: tidy(p.IUCN_CATEGORY),
    yearProtected: year(p.YEAR_PROTECTED),
    yearExpanded: year(p.YEAR_AMENDED),
    bbox, label, geometry: f.geometry,
  };
}

export const pnaName = (e: PnaEntry, lang: Lang) => (lang === 'fr' ? e.nameFr : e.nameEn);

/** Rank areas against a query, matching either language's name without
 *  accents ("ile verte" finds Île Verte / Green Island). Best match first,
 *  then the active language's match, then larger areas. */
export function searchPna(entries: PnaEntry[], query: string, lang: Lang, limit = 6): PnaEntry[] {
  const scored: { e: PnaEntry; s: number }[] = [];
  for (const e of entries) {
    const own = matchScore(pnaName(e, lang), query);
    const other = matchScore(lang === 'fr' ? e.nameEn : e.nameFr, query);
    const s = Math.max(own * 2 + 1, other * 2);
    if (own || other) scored.push({ e, s });
  }
  scored.sort((a, b) => b.s - a.s || b.e.ha - a.e.ha);
  return scored.slice(0, limit).map((x) => x.e);
}
