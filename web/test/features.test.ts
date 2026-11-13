import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  haversineM, pathLengthM, ringAreaM2, pointInGeometry, bboxOf, labelPoint, foldText, matchScore,
  parseCoords, formatDistance, formatArea, tidyAddress, likePrefix, type LngLat,
} from '../src/geo';
import { splitOwner, toPnaEntry, searchPna, type PnaEntry } from '../src/pna';
import { buildPdf, pageSizePt, niceScale } from '../src/pdf';
import { parseState, writeState, DEFAULT_STATE } from '../src/urlstate';
import { detectLang, i18nKeys, i18nRow, TOUR_TEXT } from '../src/i18n';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const load = (name: string) => JSON.parse(readFileSync(join(fixtures, name), 'utf8'));

describe('measuring', () => {
  it('haversine: one degree of latitude is ~111.2 km', () => {
    expect(haversineM([-66, 45], [-66, 46])).toBeGreaterThan(111_000);
    expect(haversineM([-66, 45], [-66, 46])).toBeLessThan(111_400);
    expect(haversineM([-66.6, 45.9], [-66.6, 45.9])).toBe(0);
  });
  it('pathLengthM sums segments', () => {
    const pts: LngLat[] = [[-66, 45], [-66, 46], [-66, 47]];
    expect(pathLengthM(pts)).toBeCloseTo(haversineM(pts[0], pts[1]) + haversineM(pts[1], pts[2]), 6);
    expect(pathLengthM([pts[0]])).toBe(0);
  });
  it('ringAreaM2: a ~1 km square at 46°N is ~100 ha, either winding', () => {
    const dLat = 1000 / 111195, dLng = 1000 / (111195 * Math.cos((46 * Math.PI) / 180));
    const sq: LngLat[] = [[-66, 46], [-66 + dLng, 46], [-66 + dLng, 46 + dLat], [-66, 46 + dLat]];
    expect(ringAreaM2(sq) / 10000).toBeCloseTo(100, 0);
    expect(ringAreaM2([...sq].reverse())).toBeCloseTo(ringAreaM2(sq), 3);
    expect(ringAreaM2(sq.slice(0, 2))).toBe(0);
  });
  it('agrees with the province: Bull Pasture Bog measures close to its listed hectares', () => {
    const f = load('pna-class1.json').features[0];
    const ha = ringAreaM2(f.geometry.coordinates[0]) / 10000;
    // fixture geometry is simplified, so allow a few percent
    expect(Math.abs(ha - f.properties.HECTARES) / f.properties.HECTARES).toBeLessThan(0.06);
  });
  it('formats in the units people use', () => {
    expect(formatDistance(842.4)).toBe('842 m');
    expect(formatDistance(3421)).toBe('3.42 km');
    expect(formatArea(640)).toBe('640 m²');
    expect(formatArea(23100)).toBe('2.31 ha');
    expect(formatArea(14_200_000)).toBe('14.20 km²');
  });
});

describe('hit-testing and labels', () => {
  const donut = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] };
  it('respects holes and multipolygons', () => {
    expect(pointInGeometry([1, 1], donut)).toBe(true);
    expect(pointInGeometry([5, 5], donut)).toBe(false);
    expect(pointInGeometry([11, 5], donut)).toBe(false);
    const multi = { type: 'MultiPolygon', coordinates: [donut.coordinates, [[[20, 20], [21, 20], [21, 21], [20, 21], [20, 20]]]] };
    expect(pointInGeometry([20.5, 20.5], multi)).toBe(true);
    expect(pointInGeometry([5, 5], multi)).toBe(false);
    expect(pointInGeometry([1, 1], null)).toBe(false);
  });
  it('bboxOf walks any nesting', () => {
    expect(bboxOf(donut)).toEqual([0, 0, 10, 10]);
    expect(bboxOf({ type: 'Polygon', coordinates: [] })).toBeNull();
  });
  it('labelPoint always lands inside, even when the vertex mean does not', () => {
    expect(pointInGeometry(labelPoint(donut)!, donut)).toBe(true);
    const cShape = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 2], [2, 2], [2, 8], [10, 8], [10, 10], [0, 10], [0, 0]]] };
    expect(pointInGeometry(labelPoint(cShape)!, cShape)).toBe(true);
    for (const f of [...load('pna-class1.json').features, ...load('pna-class2.json').features])
      expect(pointInGeometry(labelPoint(f.geometry)!, f.geometry), f.properties.NAME).toBe(true);
  });
});

