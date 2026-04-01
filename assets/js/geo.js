// ═══════════════════════════════════════════════════════════════
// MÜŞTERİ GEO — Interactive customer map
// Tabs: Kişiler (contacts+companies) | Angebote | Rechnungen
// Map: Leaflet.js + OpenStreetMap (free, no API key)
// ═══════════════════════════════════════════════════════════════
'use strict';

let _geoMap             = null;   // Leaflet map instance
let _geoMarkers         = [];     // country circle markers
let _geoCityMarkers     = [];     // city dot markers (separate so we can re-render)
let _geoActiveTab       = 'kisiler';
let _geoAllData         = {};     // { kisiler, angebote, rechnungen }
let _geoSelectedCountry = null;

// ── Nominatim geocoding (free, no API key, OpenStreetMap) ─────
const _GEO_NOM_KEY = 'wf_geo_nom_v2';
let _geoNomCache = null;

function _geoNomGetCache() {
  if (!_geoNomCache) {
    try { _geoNomCache = JSON.parse(localStorage.getItem(_GEO_NOM_KEY) || '{}'); }
    catch { _geoNomCache = {}; }
  }
  return _geoNomCache;
}
function _geoNomSetCache(k, v) {
  _geoNomGetCache()[k] = v;
  try { localStorage.setItem(_GEO_NOM_KEY, JSON.stringify(_geoNomCache)); } catch {}
}
async function _geoNomLookup(city, country) {
  const k = `${city}|${country || ''}`.toLowerCase();
  const cache = _geoNomGetCache();
  if (k in cache) return cache[k]; // null = not found, [lat,lon] = found
  try {
    const q = country ? `${city}, ${country}` : city;
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'WindoformCRM/1.0' } }
    );
    const d = await r.json();
    const coords = (d && d[0]) ? [parseFloat(d[0].lat), parseFloat(d[0].lon)] : null;
    _geoNomSetCache(k, coords);
    return coords;
  } catch {
    _geoNomSetCache(k, null);
    return null;
  }
}

// Background: geocode unknown cities, then update dots
async function _geoGeocodeUnknown(data) {
  const cache = _geoNomGetCache();
  const toFetch = [];
  Object.values(data).forEach(d => {
    Object.values(d.cities).forEach(c => {
      if (!c.city || c.city === '—') return;
      if (_geoCityCoords(c.city)) return; // already in built-in list
      const k = `${c.city}|${d.country || ''}`.toLowerCase();
      if (k in cache) return; // already geocoded
      toFetch.push({ city: c.city, country: d.country });
    });
  });
  if (!toFetch.length) return;

  for (const item of toFetch) {
    await _geoNomLookup(item.city, item.country);
    if (toFetch.length > 1) await new Promise(r => setTimeout(r, 1100)); // 1 req/sec limit
  }
  // Re-render city dots with newly found coordinates
  _geoRenderCityDots(data);
}

// ── Country center coordinates ───────────────────────────────
const GEO_COUNTRIES = {
  'Türkiye':['TR',38.96,35.24],'Turkey':['TR',38.96,35.24],'Turkei':['TR',38.96,35.24],
  'Deutschland':['DE',51.17,10.45],'Germany':['DE',51.17,10.45],
  'Spanien':['ES',40.42,-3.70],'Spain':['ES',40.42,-3.70],'España':['ES',40.42,-3.70],
  'Frankreich':['FR',46.23,2.21],'France':['FR',46.23,2.21],
  'Italien':['IT',41.87,12.57],'Italy':['IT',41.87,12.57],'Italia':['IT',41.87,12.57],
  'Österreich':['AT',47.52,14.55],'Austria':['AT',47.52,14.55],
  'Schweiz':['CH',46.82,8.23],'Switzerland':['CH',46.82,8.23],
  'Niederlande':['NL',52.13,5.29],'Netherlands':['NL',52.13,5.29],'Holland':['NL',52.13,5.29],
  'Belgien':['BE',50.50,4.47],'Belgium':['BE',50.50,4.47],
  'Polen':['PL',51.92,19.15],'Poland':['PL',51.92,19.15],
  'Tschechien':['CZ',49.82,15.47],'Czech Republic':['CZ',49.82,15.47],
  'Griechenland':['GR',39.07,21.82],'Greece':['GR',39.07,21.82],'Yunanistan':['GR',39.07,21.82],
  'Portugal':['PT',39.40,-8.22],
  'Schweden':['SE',60.13,18.64],'Sweden':['SE',60.13,18.64],
  'Norwegen':['NO',60.47,8.47],'Norway':['NO',60.47,8.47],
  'Dänemark':['DK',56.26,9.50],'Denmark':['DK',56.26,9.50],
  'Finnland':['FI',61.92,25.75],'Finland':['FI',61.92,25.75],
  'Vereinigtes Königreich':['GB',55.38,-3.44],'United Kingdom':['GB',55.38,-3.44],'UK':['GB',55.38,-3.44],
  'Irland':['IE',53.41,-8.24],'Ireland':['IE',53.41,-8.24],
  'Russland':['RU',61.52,105.32],'Russia':['RU',61.52,105.32],
  'Ukraine':['UA',48.38,31.17],
  'Rumänien':['RO',45.94,24.97],'Romania':['RO',45.94,24.97],
  'Bulgarien':['BG',42.73,25.49],'Bulgaria':['BG',42.73,25.49],
  'Serbien':['RS',44.02,21.01],'Serbia':['RS',44.02,21.01],
  'Kroatien':['HR',45.10,15.20],'Croatia':['HR',45.10,15.20],
  'Ungarn':['HU',47.16,19.50],'Hungary':['HU',47.16,19.50],
  'Slowakei':['SK',48.67,19.70],'Slovakia':['SK',48.67,19.70],
  'USA':['US',37.09,-95.71],'United States':['US',37.09,-95.71],'Amerika':['US',37.09,-95.71],
  'Kanada':['CA',56.13,-106.35],'Canada':['CA',56.13,-106.35],
  'Mexiko':['MX',23.63,-102.55],'Mexico':['MX',23.63,-102.55],
  'Brasilien':['BR',-14.24,-51.93],'Brazil':['BR',-14.24,-51.93],
  'Argentinien':['AR',-38.42,-63.62],'Argentina':['AR',-38.42,-63.62],
  'China':['CN',35.86,104.20],
  'Japan':['JP',36.20,138.25],
  'Südkorea':['KR',35.91,127.77],'South Korea':['KR',35.91,127.77],
  'Indien':['IN',20.59,78.96],'India':['IN',20.59,78.96],
  'Vereinigte Arabische Emirate':['AE',23.42,53.85],'UAE':['AE',23.42,53.85],'Dubai':['AE',25.20,55.27],
  'Saudi-Arabien':['SA',23.89,45.08],'Saudi Arabia':['SA',23.89,45.08],
  'Israel':['IL',31.05,34.85],
  'Ägypten':['EG',26.82,30.80],'Egypt':['EG',26.82,30.80],
  'Marokko':['MA',31.79,-7.09],'Morocco':['MA',31.79,-7.09],
  'Australien':['AU',-25.27,133.78],'Australia':['AU',-25.27,133.78],
};

