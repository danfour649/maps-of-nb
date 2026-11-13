// English / French UI strings. New Brunswick is officially bilingual and the
// provincial data already carries both (NAME / NOM), so the viewer does too.
// Static markup opts in with data-i18n (text), data-i18n-html (trusted markup
// from this table only) and data-i18n-attr="attr:key;attr:key".

export type Lang = 'en' | 'fr';

const STR: Record<string, [en: string, fr: string]> = {
  'doc.title': ['Maps of NB — New Brunswick from GeoNB open data', 'Maps of NB — le Nouveau-Brunswick en données ouvertes GeoNB'],
  'hud.sub': [
    'Fredericton and New Brunswick, straight from <a href="https://geonb.snb.ca" target="_blank" rel="noreferrer">GeoNB</a> open data — the same source feeding the <a href="https://github.com/danfour649/maps-of-nb" target="_blank" rel="noreferrer">maps-of-nb</a> catalogue and the next generation of GTA Fredericton maps.',
    'Fredericton et le Nouveau-Brunswick, directement des données ouvertes de <a href="https://geonb.snb.ca" target="_blank" rel="noreferrer">GeoNB</a> — la même source qui alimente le catalogue <a href="https://github.com/danfour649/maps-of-nb" target="_blank" rel="noreferrer">maps-of-nb</a> et les prochaines cartes de GTA Fredericton.',
  ],
  'hud.toggle': ['Show or hide controls', 'Afficher ou masquer les commandes'],
  'lang.switch': ['Passer au français', 'Switch to English'],
  'basemap': ['Basemap', 'Fond de carte'],
  'basemap.esri': ['Esri imagery', 'Imagerie Esri'],
  'basemap.geonb': ['GeoNB imagery', 'Imagerie GeoNB'],
  'basemap.topo': ['GeoNB topo', 'Topo GeoNB'],
  'sec.city': ['Fredericton layers', 'Couches de Fredericton'],
  'sec.land': ['Land & nature — province-wide', 'Territoire et nature — toute la province'],
  'sec.explore': ['Explore Fredericton', 'Explorer Fredericton'],
  'layer.year': ['Imagery-year overlay', 'Année de l’imagerie'],
  'layer.b3d': ['3D buildings (LiDAR heights)', 'Bâtiments 3D (hauteurs LiDAR)'],
  'layer.contours': ['10 m contours', 'Courbes de niveau (10 m)'],
  'layer.wetlands': ['Wetlands', 'Terres humides'],
  'layer.pna': ['Protected Natural Areas', 'Zones naturelles protégées'],
  'layer.crown': ['Crown land', 'Terres de la Couronne'],
  'layer.ecoregions': ['Ecoregions', 'Écorégions'],
  'layer.ecodistricts': ['Ecodistricts', 'Écodistricts'],
  'pna.c1': ['Class I — access restricted', 'Catégorie I — accès restreint'],
  'pna.c2': ['Class II — low-impact access', 'Catégorie II — activités à faible impact'],
  'pna.c1.short': ['Class I', 'Catégorie I'],
  'pna.c2.short': ['Class II', 'Catégorie II'],
  'pna.c1.rule': ['Access restricted — entry by permit only.', 'Accès restreint — entrée sur permis seulement.'],
  'pna.c2.rule': ['Open to low-impact recreation such as hiking, paddling, hunting and fishing.', 'Ouverte aux loisirs à faible impact : randonnée, canot, chasse et pêche.'],
  'pna.area': ['Area', 'Superficie'],
  'pna.owner': ['Ownership', 'Propriété'],
  'pna.managed': ['Managed by', 'Gestion'],
  'pna.iucn': ['IUCN category', 'Catégorie UICN'],
  'pna.protected': ['Protected', 'Protégée en'],
  'pna.expanded': ['Expanded', 'Agrandie en'],
  'pna.zoom': ['Zoom to area', 'Zoomer sur la zone'],
  'pna.kind': ['Protected Natural Area', 'Zone naturelle protégée'],
  'pna.status': [
    '{n} protected areas · {ha} ha · live from NB Natural Resources, retrieved {date}',
    '{n} zones protégées · {ha} ha · en direct de Ressources naturelles N.-B., extrait le {date}',
  ],
  'land.loading': ['Loading from the province…', 'Chargement depuis la province…'],
  'land.error': ['The provincial service did not answer — toggle the layer to retry.', 'Le service provincial n’a pas répondu — réactivez la couche pour réessayer.'],
  'owner.crown': ['Crown', 'Couronne'],
  'managed.dnr': ['Department of Natural Resources', 'Ministère des Ressources naturelles'],
  'managed.private': ['Private', 'Privé'],
  'eco.region': ['Ecoregion', 'Écorégion'],
  'eco.district': ['Ecodistrict', 'Écodistrict'],
  'crown.yes': ['Crown land', 'Terre de la Couronne'],
  'crown.no': ['Not Crown land (private or other tenure)', 'Hors terres de la Couronne (privé ou autre tenure)'],
  'crown.checking': ['Checking tenure…', 'Vérification de la tenure…'],
  'crown.unknown': ['Tenure lookup failed', 'Tenure indisponible'],
  'crown.holder': ['holder code {n}', 'code de titulaire {n}'],
  'popup.here': ['At this point', 'À cet endroit'],
  'search.placeholder': ['Search places, addresses, protected areas…', 'Chercher un lieu, une adresse, une zone protégée…'],
  'search.label': ['Search the map', 'Chercher sur la carte'],
  'search.clear': ['Clear search', 'Effacer la recherche'],
  'search.group.coords': ['Coordinates', 'Coordonnées'],
  'search.group.pna': ['Protected Natural Areas', 'Zones naturelles protégées'],
  'search.group.place': ['Place names', 'Toponymes'],
  'search.group.address': ['Addresses', 'Adresses'],
  'search.none': ['No matches in New Brunswick.', 'Aucun résultat au Nouveau-Brunswick.'],
  'search.searching': ['Searching…', 'Recherche…'],
  'search.goto': ['Go to {v}', 'Aller à {v}'],
  'tools.measure': ['📏 Measure', '📏 Mesurer'],
  'tools.measure.on': ['📏 Stop measuring', '📏 Arrêter la mesure'],
  'tools.print': ['🖨️ Print / export', '🖨️ Imprimer / exporter'],
  'tools.share': ['🔗 Copy link', '🔗 Copier le lien'],
  'share.copied': ['Link copied — it reopens this exact view and layers.', 'Lien copié — il rouvre cette vue et ces couches.'],
  'share.failed': ['Could not copy — the address bar has the link.', 'Copie impossible — le lien est dans la barre d’adresse.'],
  'measure.hint': ['Click the map to add points.', 'Cliquez sur la carte pour ajouter des points.'],
  'measure.distance': ['Distance', 'Distance'],
  'measure.area': ['Area if closed', 'Superficie (fermée)'],
  'measure.undo': ['Undo', 'Annuler'],
  'measure.clear': ['Clear', 'Effacer'],
  'measure.done': ['Done', 'Terminer'],
  'print.title': ['Print / export map', 'Imprimer / exporter la carte'],
  'print.maptitle': ['Title', 'Titre'],
  'print.maptitle.default': ['Maps of NB', 'Maps of NB'],
  'print.paper': ['Paper', 'Papier'],
  'print.orientation': ['Orientation', 'Orientation'],
  'print.landscape': ['Landscape', 'Paysage'],
  'print.portrait': ['Portrait', 'Portrait'],
  'print.format': ['Format', 'Format'],
  'print.quality': ['Resolution', 'Résolution'],
  'print.q.draft': ['Draft (100 dpi)', 'Brouillon (100 ppp)'],
  'print.q.standard': ['Standard (150 dpi)', 'Standard (150 ppp)'],
  'print.q.fine': ['Fine (200 dpi)', 'Fin (200 ppp)'],
  'print.cancel': ['Cancel', 'Annuler'],
  'print.go': ['Export', 'Exporter'],
  'print.rendering': ['Rendering the map at print resolution…', 'Rendu de la carte en résolution d’impression…'],
  'print.done': ['Saved {file}.', '{file} enregistré.'],
  'print.failed': ['Export failed: {msg}', 'Échec de l’exportation : {msg}'],
  'print.note': [
    'Renders the current view and layers client-side — nothing is uploaded.',
    'La vue et les couches sont rendues dans votre navigateur — rien n’est téléversé.',
  ],
  'print.footer': ['Printed {date} · not for navigation', 'Imprimé le {date} · ne pas utiliser pour la navigation'],
  'tour.start': ['▶ Tour Fredericton', '▶ Visite de Fredericton'],
  'tour.stop': ['■ Stop tour', '■ Arrêter la visite'],
  'gm.enter': ['🎮 Game mesh explorer', '🎮 Explorateur du maillage'],
  'gm.exit': ['🎮 Exit game mesh', '🎮 Quitter le maillage'],
  'gm.terrain': ['3D terrain relief (heavier — off by default)', 'Relief 3D (plus lourd — désactivé par défaut)'],
  'gm.loading': ['Loading the mesh from GeoNB…', 'Chargement du maillage depuis GeoNB…'],
  'gm.zoom': ['Zoom in to load the mesh for where you’re looking.', 'Zoomez pour charger le maillage de la zone affichée.'],
  'gm.totals': [
    ' Citywide inside the official boundary: {b} buildings, {r} road segments.',
    ' Dans les limites officielles de la ville : {b} bâtiments, {r} tronçons de route.',
  ],
  'gm.inview': ['In view: <b>{b} buildings</b>, <b>{r} road segments</b>{src}.', 'À l’écran : <b>{b} bâtiments</b>, <b>{r} tronçons de route</b>{src}.'],
  'gm.baked': [' (baked tiles)', ' (tuiles précalculées)'],
  'gm.pipeline': [
    ' The PySpark pipeline feeds these layers to GTA Fredericton (scripts/extract_game_mesh.py).',
    ' Le pipeline PySpark transmet ces couches à GTA Fredericton (scripts/extract_game_mesh.py).',
  ],
  'gm.retry': ['GeoNB did not answer that one — pan or zoom to retry.', 'GeoNB n’a pas répondu — déplacez la carte pour réessayer.'],
  'cmp.show': ['🗺️ Overlay OpenStreetMap', '🗺️ Superposer OpenStreetMap'],
  'cmp.hide': ['🗺️ Hide OpenStreetMap overlay', '🗺️ Masquer OpenStreetMap'],
  'cmp.zoom': ['Zoom in to compare the two sources where you are looking.', 'Zoomez pour comparer les deux sources dans la zone affichée.'],
  'cmp.fetching': ['Fetching GeoNB and OpenStreetMap for this view…', 'Chargement de GeoNB et d’OpenStreetMap pour cette vue…'],
  'cmp.result': [
    'In view — buildings: <b>GeoNB {gb}</b> vs <b>OSM {ob}</b>; roads: GeoNB {gr} segments vs OSM {or} ways.<br>Building overlap within 15 m: <b>{g2o}%</b> of GeoNB matched in OSM, <b>{o2g}%</b> the other way.',
    'À l’écran — bâtiments : <b>GeoNB {gb}</b> c. <b>OSM {ob}</b>; routes : GeoNB {gr} tronçons c. OSM {or} voies.<br>Bâtiments concordants à moins de 15 m : <b>{g2o} %</b> de GeoNB retrouvés dans OSM, <b>{o2g} %</b> dans l’autre sens.',
  ],
  'cmp.retry': [
    'One of the sources did not answer (Overpass is often at capacity) — pan or zoom to retry.',
    'Une des sources n’a pas répondu (Overpass est souvent saturé) — déplacez la carte pour réessayer.',
  ],
  'b3d.zoom': ['Zoom in closer — buildings load at street level.', 'Zoomez davantage — les bâtiments se chargent au niveau de la rue.'],
  'goto': ['Go to', 'Aller à'],
  'view.downtown': ['Downtown', 'Centre-ville'],
  'view.unb': ['UNB / STU', 'UNB / STU'],
  'view.northside': ['Northside', 'Côté nord'],
  'view.city': ['Whole city', 'Toute la ville'],
  'view.province': ['New Brunswick', 'Nouveau-Brunswick'],
  'footer.fine': [
    'Imagery: GeoNB orthophotos (latest contribution 13,000 km² at 0.15 m, flown 2025). Esri layer via Esri World Imagery. Protected areas, Crown land and ecological regions: NB Department of Natural Resources. Not affiliated with the Government of New Brunswick.',
    'Imagerie : orthophotos GeoNB (dernier apport de 13 000 km² à 0,15 m, vol de 2025). Couche Esri : Esri World Imagery. Zones protégées, terres de la Couronne et régions écologiques : ministère des Ressources naturelles du N.-B. Site non affilié au gouvernement du Nouveau-Brunswick.',
  ],
  'coords.label': ['Cursor position', 'Position du curseur'],
};