describe('search text', () => {
  it('folds accents, case and punctuation', () => {
    expect(foldText('Île-Verte')).toBe('ile verte');
    expect(foldText('  Caughey-Taylor, composante sur terrains privés ')).toBe('caughey taylor composante sur terrains prives');
  });
  it('ranks prefix > word start > substring', () => {
    expect(matchScore('Grand Lake', 'gra')).toBe(3);
    expect(matchScore('Little Grand Lake', 'grand')).toBe(2);
    expect(matchScore('Bull Pasture Bog', 'astur')).toBe(1);
    expect(matchScore('Bull Pasture Bog', 'xyz')).toBe(0);
    expect(matchScore('Anything', '')).toBe(0);
  });
  it('parses coordinates in the orders people type them', () => {
    expect(parseCoords('45.96, -66.64')).toEqual([-66.64, 45.96]);
    expect(parseCoords('-66.64 45.96')).toEqual([-66.64, 45.96]);
    expect(parseCoords('45.96N 66.64W')).toEqual([-66.64, 45.96]);
    expect(parseCoords('45.96 66.64')).toEqual([-66.64, 45.96]); // NB with the minus forgotten
    expect(parseCoords('96 Regent St')).toBeNull();
    expect(parseCoords('Grand Lake')).toBeNull();
    expect(parseCoords('95, 200')).toBeNull();
  });
  it('tidies the geocoder’s empty-direction filler', () => {
    expect(tidyAddress('96 Rue REGENT Street Aucun, Fredericton')).toBe('96 Rue REGENT Street, Fredericton');
    expect(tidyAddress('96 REGENT Street')).toBe('96 REGENT Street');
  });
  it('likePrefix cannot be widened or broken out of', () => {
    expect(likePrefix(" o'del%l_ ")).toBe("O''DELL");
  });
});

describe('protected natural areas', () => {
  const entries = [...load('pna-class1.json').features, ...load('pna-class2.json').features]
    .map(toPnaEntry).filter((e): e is PnaEntry => !!e);
  it('repairs the service’s "Corounne" typo and splits the bilingual owner', () => {
    expect(splitOwner('Crown/Corounne')).toEqual({ en: 'Crown', fr: 'Couronne' });
    expect(splitOwner('Nature Trust of New Brunswick/Fondation pour la protection des sites naturels du Nouveau- Brunswick'))
      .toEqual({ en: 'Nature Trust of New Brunswick', fr: 'Fondation pour la protection des sites naturels du Nouveau-Brunswick' });
    expect(splitOwner('Meduxnekeag River Association Inc. ')).toEqual({ en: 'Meduxnekeag River Association Inc.', fr: 'Meduxnekeag River Association Inc.' });
    expect(splitOwner(null)).toEqual({ en: '', fr: '' });
  });
  it('shapes real service features', () => {
    expect(entries).toHaveLength(4);
    const grand = entries.find((e) => e.nameEn === 'Grand Lake')!;
    expect(grand).toMatchObject({ cls: 'II', nameFr: 'Grand Lac', ownerEn: 'Crown', ownerFr: 'Couronne', yearProtected: 2003, yearExpanded: 2014 });
    expect(grand.ha).toBeCloseTo(10463.6, 1);
    const bog = entries.find((e) => e.nameEn === 'Bull Pasture Bog')!;
    expect(bog.cls).toBe('I');
    expect(bog.yearExpanded).toBeNull(); // the service stores "never" as 0
  });
  it('drops features it cannot draw or name', () => {
    expect(toPnaEntry({ properties: { NAME: 'x' }, geometry: null })).toBeNull();
    expect(toPnaEntry({ properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } })).toBeNull();
  });
  it('searches both languages without accents', () => {
    expect(searchPna(entries, 'grand la', 'en')[0].nameEn).toBe('Grand Lake');
    expect(searchPna(entries, 'ile verte', 'en')[0].nameEn).toBe('Green Island');
    expect(searchPna(entries, 'grand lac', 'fr')[0].nameFr).toBe('Grand Lac');
    expect(searchPna(entries, 'zzz', 'en')).toEqual([]);
    expect(searchPna(entries, 'b', 'en', 1)).toHaveLength(1);
  });
});