// ── City coordinates (major cities) ──────────────────────────
const GEO_CITIES = {
  // Turkey
  'istanbul':[41.01,28.95],'ankara':[39.93,32.86],'izmir':[38.42,27.14],
  'bursa':[40.18,29.06],'antalya':[36.89,30.70],'adana':[37.00,35.32],
  'konya':[37.87,32.49],'gaziantep':[37.06,37.38],'mersin':[36.80,34.63],
  'kayseri':[38.73,35.49],'eskişehir':[39.78,30.52],'eskisehir':[39.78,30.52],
  'diyarbakır':[37.91,40.23],'diyarbakir':[37.91,40.23],
  'trabzon':[41.00,39.72],'samsun':[41.29,36.33],'malatya':[38.35,38.31],
  'erzurum':[39.91,41.27],'denizli':[37.77,29.09],'kocaeli':[40.77,29.94],
  'izmit':[40.77,29.94],'adapazarı':[40.78,30.40],'sakarya':[40.78,30.40],
  'tekirdağ':[40.98,27.52],'tekirdagi':[40.98,27.52],
  'gebze':[40.80,29.43],'manisa':[38.61,27.43],'sivas':[39.75,37.02],
  'van':[38.49,43.38],'şanlıurfa':[37.16,38.80],'sanliurfa':[37.16,38.80],
  'kahramanmaraş':[37.59,36.94],'kahramanmaras':[37.59,36.94],
  'hatay':[36.40,36.35],'antakya':[36.20,36.16],'bodrum':[37.03,27.43],
  // Germany
  'berlin':[52.52,13.40],'hamburg':[53.55,10.00],'münchen':[48.14,11.58],
  'munich':[48.14,11.58],'münchen':[48.14,11.58],
  'frankfurt':[50.11,8.68],'frankfurt am main':[50.11,8.68],'frankfurt a. main':[50.11,8.68],'frankfurt a.m.':[50.11,8.68],
  'köln':[50.94,6.96],'cologne':[50.94,6.96],'düsseldorf':[51.23,6.79],
  'stuttgart':[48.78,9.18],'dortmund':[51.51,7.46],'essen':[51.46,7.01],
  'leipzig':[51.34,12.37],'bremen':[53.08,8.80],'dresden':[51.05,13.74],
  'hannover':[52.37,9.73],'nürnberg':[49.45,11.08],'nuremberg':[49.45,11.08],
  'duisburg':[51.43,6.76],'bochum':[51.48,7.22],'wuppertal':[51.26,7.15],
  'bielefeld':[52.03,8.53],'bonn':[50.73,7.10],'münster':[51.96,7.63],
  'karlsruhe':[49.01,8.40],'mannheim':[49.49,8.47],'augsburg':[48.37,10.90],
  'wiesbaden':[50.08,8.24],'gelsenkirchen':[51.52,7.09],'mönchengladbach':[51.20,6.44],
  'braunschweig':[52.27,10.52],'kiel':[54.32,10.13],'chemnitz':[50.83,12.92],
  'aachen':[50.78,6.08],'halle':[51.48,11.97],'magdeburg':[52.13,11.62],
  'freiburg':[47.99,7.84],'krefeld':[51.34,6.59],'lübeck':[53.87,10.69],
  'oberhausen':[51.47,6.85],'erfurt':[50.98,11.03],'rostock':[54.09,12.10],
  'mainz':[49.99,8.27],'kassel':[51.32,9.50],'hagen':[51.36,7.47],
  'saarbrücken':[49.23,6.99],'hamm':[51.68,7.82],'mülheim':[51.43,6.88],
  'potsdam':[52.40,13.06],'heidelberg':[49.40,8.69],'ulm':[48.40,9.99],
  // Spain
  'madrid':[40.42,-3.70],'barcelona':[41.39,2.15],'valencia':[39.47,-0.38],
  'sevilla':[37.39,-5.99],'seville':[37.39,-5.99],'zaragoza':[41.65,-0.89],
  'málaga':[36.72,-4.42],'malaga':[36.72,-4.42],'murcia':[37.99,-1.13],
  'palma':[39.57,2.65],'bilbao':[43.26,-2.93],'alicante':[38.35,-0.49],
  'córdoba':[37.89,-4.78],'cordoba':[37.89,-4.78],'valladolid':[41.65,-4.72],
  'vigo':[42.23,-8.71],'gijón':[43.54,-5.66],'gijon':[43.54,-5.66],
  // France
  'paris':[48.85,2.35],'lyon':[45.75,4.83],'marseille':[43.30,5.37],
  'toulouse':[43.60,1.44],'nice':[43.70,7.25],'nantes':[47.22,-1.55],
  'strasbourg':[48.58,7.75],'bordeaux':[44.84,-0.58],'lille':[50.63,3.06],
  'rennes':[48.11,-1.68],'grenoble':[45.19,5.73],'montpellier':[43.61,3.88],
  // Italy
  'rom':[41.90,12.50],'rome':[41.90,12.50],'roma':[41.90,12.50],
  'mailand':[45.46,9.19],'milan':[45.46,9.19],'milano':[45.46,9.19],
  'neapel':[40.85,14.27],'naples':[40.85,14.27],'napoli':[40.85,14.27],
  'turin':[45.07,7.69],'torino':[45.07,7.69],'florenz':[43.77,11.25],
  'florence':[43.77,11.25],'firenze':[43.77,11.25],'venedig':[45.44,12.33],
  'venice':[45.44,12.33],'venezia':[45.44,12.33],'bologna':[44.49,11.35],
  // UK
  'london':[51.51,-0.13],'manchester':[53.48,-2.24],'birmingham':[52.49,-1.90],
  'leeds':[53.80,-1.55],'glasgow':[55.86,-4.25],'liverpool':[53.41,-2.99],
  'edinburgh':[55.95,-3.19],'bristol':[51.45,-2.59],'sheffield':[53.38,-1.47],
  // Netherlands
  'amsterdam':[52.37,4.90],'rotterdam':[51.92,4.48],'den haag':[52.08,4.31],
  'utrecht':[52.09,5.12],'eindhoven':[51.44,5.48],'tilburg':[51.56,5.08],
  // Austria
  'wien':[48.21,16.37],'vienna':[48.21,16.37],'graz':[47.07,15.44],
  'linz':[48.31,14.29],'salzburg':[47.80,13.04],'innsbruck':[47.27,11.39],
  // Switzerland
  'zürich':[47.38,8.54],'zurich':[47.38,8.54],'genf':[46.20,6.14],
  'geneva':[46.20,6.14],'basel':[47.56,7.59],'bern':[46.95,7.45],
  // USA
  'new york':[40.71,-74.01],'los angeles':[34.05,-118.24],'chicago':[41.88,-87.63],
  'houston':[29.76,-95.37],'phoenix':[33.45,-112.07],'philadelphia':[39.95,-75.17],
  'san antonio':[29.42,-98.49],'san diego':[32.72,-117.16],'dallas':[32.78,-96.80],
  'san francisco':[37.77,-122.42],'miami':[25.77,-80.19],'seattle':[47.61,-122.33],
};