// The landmark tour, stop by stop (index matches STOPS in main.ts).
export const TOUR_TEXT: Record<Lang, { name: string; body: string }[]> = {
  en: [
    { name: 'The Legislative Assembly', body: 'New Brunswick’s seat of government since 1882, on Queen Street. The dome you’re looking at was rebuilt after the original burned — the chamber inside still sits under it.' },
    { name: 'Christ Church Cathedral', body: 'Consecrated in 1853 and the first cathedral founded on British soil since the Norman Conquest. Its spire is the downtown skyline’s exclamation point — and a fixed point in every Fredericton photo since.' },
    { name: 'Beaverbrook Art Gallery', body: 'Gifted to the province by Lord Beaverbrook in 1959 — and home to Salvador Dalí’s enormous Santiago El Grande, which somehow ended up in Fredericton and never left.' },
    { name: 'Officers’ Square', body: 'The old military parade ground, now downtown’s living room — concerts, markets, and skating in winter. The Guard House and barracks along Queen Street are the 1820s originals.' },
    { name: 'Westmorland Street Bridge', body: 'The daily link between downtown and the north side, opened in 1982. Under it runs the river trail network — and in the game, this is where a lot of questionable driving happens.' },
    { name: 'Bill Thorpe Walking Bridge', body: 'The old railway bridge, now the spine of the trail system and the best sunset walk in the city. Trains crossed here until the 1990s; now it’s strollers, bikes, and dogs.' },
    { name: 'University of New Brunswick', body: 'Founded 1785 — one of the oldest public universities in North America, up the hill where it can keep an eye on the legislature. This is the last stop; the map is yours again.' },
  ],
  fr: [
    { name: 'L’Assemblée législative', body: 'Siège du gouvernement du Nouveau-Brunswick depuis 1882, rue Queen. Le dôme que vous voyez a été rebâti après l’incendie de l’édifice d’origine — la chambre siège toujours dessous.' },
    { name: 'Cathédrale Christ Church', body: 'Consacrée en 1853, première cathédrale fondée en sol britannique depuis la conquête normande. Sa flèche est le point d’exclamation du centre-ville — et un repère sur toutes les photos de Fredericton depuis.' },
    { name: 'Galerie d’art Beaverbrook', body: 'Offerte à la province par lord Beaverbrook en 1959 — et foyer de l’immense Santiago El Grande de Salvador Dalí, arrivé à Fredericton on ne sait trop comment et jamais reparti.' },
    { name: 'Place des Officiers', body: 'L’ancien terrain de parade militaire, devenu le salon du centre-ville — concerts, marchés et patinage l’hiver. Le corps de garde et les casernes de la rue Queen datent des années 1820.' },
    { name: 'Pont de la rue Westmorland', body: 'Le lien quotidien entre le centre-ville et le côté nord, ouvert en 1982. Le réseau de sentiers riverains passe dessous — et dans le jeu, c’est ici que la conduite devient discutable.' },
    { name: 'Passerelle Bill-Thorpe', body: 'L’ancien pont ferroviaire, aujourd’hui l’épine dorsale du réseau de sentiers et la plus belle promenade au coucher du soleil. Les trains y ont circulé jusqu’aux années 1990; place aux poussettes, aux vélos et aux chiens.' },
    { name: 'Université du Nouveau-Brunswick', body: 'Fondée en 1785 — l’une des plus anciennes universités publiques d’Amérique du Nord, perchée sur la colline d’où elle surveille l’Assemblée. C’est le dernier arrêt; la carte est de nouveau à vous.' },
  ],
};