describe('pdf export', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const pdf = buildPdf(jpeg, 200, 100, ...pageSizePt('a4', true), 'Map (test) \\ é');
  const text = new TextDecoder('latin1').decode(pdf);
  it('is a one-page PDF at the requested paper size', () => {
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/MediaBox [0 0 841.89 595.28]');
    expect(text).toContain('/Count 1');
    expect(text).toContain('/Title (Map \\(test\\) \\\\ ?)');
  });
  it('has an xref table whose offsets point at the objects', () => {
    const start = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(start, start + 4)).toBe('xref');
    const offsets = [...text.slice(start).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(6);
    offsets.forEach((off, i) => expect(text.slice(off, off + 7)).toBe(`${i + 1} 0 obj`));
  });
  it('embeds the JPEG bytes untouched', () => {
    const at = text.indexOf('stream\n') + 7;
    expect([...pdf.slice(at, at + jpeg.length)]).toEqual([...jpeg]);
    expect(text).toContain(`/Length ${jpeg.length}`);
  });
  it('paper sizes and scale bars', () => {
    expect(pageSizePt('letter', false)).toEqual([612, 792]);
    expect(pageSizePt('tabloid', true)).toEqual([1224, 792]);
    expect(pageSizePt('nonsense', false)).toEqual([612, 792]);
    expect([niceScale(1), niceScale(3.7), niceScale(999), niceScale(74000), niceScale(0)]).toEqual([1, 2, 500, 50000, 0]);
  });
});

describe('shareable state', () => {
  it('round-trips layers, basemap and class filter', () => {
    const q = writeState('', { base: 'topo', layers: ['crown', 'pna'], pnaClasses: ['I'] });
    expect(q).toBe('?base=topo&layers=pna,crown&pna=I');
    expect(parseState(q)).toEqual({ base: 'topo', layers: ['pna', 'crown'], pnaClasses: ['I'] });
  });
  it('keeps plain links plain and foreign params intact', () => {
    expect(writeState('', DEFAULT_STATE)).toBe('');
    expect(writeState('?lang=fr&base=topo', DEFAULT_STATE)).toBe('?lang=fr');
  });
  it('ignores junk', () => {
    expect(parseState('?base=evil&layers=pna,<script>,nope&pna=III')).toEqual({ base: 'esri', layers: ['pna'], pnaClasses: ['I', 'II'] });
    expect(parseState('?pna=none').pnaClasses).toEqual([]);
  });
});

describe('i18n', () => {
  it('every string exists in both languages with the same placeholders', () => {
    for (const key of i18nKeys()) {
      const [en, fr] = i18nRow(key)!;
      expect(en.length && fr.length, key).toBeTruthy();
      const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(vars(fr), key).toEqual(vars(en));
    }
    expect(TOUR_TEXT.fr).toHaveLength(TOUR_TEXT.en.length);
  });
  it('every key used in the markup is defined', () => {
    const html = readFileSync(join(fixtures, '..', '..', 'index.html'), 'utf8');
    const used = new Set<string>();
    for (const m of html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) used.add(m[1]);
    for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) m[1].split(';').forEach((p) => used.add(p.split(':')[1]));
    expect(used.size).toBeGreaterThan(40);
    for (const key of used) expect(i18nRow(key), key).toBeDefined();
  });
  it('picks the language: link, then saved choice, then browser', () => {
    expect(detectLang('?lang=fr', 'en', 'en-CA')).toBe('fr');
    expect(detectLang('', 'fr', 'en-CA')).toBe('fr');
    expect(detectLang('', null, 'fr-CA')).toBe('fr');
    expect(detectLang('?lang=xx', null, 'en-US')).toBe('en');
    expect(detectLang('', null, undefined)).toBe('en');
  });
});