// ── Normalize country/city names ─────────────────────────────
function _geoNormalizeCountry(raw) {
  if (!raw) return null;
  const s = raw.trim();
  if (GEO_COUNTRIES[s]) return _geoCanonical(s) || s;
  const lower = s.toLowerCase();
  for (const k of Object.keys(GEO_COUNTRIES)) {
    if (k.toLowerCase() === lower) return _geoCanonical(k) || k;
  }
  return s;
}

function _geoCityCoords(city) {
  if (!city) return null;
  const k = city.toLowerCase().trim();
  // Exact match
  if (GEO_CITIES[k]) return GEO_CITIES[k];
  // Partial match: "Frankfurt am Main" → "frankfurt", "München (Schwabing)" → "münchen"
  // Try the first word(s) progressively
  const words = k.split(/[\s\-\/]+/);
  for (let i = words.length - 1; i >= 1; i--) {
    const partial = words.slice(0, i).join(' ');
    if (GEO_CITIES[partial]) return GEO_CITIES[partial];
  }
  // Try if any GEO_CITIES key is contained at the start of city name
  for (const [key, coords] of Object.entries(GEO_CITIES)) {
    if (k.startsWith(key) || key.startsWith(k)) return coords;
  }
  return null;
}

// ── Parse city + country from a raw address string ────────────
// Handles formats like:
//   "Musterstraße 12, 10115 Berlin, Deutschland"
//   "Atatürk Cad. 123, 34000 İstanbul, Türkiye"
//   "High Street 1, London, United Kingdom"
function _geoParseAddress(address) {
  if (!address) return { city: null, country: null };

  const parts = address.split(/[,\n\r]+/).map(p => p.trim()).filter(Boolean);
  let country = null;
  let city    = null;

  // 1. Search for country name in any part (check last parts first)
  for (let i = parts.length - 1; i >= 0; i--) {
    const norm = _geoNormalizeCountry(parts[i]);
    if (GEO_COUNTRIES[norm]) {
      country = norm;
      break;
    }
    // Also try common abbreviations
    const lower = parts[i].toLowerCase();
    if (lower === 'de' || lower === 'germany' || lower === 'deutschland') { country = 'Deutschland'; break; }
    if (lower === 'tr' || lower === 'turkey' || lower === 'turkei' || lower === 'türkei') { country = 'Türkiye'; break; }
    if (lower === 'es' || lower === 'spain' || lower === 'spanien' || lower === 'españa') { country = 'Spanien'; break; }
    if (lower === 'at' || lower === 'austria' || lower === 'österreich') { country = 'Österreich'; break; }
    if (lower === 'ch' || lower === 'switzerland' || lower === 'schweiz') { country = 'Schweiz'; break; }
    if (lower === 'nl' || lower === 'netherlands' || lower === 'niederlande') { country = 'Niederlande'; break; }
    if (lower === 'fr' || lower === 'france' || lower === 'frankreich') { country = 'Frankreich'; break; }
    if (lower === 'it' || lower === 'italy' || lower === 'italien') { country = 'Italien'; break; }
    if (lower === 'gb' || lower === 'uk' || lower === 'united kingdom' || lower === 'england') { country = 'Vereinigtes Königreich'; break; }
    if (lower === 'pl' || lower === 'poland' || lower === 'polen') { country = 'Polen'; break; }
    if (lower === 'hu' || lower === 'hungary' || lower === 'ungarn') { country = 'Ungarn'; break; }
    if (lower === 'gr' || lower === 'greece' || lower === 'griechenland') { country = 'Griechenland'; break; }
    if (lower === 'ro' || lower === 'romania' || lower === 'rumänien') { country = 'Rumänien'; break; }
    if (lower === 'bg' || lower === 'bulgaria' || lower === 'bulgarien') { country = 'Bulgarien'; break; }
    if (lower === 'cz' || lower === 'czech republic' || lower === 'tschechien') { country = 'Tschechien'; break; }
    if (lower === 'sk' || lower === 'slovakia' || lower === 'slowakei') { country = 'Slowakei'; break; }
    if (lower === 'hr' || lower === 'croatia' || lower === 'kroatien') { country = 'Kroatien'; break; }
    if (lower === 'rs' || lower === 'serbia' || lower === 'serbien') { country = 'Serbien'; break; }
    if (lower === 'us' || lower === 'usa' || lower === 'united states' || lower === 'america') { country = 'USA'; break; }
    if (lower === 'ae' || lower === 'uae' || lower === 'dubai' || lower === 'abu dhabi') { country = 'Vereinigte Arabische Emirate'; break; }
    if (lower === 'sa' || lower === 'saudi arabia' || lower === 'saudi-arabien') { country = 'Saudi-Arabien'; break; }
    if (lower === 'cn' || lower === 'china') { country = 'China'; break; }
    if (lower === 'jp' || lower === 'japan') { country = 'Japan'; break; }
    if (lower === 'in' || lower === 'india' || lower === 'indien') { country = 'Indien'; break; }
    if (lower === 'au' || lower === 'australia' || lower === 'australien') { country = 'Australien'; break; }
  }

  // 2. Look for PLZ + City pattern: "12345 CityName" or "D-12345 CityName"
  const fullAddr = address.replace(/\n/g, ', ');
  const plzMatch = fullAddr.match(/(?:^|[,\s])(?:[A-Z]-)?(\d{4,5})\s+([A-ZÄÖÜa-zäöüß][A-ZÄÖÜa-zäöüß\s/-]{1,30})(?=[,\n]|$)/);
  if (plzMatch) {
    const plz = parseInt(plzMatch[1]);
    const cityCandidate = plzMatch[2].trim().split(/\s*\/\s*/)[0].trim(); // take first part before "/"
    if (!city && cityCandidate.length > 1) {
      city = cityCandidate;
    }
    // Infer country from PLZ range if not found
    if (!country) {
      if (plzMatch[1].length === 5 && plz >= 1000 && plz <= 99999) {
        country = 'Deutschland'; // 5-digit PLZ → assume Germany
      } else if (plzMatch[1].length === 4) {
        // 4-digit: Austria (1000-9999), Switzerland (1000-9999), Netherlands (1000-9999)
        // Hard to tell; leave country as null
      }
    }
  }

  // 3. Try to find city from known city names in parts
  if (!city) {
    for (const part of parts) {
      const lower = part.toLowerCase().trim();
      if (GEO_CITIES[lower]) {
        city = part.trim();
        break;
      }
      // Also try without special chars
      const normalized = lower.replace(/[äöüß]/g, c => ({ ä:'a',ö:'o',ü:'u',ß:'ss' })[c]||c);
      if (GEO_CITIES[normalized]) {
        city = part.trim();
        break;
      }
    }
  }

  // 4. Fallback: if address has 3+ parts and no city yet, second-to-last part (before country) is often city
  if (!city && parts.length >= 2) {
    const candidate = parts[parts.length - (country ? 2 : 1)];
    // Don't use street+number as city (contains digits usually)
    if (candidate && !/\d/.test(candidate) && candidate.length > 1 && candidate.length < 40) {
      city = candidate;
    }
  }

  return { city: city || null, country: country || null };
}

