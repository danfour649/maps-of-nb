// Search box: one input, four sources, grouped results.
//   1. coordinates typed directly ("45.96, -66.64")
//   2. Protected Natural Areas — a local index of the dataset, both languages,
//      accent-insensitive (the "dedicated dataset search" the province's
//      viewer has, minus the round trip)
//   3. official place names (GeoNB / NRCan geographic names)
//   4. civic addresses and streets (GeoNB composite geocoder)
// Everything stays inside New Brunswick's own services — no world geocoder.
import * as maplibregl from 'maplibre-gl';
import { parseCoords, foldText, tidyAddress, likePrefix, type LngLat } from './geo';
import { searchPna, pnaName, type PnaEntry } from './pna';
import { t, getLang, onLang } from './i18n';

const GEONB = 'https://geonb.snb.ca/arcgis/rest/services';
const GEOCODER = `${GEONB}/Geocoding/GeoNB_Composite_Geocoder_SubUnits/GeocodeServer`;

type Result = { group: string; label: string; sub?: string; run: () => void | Promise<void> };

export function initSearch(
  map: maplibregl.Map,
  opts: { pnaIndex: () => Promise<PnaEntry[]>; focusPna: (e: PnaEntry) => void },
) {
  const box = document.getElementById('search')!;
  const input = document.getElementById('search-input') as HTMLInputElement;
  const list = document.getElementById('search-results') as HTMLUListElement;
  const clearBtn = document.getElementById('search-clear') as HTMLButtonElement;
  const marker = new maplibregl.Marker({ color: '#7fd0ff' });
  let pna: PnaEntry[] = [];
  let results: Result[] = [];
  let active = -1;
  let seq = 0;
  let timer: number | undefined;
  let remote: { q: string; places: Result[]; addresses: Result[]; pending: boolean } = { q: '', places: [], addresses: [], pending: false };

  const goTo = (pt: LngLat, zoom: number) => {
    marker.setLngLat(pt).addTo(map);
    map.flyTo({ center: pt, zoom: Math.max(zoom, Math.min(map.getZoom(), 17)), duration: 1400 });
  };

  function localResults(q: string): Result[] {
    const out: Result[] = [];
    const pt = parseCoords(q);
    if (pt) {
      const v = `${pt[1].toFixed(5)}, ${pt[0].toFixed(5)}`;
      out.push({ group: t('search.group.coords'), label: t('search.goto', { v }), run: () => goTo(pt, 14) });
    }
    if (foldText(q).length >= 2) {
      const lang = getLang();
      for (const e of searchPna(pna, q, lang)) {
        out.push({
          group: t('search.group.pna'),
          label: pnaName(e, lang),
          sub: `${t(e.cls === 'I' ? 'pna.c1.short' : 'pna.c2.short')} · ${Math.round(e.ha).toLocaleString()} ha`,
          run: () => { marker.remove(); opts.focusPna(e); },
        });
      }
    }
    return out;
  }

  async function fetchPlaces(q: string, signal: AbortSignal): Promise<Result[]> {
    const params = new URLSearchParams({
      where: `UPPER(GEONAME) LIKE '${likePrefix(q)}%'`, outFields: 'GEONAME,GENERIC,LOCATION',
      outSR: '4326', returnGeometry: 'true', resultRecordCount: '6', orderByFields: 'GEONAME', f: 'json',
    });
    const j = await (await fetch(`${GEONB}/GeoNB_NRCan_PlaceNames/MapServer/0/query?${params}`, { signal })).json();
    return (j.features ?? []).filter((f: any) => f.geometry).map((f: any): Result => {
      const a = f.attributes ?? {};
      const pt: LngLat = [f.geometry.x, f.geometry.y];
      const big = /city|town|village|cité|ville/i.test(a.GENERIC ?? '');
      return {
        group: t('search.group.place'), label: a.GEONAME,
        sub: [a.GENERIC, a.LOCATION].filter(Boolean).join(' · '),
        run: () => goTo(pt, big ? 12 : 13.5),
      };
    });
  }

  async function fetchAddresses(q: string, signal: AbortSignal): Promise<Result[]> {
    const params = new URLSearchParams({ text: q, maxSuggestions: '5', f: 'json' });
    const j = await (await fetch(`${GEOCODER}/suggest?${params}`, { signal })).json();
    const seen = new Set<string>();
    const out: Result[] = [];
    for (const s of j.suggestions ?? []) {
      const label = tidyAddress(s.text ?? '');
      if (!label || seen.has(label)) continue;
      seen.add(label);
      out.push({
        group: t('search.group.address'), label,
        run: async () => {
          const p = new URLSearchParams({ SingleLine: s.text, magicKey: s.magicKey ?? '', maxLocations: '1', outSR: '4326', f: 'json' });
          const c = (await (await fetch(`${GEOCODER}/findAddressCandidates?${p}`)).json()).candidates?.[0];
          if (c?.location) goTo([c.location.x, c.location.y], 17);
        },
      });
    }
    return out;
  }

  function render(q: string) {
    results = [...localResults(q), ...(remote.q === q ? [...remote.places, ...remote.addresses] : [])];
    list.replaceChildren();
    active = results.length ? 0 : -1;
    let group = '';
    results.forEach((r, i) => {
      if (r.group !== group) {
        group = r.group;
        const h = document.createElement('li');
        h.className = 'sr-group'; h.setAttribute('role', 'presentation'); h.textContent = group;
        list.append(h);
      }
      const li = document.createElement('li');
      li.id = `sr-${i}`; li.className = 'sr-item'; li.setAttribute('role', 'option');
      const main = document.createElement('span'); main.textContent = r.label;
      li.append(main);
      if (r.sub) { const sub = document.createElement('small'); sub.textContent = r.sub; li.append(sub); }
      // mousedown, not click: fire before the input's blur closes the list.
      li.addEventListener('mousedown', (ev) => { ev.preventDefault(); pick(i); });
      list.append(li);
    });
    if (!results.length && q.trim().length >= 2) {
      const li = document.createElement('li');
      li.className = 'sr-note'; li.setAttribute('role', 'presentation');
      li.textContent = remote.pending || remote.q !== q ? t('search.searching') : t('search.none');
      list.append(li);
    }
    setOpen(list.childElementCount > 0);
    markActive();
  }
  function setOpen(open: boolean) {
    list.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    box.classList.toggle('open', open);
  }
  function markActive() {
    list.querySelectorAll('.sr-item').forEach((n, i) => {
      n.classList.toggle('active', i === active);
      n.setAttribute('aria-selected', String(i === active));
    });
    if (active >= 0) {
      input.setAttribute('aria-activedescendant', `sr-${active}`);
      document.getElementById(`sr-${active}`)?.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }
  function pick(i: number) {
    const r = results[i];
    if (!r) return;
    input.value = r.label;
    clearBtn.hidden = false;
    setOpen(false);
    input.blur();
    void Promise.resolve(r.run()).catch(() => undefined);
  }

  let abort: AbortController | null = null;
  function onInput() {
    const q = input.value;
    clearBtn.hidden = !q;
    window.clearTimeout(timer);
    abort?.abort();
    const mine = ++seq;
    const wantsRemote = q.trim().length >= 3 && !parseCoords(q);
    remote = { q, places: [], addresses: [], pending: wantsRemote };
    render(q);
    if (!wantsRemote) return;
    timer = window.setTimeout(async () => {
      abort = new AbortController();
      const [places, addresses] = await Promise.allSettled([fetchPlaces(q, abort.signal), fetchAddresses(q, abort.signal)]);
      if (mine !== seq) return;
      remote = {
        q, pending: false,
        places: places.status === 'fulfilled' ? places.value : [],
        addresses: addresses.status === 'fulfilled' ? addresses.value : [],
      };
      render(q);
    }, 250);
  }

  input.addEventListener('input', onInput);
  input.addEventListener('focus', () => {
    // First focus pulls the protected-areas index (~200 kB) so its results are instant.
    opts.pnaIndex().then((all) => { pna = all; if (document.activeElement === input && input.value) render(input.value); }).catch(() => undefined);
    if (input.value) render(input.value);
  });
  input.addEventListener('blur', () => setOpen(false));
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      if (!results.length) return;
      ev.preventDefault();
      active = (active + (ev.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      markActive();
    } else if (ev.key === 'Enter') {
      if (active >= 0) { ev.preventDefault(); pick(active); }
    } else if (ev.key === 'Escape') {
      if (!list.hidden) setOpen(false); else input.blur();
    }
  });
  clearBtn.addEventListener('click', () => {
    input.value = ''; marker.remove(); clearBtn.hidden = true; setOpen(false); input.focus();
  });
  // "/" focuses search, like most map apps.
  document.addEventListener('keydown', (ev) => {
    const tag = (ev.target as HTMLElement)?.tagName;
    if (ev.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !document.querySelector('dialog[open]')) {
      ev.preventDefault(); input.focus();
    }
  });
  onLang(() => { if (!list.hidden) render(input.value); });
}