let lang: Lang = 'en';
const listeners: (() => void)[] = [];

/** Initial language: ?lang= beats the saved choice beats the browser's. */
export function detectLang(search: string, saved: string | null, browser: string | undefined): Lang {
  const q = new URLSearchParams(search).get('lang');
  if (q === 'fr' || q === 'en') return q;
  if (saved === 'fr' || saved === 'en') return saved;
  return browser?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export const getLang = (): Lang => lang;

export function t(key: string, vars?: Record<string, string | number>): string {
  const row = STR[key];
  let s = row ? row[lang === 'fr' ? 1 : 0] : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Locale for number/date formatting — Canadian conventions either way. */
export const locale = (): string => (lang === 'fr' ? 'fr-CA' : 'en-CA');

/** Run fn now-ish on every language change (not on registration). */
export function onLang(fn: () => void): void { listeners.push(fn); }

export function applyI18n(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n!); });
  root.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml!); });
  root.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr!.split(';')) {
      const [attr, key] = pair.split(':');
      if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
    }
  });
}

export function setLang(next: Lang, opts: { persist?: boolean } = {}): void {
  lang = next;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next;
    document.title = t('doc.title');
    applyI18n();
  }
  if (opts.persist) { try { localStorage.setItem('lang', next); } catch { /* private mode */ } }
  listeners.forEach((fn) => fn());
}

/** All keys, for the completeness test. */
export const i18nKeys = (): string[] => Object.keys(STR);
export const i18nRow = (key: string): [string, string] | undefined => STR[key];