// ── Entry point ───────────────────────────────────────────────
async function loadMusteriGeo() {
  const mapEl = document.getElementById('geo-map');
  if (!mapEl) return;

  // Always reload fresh data (ensures fixes like city=country filter apply)
  _geoAllData = {};

  // Init map once — defer slightly so the page is fully visible (fixes height=0 issue)
  if (!_geoMap) {
    await new Promise(r => setTimeout(r, 50));
    _geoInitMap();
    if (_geoMap) _geoMap.invalidateSize(); // recalculate container size
  }

  // Load data for active tab
  try {
    await _geoSwitchTab(_geoActiveTab, false);
  } catch (e) {
    console.error('Müşteri Geo yükleme hatası:', e);
    const statsEl = document.getElementById('geo-stats');
    if (statsEl) statsEl.innerHTML = `<span class="text-danger small"><i class="bi bi-exclamation-triangle me-1"></i>Yüklenirken hata oluştu: ${e.message}</span>`;
  }
}

// ── Map initialization ────────────────────────────────────────
function _geoInitMap() {
  const mapEl = document.getElementById('geo-map');
  if (!mapEl || typeof L === 'undefined') return;

  _geoMap = L.map('geo-map', {
    center: [30, 15],
    zoom: 2,
    minZoom: 2,
    maxZoom: 10,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(_geoMap);

  // Legend overlay
  const legend = L.control({ position: 'bottomleft' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'geo-map-legend');
    div.innerHTML = `
      <span><span class="geo-legend-dot" style="background:#3d73c7;"></span> Ülke</span>
      <span><span class="geo-legend-dot" style="background:#f97316;"></span> Şehir (kesin)</span>
      <span><span class="geo-legend-dot" style="background:#a78bfa;border:1.5px dashed #7c3aed;"></span> Şehir (yaklaşık)</span>`;
    return div;
  };
  legend.addTo(_geoMap);
}

// ── Tab switching ─────────────────────────────────────────────
async function _geoSwitchTab(tab, reloadMap = true) {
  _geoActiveTab = tab;
  _geoSelectedCountry = null;

  // Update tab buttons
  ['kisiler','angebote','rechnungen'].forEach(t => {
    document.getElementById('geo-tab-' + t)?.classList.toggle('active', t === tab);
  });

  // Hide detail panel
  _geoHideDetail();

  // Show loading
  const statusEl = document.getElementById('geo-status');
  if (statusEl) statusEl.textContent = 'Yükleniyor…';

  // Load data if not cached
  try {
    if (!_geoAllData[tab]) {
      _geoAllData[tab] = await _geoFetchData(tab);
    }
  } catch (e) {
    console.error('_geoFetchData error:', tab, e);
    _geoAllData[tab] = {};
  }

  const data = _geoAllData[tab] || {};
  try { _geoRenderStats(data); } catch(e) { console.error('_geoRenderStats:', e); }
  try { _geoRenderMap(data); }   catch(e) { console.error('_geoRenderMap:', e); }
  try { _geoRenderTable(data); } catch(e) { console.error('_geoRenderTable:', e); }

  if (statusEl) statusEl.textContent = '';

  // Background: geocode unknown cities via Nominatim, then update dots
  _geoGeocodeUnknown(data).catch(() => {});
}

// ── Fetch data per tab ────────────────────────────────────────
async function _geoFetchData(tab) {
  if (tab === 'kisiler') return await _geoFetchKisiler();
  if (tab === 'angebote') return await _geoFetchAngebote();
  if (tab === 'rechnungen') return await _geoFetchRechnungen();
  return {};
}

// ── Resolve city + country for a record, with address fallback ─
function _geoResolveLocation(c) {
  let country = _geoNormalizeCountry(c.country) || null;
  let city    = (c.city || '').trim() || null;

  // Fix: if city field contains a country name, move it to country and clear city
  if (city) {
    const cityAsCountry = _geoNormalizeCountry(city);
    if (GEO_COUNTRIES[cityAsCountry]) {
      if (!country || country === 'Türkiye') country = cityAsCountry;
      city = null;
    }
  }

  // If country is the default placeholder or missing, try to parse from address
  const isMissingLocation = !city || !country || country === 'Türkiye';
  if (isMissingLocation && c.address) {
    const parsed = _geoParseAddress(c.address);
    if (!city && parsed.city)       city    = parsed.city;
    if (!country && parsed.country) country = parsed.country;
    // If we found a country via address, use it even if it overrides 'Türkiye' default
    if (c.address && parsed.country && country === 'Türkiye') country = parsed.country;
  }

  // Combine address fields (address + district + city + postcode) if address is structured
  if (!c.address && (c.district || c.postcode)) {
    const rawAddr = [c.address, c.district, c.city, c.postcode].filter(Boolean).join(', ');
    if (!city || !country) {
      const parsed = _geoParseAddress(rawAddr);
      if (!city && parsed.city)       city    = parsed.city;
      if (!country && parsed.country) country = parsed.country;
    }
  }

  return {
    country: country || 'Türkiye',
    city:    city    || null,
  };
}

async function _geoFetchKisiler() {
  const [contacts, companies] = await Promise.all([
    typeof dbAll === 'function' ? dbAll('contacts')  : [],
    typeof dbAll === 'function' ? dbAll('companies') : [],
  ]);

  const items = [];
  contacts.forEach(c => {
    if (!c.name && !c.company) return;
    const loc = _geoResolveLocation(c);
    items.push({ name: c.name || c.company || '—', city: loc.city, country: loc.country, type: 'contact', id: c.id });
  });
  companies.forEach(c => {
    if (!c.name) return;
    const loc = _geoResolveLocation(c);
    items.push({ name: c.name || '—', city: loc.city, country: loc.country, type: 'company', id: c.id });
  });

  return _geoGroupByCountry(items);
}

async function _geoFetchAngebote() {
  const cfg = typeof loadFbConfig === 'function' ? loadFbConfig() : null;
  if (!cfg?.apiKey) return {};

  // Load all contacts/companies for city/country join
  const [contacts, companies] = await Promise.all([
    typeof dbAll === 'function' ? dbAll('contacts')  : [],
    typeof dbAll === 'function' ? dbAll('companies') : [],
  ]);

  // Build lookup: name (lowercase) → {city, country}
  const lookup = {};
  [...contacts, ...companies].forEach(c => {
    const loc = _geoResolveLocation(c);
    const key = (c.name || '').toLowerCase().trim();
    if (key) lookup[key] = { city: loc.city, country: loc.country };
    const compKey = (c.company || '').toLowerCase().trim();
    if (compKey && !lookup[compKey]) lookup[compKey] = { city: loc.city, country: loc.country };
  });

  // Fetch quotes
  const token = typeof authToken === 'function' ? await authToken() : null;
  const res   = await fetch(
    `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents:runQuery?key=${cfg.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ structuredQuery: {
        from:    [{ collectionId: 'crm_quotes' }],
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit:   1000,
      }}),
    }
  ).catch(() => null);

  if (!res?.ok) return {};
  const rows = await res.json();

  const items = (Array.isArray(rows) ? rows : []).filter(r => r.document).map(r => {
    const f       = r.document.fields || {};
    const name    = f.contactName?.stringValue || f.contactCompany?.stringValue || '—';
    const company = f.contactCompany?.stringValue || '';
    const amount  = parseFloat(f.totalNet?.doubleValue || f.totalNet?.integerValue || 0);

    // Join with contacts for city/country
    const lookupKey = (company || name).toLowerCase().trim();
    const fallbackKey = name.toLowerCase().trim();
    const geo = lookup[lookupKey] || lookup[fallbackKey] || {};

    return {
      name,
      city:    geo.city    || null,
      country: geo.country || 'Bilinmiyor',
      amount,
      type: 'quote',
    };
  });

  return _geoGroupByCountry(items);
}

async function _geoFetchRechnungen() {
  const cfg = typeof loadFbConfig === 'function' ? loadFbConfig() : null;
  if (!cfg?.apiKey) return {};

  const [contacts, companies] = await Promise.all([
    typeof dbAll === 'function' ? dbAll('contacts')  : [],
    typeof dbAll === 'function' ? dbAll('companies') : [],
  ]);
  const lookup = {};
  [...contacts, ...companies].forEach(c => {
    const loc = _geoResolveLocation(c);
    const key = (c.name || '').toLowerCase().trim();
    if (key) lookup[key] = { city: loc.city, country: loc.country };
    const compKey = (c.company || '').toLowerCase().trim();
    if (compKey && !lookup[compKey]) lookup[compKey] = { city: loc.city, country: loc.country };
  });

  const token = typeof authToken === 'function' ? await authToken() : null;
  const res   = await fetch(
    `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents:runQuery?key=${cfg.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ structuredQuery: {
        from:    [{ collectionId: 'crm_fatura' }],
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit:   1000,
      }}),
    }
  ).catch(() => null);

  // Also try crm_invoices collection
  const res2 = await fetch(
    `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents:runQuery?key=${cfg.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ structuredQuery: {
        from:    [{ collectionId: 'crm_invoices' }],
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit:   1000,
      }}),
    }
  ).catch(() => null);

  const parseRows = async (r) => {
    if (!r?.ok) return [];
    const rows = await r.json();
    return (Array.isArray(rows) ? rows : []).filter(r => r.document).map(r => {
      const f      = r.document.fields || {};
      const name   = f.customerName?.stringValue || f.contactName?.stringValue || f.customer?.stringValue || '—';
      const company= f.customerCompany?.stringValue || f.contactCompany?.stringValue || '';
      const amount = parseFloat(f.totalNet?.doubleValue || f.totalNet?.integerValue || f.totalGross?.doubleValue || 0);
      const lookupKey = (company || name).toLowerCase().trim();
      const fallbackKey = name.toLowerCase().trim();
      const geo = lookup[lookupKey] || lookup[fallbackKey] || {};
      return { name, city: geo.city || null, country: geo.country || 'Bilinmiyor', amount, type: 'invoice' };
    });
  };

  const [r1, r2] = await Promise.all([parseRows(res), parseRows(res2)]);
  return _geoGroupByCountry([...r1, ...r2]);
}

// ── Canonical country name (merges "Germany" + "Deutschland" → "Deutschland") ──
const GEO_CANONICAL = {};   // countryCode → first/preferred name
Object.entries(GEO_COUNTRIES).forEach(([name, info]) => {
  if (!GEO_CANONICAL[info[0]]) GEO_CANONICAL[info[0]] = name;
});
function _geoCanonical(name) {
  if (!name) return null;
  const info = GEO_COUNTRIES[name];
  if (info) return GEO_CANONICAL[info[0]] || name;
  // Case-insensitive fallback
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(GEO_COUNTRIES)) {
    if (k.toLowerCase() === lower) return GEO_CANONICAL[v[0]] || k;
  }
  return name;
}

// ── Group items by country → city ────────────────────────────
function _geoGroupByCountry(items) {
  const byCountry = {};
  items.forEach(item => {
    const c = _geoCanonical(item.country) || 'Bilinmiyor';
    if (!byCountry[c]) byCountry[c] = { country: c, total: 0, amount: 0, cities: {} };
    byCountry[c].total++;
    byCountry[c].amount += (item.amount || 0);
    const city = item.city || '—';
    if (!byCountry[c].cities[city]) byCountry[c].cities[city] = { city, total: 0, amount: 0, names: [] };
    byCountry[c].cities[city].total++;
    byCountry[c].cities[city].amount += (item.amount || 0);
    if (byCountry[c].cities[city].names.length < 10) byCountry[c].cities[city].names.push({ name: item.name, id: item.id, type: item.type });
  });
  return byCountry;
}

// ── Render map markers ────────────────────────────────────────
function _geoRenderMap(data) {
  if (!_geoMap) return;

  // Clear existing markers
  _geoMarkers.forEach(m => _geoMap.removeLayer(m));
  _geoMarkers = [];

  if (!data || !Object.keys(data).length) return;

  const maxCount = Math.max(...Object.values(data).map(d => d.total));

  // ── 1. Country circle markers (large, pulsing) ──
  Object.values(data).forEach(d => {
    const coords = GEO_COUNTRIES[d.country];
    if (!coords) return;

    const lat  = coords[1], lon = coords[2];
    const pct  = maxCount > 0 ? d.total / maxCount : 0;
    const r    = 12 + pct * 38; // radius 12-50px
    const col  = _geoCountColor(pct);

    const circle = L.circleMarker([lat, lon], {
      radius:      r,
      fillColor:   col,
      color:       '#fff',
      weight:      2,
      opacity:     0.9,
      fillOpacity: 0.75,
    }).addTo(_geoMap);

    circle.bindTooltip(`<b>${d.country}</b><br>${d.total} ${_geoTabLabel()}`, {
      permanent: false, direction: 'top', className: 'geo-tooltip'
    });
    circle.on('click', () => _geoShowDetail(d));
    _geoMarkers.push(circle);

    // Permanent count label (DivIcon)
    const label = L.divIcon({
      className: 'geo-count-label',
      html: `<span>${d.total}</span>`,
      iconSize: [r * 2, r * 2],
      iconAnchor: [r, r],
    });
    const labelMarker = L.marker([lat, lon], { icon: label, interactive: false }).addTo(_geoMap);
    _geoMarkers.push(labelMarker);
  });

  // ── 2. City dots ──
  _geoRenderCityDots(data);
}

// ── City dot markers — called immediately + again after Nominatim ─
function _strHash(s) { let h=0; for(let i=0;i<s.length;i++) h=(Math.imul(31,h)+s.charCodeAt(i))|0; return h; }

function _geoRenderCityDots(data) {
  if (!_geoMap) return;

  // Clear previous city dots
  _geoCityMarkers.forEach(m => _geoMap.removeLayer(m));
  _geoCityMarkers = [];

  const nomCache = _geoNomGetCache();

  Object.values(data).forEach(d => {
    const countryCoords = GEO_COUNTRIES[d.country];

    Object.values(d.cities).forEach(cityObj => {
      const cityName = cityObj.city === '—' ? null : cityObj.city;
      if (!cityName) return;

      // 1. Built-in coords
      let coords = _geoCityCoords(cityName);
      let isApprox = false;

      // 2. Nominatim cache
      if (!coords) {
        const nomKey = `${cityName}|${d.country || ''}`.toLowerCase();
        const nomResult = nomCache[nomKey];
        if (Array.isArray(nomResult)) coords = nomResult;
      }

      // 3. Fallback jitter near country center (shown while Nominatim is loading)
      if (!coords && countryCoords) {
        const h = _strHash(cityName);
        const jLat = ((h & 0xFF) / 255 - 0.5) * 3;
        const jLon = (((h >> 8) & 0xFF) / 255 - 0.5) * 5;
        coords = [countryCoords[1] + jLat, countryCoords[2] + jLon];
        isApprox = true;
      }
      if (!coords) return;

      const r = Math.max(4, Math.min(10, 4 + cityObj.total));
      const dot = L.circleMarker([coords[0], coords[1]], {
        radius:      r,
        fillColor:   isApprox ? '#a78bfa' : '#f97316',
        color:       '#fff',
        weight:      1.5,
        opacity:     1,
        fillOpacity: isApprox ? 0.55 : 0.88,
      }).addTo(_geoMap);

      const amountStr = cityObj.amount > 0
        ? `<br>€ ${cityObj.amount.toLocaleString('de-DE', {maximumFractionDigits:0})}`
        : '';
      const approxNote = isApprox ? ` <span style="color:#a78bfa;font-size:10px;">(yaklaşık)</span>` : '';
      dot.bindTooltip(
        `<b>${cityObj.city}</b>${approxNote} <span style="color:#999">(${d.country})</span><br>${cityObj.total} ${_geoTabLabel()}${amountStr}`,
        { permanent: false, direction: 'top', className: 'geo-tooltip' }
      );
      dot.on('click', () => _geoShowCityDetail(cityObj, d));
      _geoCityMarkers.push(dot);
    });
  });
}

function _geoCountColor(pct) {
  // Blue gradient: light → dark
  if (pct > 0.8) return '#1a3a6b';
  if (pct > 0.6) return '#2B5597';
  if (pct > 0.4) return '#3d73c7';
  if (pct > 0.2) return '#6499d9';
  return '#93bff0';
}

function _geoTabLabel() {
  if (_geoActiveTab === 'kisiler')    return 'Kişi/Firma';
  if (_geoActiveTab === 'angebote')   return 'Teklif';
  if (_geoActiveTab === 'rechnungen') return 'Fatura';
  return 'Kayıt';
}

// ── Country detail panel ──────────────────────────────────────
function _geoShowDetail(countryData) {
  _geoSelectedCountry = countryData.country;
  const panel  = document.getElementById('geo-detail');
  const title  = document.getElementById('geo-detail-title');
  const body   = document.getElementById('geo-detail-body');
  if (!panel) return;

  const flag   = _geoFlag(countryData.country);
  const cities = Object.values(countryData.cities)
    .sort((a, b) => b.total - a.total);

  title.innerHTML = `${flag} ${_geoEsc(countryData.country)} <span class="badge bg-primary ms-1">${countryData.total}</span>`;

  const hasAmount = cities.some(c => c.amount > 0);
  body.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm table-hover mb-0" style="font-size:13px;">
        <thead class="table-light">
          <tr>
            <th>Şehir</th>
            <th class="text-end">${_geoTabLabel()}</th>
            ${hasAmount ? `<th class="text-end">Tutar</th>` : ''}
          </tr>
        </thead>
        <tbody>
          ${cities.map(c => `
            <tr title="${_geoEsc(c.names.join(', '))}">
              <td>
                <i class="bi bi-geo-alt-fill text-primary me-1" style="font-size:11px;"></i>
                ${_geoEsc(c.city === '—' ? 'Bilinmeyen Şehir' : c.city)}
              </td>
              <td class="text-end fw-semibold">${c.total}</td>
              ${hasAmount ? `<td class="text-end text-muted">${c.amount > 0 ? '€ ' + c.amount.toLocaleString('de-DE', {maximumFractionDigits:0}) : '—'}</td>` : ''}
            </tr>`).join('')}
        </tbody>
        <tfoot class="table-light fw-semibold">
          <tr>
            <td>Toplam</td>
            <td class="text-end">${countryData.total}</td>
            ${hasAmount ? `<td class="text-end">${countryData.amount > 0 ? '€ ' + countryData.amount.toLocaleString('de-DE', {maximumFractionDigits:0}) : '—'}</td>` : ''}
          </tr>
        </tfoot>
      </table>
    </div>
    <div class="mt-2 px-1" style="font-size:12px; color:#888;">
      Bir satıra tıklayarak müşterileri görün
    </div>`;

  // City row click → show customer names
  body.querySelectorAll('tbody tr').forEach((row, i) => {
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => {
      const c = cities[i];
      _geoShowCityNames(c, countryData.country);
    });
  });

  panel.style.display = '';
  // Zoom into country
  const coords = GEO_COUNTRIES[countryData.country];
  if (coords) _geoMap.flyTo([coords[1], coords[2]], 5, { duration: 1 });
}

// Called when clicking a city dot directly on the map
function _geoShowCityDetail(cityObj, countryData) {
  const panel = document.getElementById('geo-detail');
  const title = document.getElementById('geo-detail-title');
  const flag  = _geoFlag(countryData.country);

  // Set title with city name + country back-link
  title.innerHTML = `
    <i class="bi bi-geo-alt-fill text-primary me-1" style="font-size:14px;"></i>
    ${_geoEsc(cityObj.city === '—' ? 'Bilinmeyen Şehir' : cityObj.city)}
    <span class="badge bg-primary ms-1">${cityObj.total}</span>
    <small class="ms-2 fw-normal" style="font-size:12px;color:#6b7280;">
      ${flag} ${_geoEsc(countryData.country)}
    </small>`;

  // Show city names + amount
  const hasAmount = cityObj.amount > 0;
  const body = document.getElementById('geo-detail-body');
  body.innerHTML = `
    <button class="btn btn-sm btn-outline-secondary mb-3"
      onclick="_geoShowDetail(_geoAllData[_geoActiveTab]['${_geoEsc(countryData.country)}'])">
      ← ${flag} ${_geoEsc(countryData.country)} — tüm şehirler
    </button>
    ${hasAmount ? `<div class="mb-2 text-muted" style="font-size:12px;"><i class="bi bi-currency-euro me-1"></i>€ ${cityObj.amount.toLocaleString('de-DE',{maximumFractionDigits:0})}</div>` : ''}
    <ul class="list-unstyled mb-0" style="font-size:13px;">
      ${cityObj.names.map(r => _geoRecordItem(r)).join('')}
      ${cityObj.total > cityObj.names.length
        ? `<li class="text-muted py-2" style="font-size:12px;">… ve ${cityObj.total - cityObj.names.length} kişi daha</li>`
        : ''}
    </ul>`;

  if (panel) panel.style.display = '';

  // Zoom into city if coords available
  const cityCoords = _geoCityCoords(cityObj.city);
  const nomKey = `${cityObj.city}|${countryData.country}`.toLowerCase();
  const nomCoords = _geoNomGetCache()[nomKey];
  const target = cityCoords || (Array.isArray(nomCoords) ? nomCoords : null);
  if (target && _geoMap) {
    _geoMap.flyTo(target, 10, { duration: 1 });
  } else {
    // fallback: zoom to country
    const cc = GEO_COUNTRIES[countryData.country];
    if (cc && _geoMap) _geoMap.flyTo([cc[1], cc[2]], 6, { duration: 1 });
  }
}

function _geoShowCityNames(cityData, country) {
  const body = document.getElementById('geo-detail-body');
  const flag = _geoFlag(country);
  body.innerHTML = `
    <button class="btn btn-sm btn-outline-secondary mb-3" onclick="_geoShowDetail(_geoAllData[_geoActiveTab]['${_geoEsc(country)}'])">
      ← Geri: ${flag} ${_geoEsc(country)}
    </button>
    <div class="fw-semibold mb-2">
      <i class="bi bi-geo-alt-fill text-primary me-1"></i>
      ${_geoEsc(cityData.city === '—' ? 'Bilinmeyen Şehir' : cityData.city)}
      <span class="badge bg-primary ms-1">${cityData.total}</span>
    </div>
    <ul class="list-unstyled mb-0" style="font-size:13px;">
      ${cityData.names.map(r => _geoRecordItem(r)).join('')}
      ${cityData.total > cityData.names.length ? `<li class="text-muted py-1">… ve ${cityData.total - cityData.names.length} daha fazla</li>` : ''}
    </ul>`;
}

// ── Clickable record item (contact or company) ────────────────
function _geoRecordItem(r) {
  // r can be { name, id, type } (new format) or a plain string (legacy)
  const name = (typeof r === 'object') ? r.name : r;
  const id   = (typeof r === 'object') ? r.id   : null;
  const type = (typeof r === 'object') ? r.type  : null;

  const icon = type === 'company'
    ? `<i class="bi bi-building text-primary" style="font-size:12px;flex-shrink:0;"></i>`
    : `<i class="bi bi-person-fill text-primary" style="font-size:12px;flex-shrink:0;"></i>`;

  const clickable = id && (type === 'contact' || type === 'company');
  const onclick = clickable
    ? `onclick="_geoOpenRecord(${id},'${type}')" style="cursor:pointer;"`
    : '';
  const linkStyle = clickable
    ? `text-decoration:underline;text-underline-offset:2px;color:#1d4ed8;`
    : '';

  return `<li class="py-2 border-bottom d-flex align-items-center gap-2" ${onclick}>
    ${icon}
    <span style="${linkStyle}">${_geoEsc(name)}</span>
    ${clickable ? `<i class="bi bi-box-arrow-up-right ms-auto" style="font-size:10px;color:#9ca3af;flex-shrink:0;"></i>` : ''}
  </li>`;
}

// Open contact or company modal from geo panel
function _geoOpenRecord(id, type) {
  if (type === 'contact' && typeof showContactModal === 'function') {
    showContactModal(id);
  } else if (type === 'company' && typeof showCompanyModal === 'function') {
    showCompanyModal(id);
  }
}

function _geoHideDetail() {
  const panel = document.getElementById('geo-detail');
  if (panel) panel.style.display = 'none';
}

// ── Stats bar ─────────────────────────────────────────────────
function _geoRenderStats(data) {
  const total     = Object.values(data).reduce((s, d) => s + d.total, 0);
  const countries = Object.keys(data).length;
  const cities    = Object.values(data).reduce((s, d) => s + Object.keys(d.cities).length, 0);
  const amount    = Object.values(data).reduce((s, d) => s + d.amount, 0);
  const hasAmount = _geoActiveTab !== 'kisiler' && amount > 0;

  const el = document.getElementById('geo-stats');
  if (!el) return;
  el.innerHTML = `
    <span class="geo-stat geo-stat-btn" onclick="_geoStatClick('records')" title="Tümünü listele">
      <i class="bi bi-people-fill me-1"></i><b>${total}</b> ${_geoTabLabel()}
    </span>
    <span class="geo-stat geo-stat-btn" onclick="_geoStatClick('countries')" title="Ülkeleri listele">
      <i class="bi bi-globe2 me-1"></i><b>${countries}</b> Ülke
    </span>
    <span class="geo-stat geo-stat-btn" onclick="_geoStatClick('cities')" title="Şehirleri listele">
      <i class="bi bi-geo-alt-fill me-1"></i><b>${cities}</b> Şehir
    </span>
    ${hasAmount ? `<span class="geo-stat"><i class="bi bi-currency-euro me-1"></i><b>€ ${amount.toLocaleString('de-DE',{maximumFractionDigits:0})}</b> Toplam</span>` : ''}`;
}

// ── Stat click → show panel ───────────────────────────────────
function _geoStatClick(mode) {
  const data  = _geoAllData[_geoActiveTab] || {};
  const panel = document.getElementById('geo-detail');
  const title = document.getElementById('geo-detail-title');
  const body  = document.getElementById('geo-detail-body');
  if (!panel) return;

  if (mode === 'countries') {
    // Show sortable country list
    const sorted = Object.values(data).sort((a, b) => b.total - a.total);
    title.innerHTML = `<i class="bi bi-globe2 me-2 text-primary"></i>Tüm Ülkeler <span class="badge bg-primary ms-1">${sorted.length}</span>`;
    body.innerHTML = `
      <ul class="list-unstyled mb-0">
        ${sorted.map(d => `
          <li class="py-2 border-bottom d-flex align-items-center gap-2" style="cursor:pointer;"
              onclick="_geoShowDetail(_geoAllData['${_geoActiveTab}']['${_geoEsc(d.country)}'])">
            <span style="font-size:18px;">${_geoFlag(d.country)}</span>
            <span class="flex-grow-1">${_geoEsc(d.country)}</span>
            <span class="badge bg-light text-dark border">${d.total}</span>
            <i class="bi bi-chevron-right text-muted" style="font-size:11px;"></i>
          </li>`).join('')}
      </ul>`;

  } else if (mode === 'cities') {
    // Flat list of all cities sorted by count
    const allCities = [];
    Object.values(data).forEach(d => {
      Object.values(d.cities).forEach(c => {
        if (c.city !== '—') allCities.push({ ...c, country: d.country, countryData: d });
      });
    });
    allCities.sort((a, b) => b.total - a.total);
    title.innerHTML = `<i class="bi bi-geo-alt-fill me-2 text-primary"></i>Tüm Şehirler <span class="badge bg-primary ms-1">${allCities.length}</span>`;
    body.innerHTML = `
      <ul class="list-unstyled mb-0">
        ${allCities.map(c => `
          <li class="py-2 border-bottom d-flex align-items-center gap-2" style="cursor:pointer;"
              onclick="_geoShowCityDetail(${JSON.stringify(c).replace(/"/g,'&quot;')}, _geoAllData['${_geoActiveTab}']['${_geoEsc(c.country)}'])">
            <i class="bi bi-geo-alt-fill text-primary" style="font-size:12px;flex-shrink:0;"></i>
            <span class="flex-grow-1">${_geoEsc(c.city)}</span>
            <small class="text-muted">${_geoFlag(c.country)}</small>
            <span class="badge bg-light text-dark border">${c.total}</span>
            <i class="bi bi-chevron-right text-muted" style="font-size:11px;"></i>
          </li>`).join('')}
      </ul>`;

  } else if (mode === 'records') {
    // All records flat, sorted alphabetically
    const allRecords = [];
    Object.values(data).forEach(d => {
      Object.values(d.cities).forEach(c => {
        c.names.forEach(r => allRecords.push({ r, city: c.city, country: d.country }));
      });
    });
    allRecords.sort((a, b) => {
      const na = (typeof a.r === 'object' ? a.r.name : a.r) || '';
      const nb = (typeof b.r === 'object' ? b.r.name : b.r) || '';
      return na.localeCompare(nb, 'tr');
    });
    title.innerHTML = `<i class="bi bi-people-fill me-2 text-primary"></i>Tüm ${_geoTabLabel()} <span class="badge bg-primary ms-1">${allRecords.length}</span>`;
    body.innerHTML = `
      <ul class="list-unstyled mb-0">
        ${allRecords.map(({ r, city, country }) => {
          const name = (typeof r === 'object') ? r.name : r;
          const id   = (typeof r === 'object') ? r.id   : null;
          const type = (typeof r === 'object') ? r.type  : null;
          const icon = type === 'company'
            ? `<i class="bi bi-building text-primary" style="font-size:12px;"></i>`
            : `<i class="bi bi-person-fill text-primary" style="font-size:12px;"></i>`;
          const clickAttr = id ? `onclick="_geoOpenRecord(${id},'${type}')" style="cursor:pointer;"` : '';
          const linkStyle = id ? `text-decoration:underline;text-underline-offset:2px;color:#1d4ed8;` : '';
          return `<li class="py-2 border-bottom d-flex align-items-center gap-2" ${clickAttr}>
            ${icon}
            <span class="flex-grow-1" style="${linkStyle}">${_geoEsc(name)}</span>
            <small class="text-muted" style="font-size:11px;">${_geoFlag(country)} ${_geoEsc(city !== '—' ? city : '')}</small>
          </li>`;
        }).join('')}
      </ul>`;
  }

  panel.style.display = '';
}

// ── Country list table (below map) ───────────────────────────
function _geoRenderTable(data) {
  const el = document.getElementById('geo-table');
  if (!el) return;

  const sorted = Object.values(data).sort((a,b) => b.total - a.total);
  if (!sorted.length) { el.innerHTML = '<div class="text-muted p-3 text-center">Veri bulunamadı</div>'; return; }

  const hasAmount = _geoActiveTab !== 'kisiler' && sorted.some(d => d.amount > 0);

  el.innerHTML = `
    <table class="table table-sm table-hover mb-0" style="font-size:13px;">
      <thead class="table-light">
        <tr>
          <th>Ülke</th>
          <th class="text-end">${_geoTabLabel()}</th>
          <th class="text-end">Şehirler</th>
          ${hasAmount ? '<th class="text-end">Tutar</th>' : ''}
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map(d => `
          <tr style="cursor:pointer;" onclick="_geoShowDetail(${JSON.stringify(d).replace(/"/g,'&quot;')})">
            <td>${_geoFlag(d.country)} ${_geoEsc(d.country)}</td>
            <td class="text-end fw-semibold">${d.total}</td>
            <td class="text-end text-muted">${Object.keys(d.cities).length}</td>
            ${hasAmount ? `<td class="text-end text-muted">${d.amount > 0 ? '€ ' + d.amount.toLocaleString('de-DE',{maximumFractionDigits:0}) : '—'}</td>` : ''}
            <td><button class="btn btn-xs btn-outline-primary" style="font-size:11px;padding:1px 6px;" onclick="event.stopPropagation();_geoShowDetail(${JSON.stringify(d).replace(/"/g,'&quot;')})">Detaylar</button></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// ── Helpers ───────────────────────────────────────────────────
function _geoFlag(country) {
  const flags = {
    'Türkiye':'🇹🇷','Turkey':'🇹🇷','Deutschland':'🇩🇪','Germany':'🇩🇪',
    'Spanien':'🇪🇸','Spain':'🇪🇸','Frankreich':'🇫🇷','France':'🇫🇷',
    'Italien':'🇮🇹','Italy':'🇮🇹','Österreich':'🇦🇹','Austria':'🇦🇹',
    'Schweiz':'🇨🇭','Switzerland':'🇨🇭','Niederlande':'🇳🇱','Netherlands':'🇳🇱',
    'Belgien':'🇧🇪','Belgium':'🇧🇪','Polen':'🇵🇱','Poland':'🇵🇱',
    'Griechenland':'🇬🇷','Greece':'🇬🇷','Portugal':'🇵🇹',
    'Vereinigtes Königreich':'🇬🇧','United Kingdom':'🇬🇧','UK':'🇬🇧',
    'USA':'🇺🇸','United States':'🇺🇸','Amerika':'🇺🇸',
    'China':'🇨🇳','Japan':'🇯🇵','Indien':'🇮🇳','India':'🇮🇳',
    'UAE':'🇦🇪','Dubai':'🇦🇪','Vereinigte Arabische Emirate':'🇦🇪',
    'Saudi-Arabien':'🇸🇦','Russland':'🇷🇺','Russia':'🇷🇺',
    'Kanada':'🇨🇦','Canada':'🇨🇦','Australien':'🇦🇺','Australia':'🇦🇺',
  };
  return flags[country] || '🌍';
}

function _geoEsc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Public: refresh (invalidate cache + reload) ───────────────
function geoRefresh() {
  _geoAllData = {};
  _geoSelectedCountry = null;
  _geoSwitchTab(_geoActiveTab, true);
}
