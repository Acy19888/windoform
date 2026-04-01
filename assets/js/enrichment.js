// Split from app.js — Address autocomplete and company data enrichment

async function refreshCompanyDatalist() {
  const cos = await dbAll('companies');
  const names = cos.map(c => c.name).filter(Boolean).sort();
  ['company-datalist','company-datalist-edit'].forEach(id => {
    const dl = document.getElementById(id);
    if (!dl) return;
    dl.innerHTML = names.map(n => `<option value="${n}">`).join('');
  });
}

function autoDetectLocation(formId) {
  const pre = formId === 'add-company' ? 'ac' : 'ec';
  const addr = document.getElementById(`${pre}-address`).value;
  const cityEl = document.getElementById(`${pre}-city`);
  const distEl = document.getElementById(`${pre}-district`);
  if (!addr) return;
  const loc = parseAddressForLocation(addr);
  if (loc.city && !cityEl.value) cityEl.value = loc.city;
  if (loc.district && !distEl.value) distEl.value = loc.district;
}

// ── Nominatim address autocomplete ───────────────────────────
// Call initAddressAutocomplete(addrInputId, cityInputId, postcodeInputId, countrySelectId)
// to wire up a live address search on any form
let _nomAcTimer = null;
let _nomAcCache = {};

function initAddressAutocomplete(addrId, cityId, postcodeId, countryId) {
  const addrEl = document.getElementById(addrId);
  if (!addrEl || addrEl._nomAcInit) return;
  addrEl._nomAcInit = true;

  // Create dropdown container
  const wrap = addrEl.parentElement;
  wrap.style.position = 'relative';
  const drop = document.createElement('ul');
  drop.className = 'nom-ac-drop';
  wrap.appendChild(drop);

  addrEl.addEventListener('input', () => {
    clearTimeout(_nomAcTimer);
    const q = addrEl.value.trim();
    if (q.length < 3) { drop.innerHTML = ''; drop.style.display = 'none'; return; }
    _nomAcTimer = setTimeout(() => _nomAcSearch(q, drop, addrEl, cityId, postcodeId, countryId), 400);
  });
  addrEl.addEventListener('blur', () => setTimeout(() => { drop.style.display='none'; }, 200));
  addrEl.addEventListener('focus', () => { if (drop.children.length) drop.style.display='block'; });
}

async function _nomAcSearch(q, drop, addrEl, cityId, postcodeId, countryId) {
  const cacheKey = q.toLowerCase();
  let results = _nomAcCache[cacheKey];
  if (!results) {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=5&accept-language=de,tr,en`,
        { headers: { 'User-Agent': 'WindoformCRM/1.0' } }
      );
      results = await r.json();
      _nomAcCache[cacheKey] = results;
    } catch { return; }
  }
  drop.innerHTML = '';
  if (!results || !results.length) { drop.style.display='none'; return; }

  results.forEach(item => {
    const li = document.createElement('li');
    li.className = 'nom-ac-item';
    li.textContent = item.display_name;
    li.addEventListener('mousedown', () => {
      const a = item.address || {};
      // Fill address field with street + number
      const street = [a.road, a.house_number].filter(Boolean).join(' ');
      addrEl.value = street || item.display_name.split(',')[0];
      // Fill city
      const cityEl = document.getElementById(cityId);
      if (cityEl) cityEl.value = a.city || a.town || a.village || a.county || a.state || '';
      // Fill postcode
      const postEl = document.getElementById(postcodeId);
      if (postEl) postEl.value = a.postcode || '';
      // Fill country (as select or input)
      const countryEl = document.getElementById(countryId);
      if (countryEl && a.country) {
        // Try to match to canonical name
        const raw = a.country;
        const canonical = _nomAcCanonicalCountry(raw);
        if (countryEl.tagName === 'SELECT') {
          // Find matching option
          for (const opt of countryEl.options) {
            if (opt.value === canonical || opt.value === raw || opt.text === canonical) {
              countryEl.value = opt.value; break;
            }
          }
        } else {
          countryEl.value = canonical || raw;
        }
      }
      drop.style.display = 'none';
    });
    drop.appendChild(li);
  });
  drop.style.display = 'block';
}

// Map Nominatim country name → canonical CRM name
function _nomAcCanonicalCountry(raw) {
  if (!raw) return '';
  const map = {
    'Germany':'Deutschland','Deutschland':'Deutschland',
    'Turkey':'Türkiye','Türkiye':'Türkiye','Turkiye':'Türkiye',
    'Austria':'Österreich','Österreich':'Österreich',
    'Switzerland':'Schweiz','France':'Frankreich','Italy':'Italien',
    'Spain':'Spanien','Netherlands':'Niederlande','Belgium':'Belgien',
    'Poland':'Polen','Czech Republic':'Tschechien','Slovakia':'Slowakei',
    'Hungary':'Ungarn','Romania':'Rumänien','Bulgaria':'Bulgarien',
    'Croatia':'Kroatien','Serbia':'Serbien','Greece':'Griechenland',
    'United Kingdom':'Vereinigtes Königreich','Russia':'Russland',
    'United States':'USA','United States of America':'USA',
    'Canada':'Kanada','Australia':'Australien','Brazil':'Brasilien',
    'Mexico':'Mexiko','India':'Indien','China':'China','Japan':'Japan',
    'Saudi Arabia':'Saudi-Arabien',
    'United Arab Emirates':'Vereinigte Arabische Emirate',
  };
  return map[raw] || raw;
}
async function _serverAvailable() {
  try {
    const r = await fetch('http://localhost:8765/', { method: 'HEAD', signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch (_) { return false; }
}

// Sunucu uzerinden Google araması
async function _searchViaServer(name, city, out) {
  try {
    const r = await fetch('http://localhost:8765/api/enrich-company', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, city }),
      signal:  AbortSignal.timeout(15000)
    });
    if (!r.ok) return;
    const d = await r.json();
    if (d.error) return;
    if (d.address || d.phone || d.city) {
      out.push({
        source:   'Google (Sunucu)',
        priority: 0,
        name,
        address:  d.address  || null,
        city:     d.city     || null,
        district: d.district || null,
        phone:    d.phone    || null,
        website:  d.website  || null,
        lat:      d.lat      || null,
        lon:      d.lon      || null
      });
    }
  } catch(e) { console.warn('[Sunucu]', e.message); }
}


// CORS proxy ile beyazsayfa.com.tr aramasi
async function _searchViaProxy(name, city, out) {
  const proxies = [
    'https://corsproxy.io/?url=',
    'https://api.allorigins.win/raw?url='
  ];
  const target = 'https://www.beyazsayfa.com.tr/search/?' +
    'q=' + encodeURIComponent(name + (city ? ' ' + city : ''));

  for (const proxy of proxies) {
    try {
      const r = await fetch(proxy + encodeURIComponent(target), {
        signal: AbortSignal.timeout(10000)
      });
      if (!r.ok) continue;
      const html = await r.text();

      // JSON-LD parse
      const jm = html.match(/<script[^>]+ld\+json[^>]*>([\s\S]*?)<\/script>/i);
      if (jm) {
        try {
          const jld = JSON.parse(jm[1]);
          const items = Array.isArray(jld) ? jld : [jld];
          for (const it of items) {
            const t = String(it['@type']||'').toLowerCase();
            if (!/(business|organization|store|place|company|service)/.test(t)) continue;
            const addr = it.address || {};
            const street = (typeof addr === 'string') ? addr : (addr.streetAddress||'');
            const c    = (typeof addr === 'object') ? (addr.addressLocality||addr.addressRegion||'') : '';
            const full = [street, c].filter(Boolean).join(', ');
            const ph   = String(it.telephone||it.phone||'').replace(/[\s\-\(\)\+\.]/g,'');
            const web  = String(it.url||'');
            if (full || (ph && ph.length >= 10)) {
              out.push({
                source: 'beyazsayfa.com.tr',
                priority: 0, name,
                address:  full   || null,
                city:     c      || city || null,
                district: null,
                phone:    (ph.length >= 10) ? ph : null,
                website:  web    || null,
                lat: null, lon: null
              });
              return;
            }
          }
        } catch(_e) {}
      }

      // Telefon regex fallback
      const pm = html.match(/(?:\+90|0)[\s\-]?\(?[1-9]\d{2}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/);
      if (pm) {
        const ph = pm[0].replace(/[\s\-\(\)\+\.]/g,'');
        if (ph.length >= 10) {
          out.push({
            source: 'beyazsayfa.com.tr', priority: 0, name,
            address: null, city: city||null, district: null,
            phone: ph, website: null, lat: null, lon: null
          });
          return;
        }
      }
      break;
    } catch(e) { console.warn('[Proxy]', e.message); }
  }
}

// Overpass (OSM) -- sehir bbox ile
const CITY_BBOX = {
  'istanbul':[40.55,27.95,41.35,29.95],'ankara':[39.65,32.35,40.25,33.20],
  'izmir':[37.80,26.70,38.65,27.45],'bursa':[39.75,28.70,40.40,29.60],
  'antalya':[36.60,30.20,37.25,31.20],'kocaeli':[40.48,29.40,40.95,30.60],
  'izmit':[40.48,29.40,40.95,30.60],'adana':[36.80,35.10,37.30,35.90],
  'gaziantep':[36.75,37.00,37.25,37.70],'konya':[37.40,31.90,38.20,32.80],
  'mersin':[36.60,33.50,37.10,34.70],'diyarbakir':[37.70,40.00,38.10,40.40],
  'hatay':[36.10,35.90,37.00,36.70],'manisa':[38.40,27.30,39.00,28.30],
  'kayseri':[38.40,35.20,38.90,35.90],'samsun':[41.10,35.70,41.50,36.50],
  'balikesir':[39.30,26.90,40.00,28.20],'tekirdag':[40.75,26.80,41.20,27.90],
  'denizli':[37.50,28.80,38.20,29.50],'eskisehir':[39.55,30.30,39.90,31.00],
  'sakarya':[40.60,30.20,41.00,30.80],'trabzon':[40.80,39.40,41.15,40.00],
  'malatya':[38.10,37.90,38.50,38.50],'erzurum':[39.80,41.10,40.10,41.60],
  'van':[38.30,43.20,38.60,43.60],'kahramanmaras':[37.40,36.60,37.80,37.10],
  'urfa':[36.90,38.60,37.40,39.00],'sanliurfa':[36.90,38.60,37.40,39.00],
  'aydin':[37.50,27.50,38.10,28.10],'mugla':[36.60,27.90,37.40,29.20],
  'canakkale':[39.80,25.90,40.40,27.10],'edirne':[41.40,26.00,41.90,26.80],
  'yalova':[40.55,29.10,40.80,29.55],'isparta':[37.55,30.40,38.10,31.20],
  'zonguldak':[41.20,31.40,41.65,32.00],'bolu':[40.55,31.40,40.90,31.90],
  'kastamonu':[41.20,33.50,41.60,34.20],'afyon':[38.30,30.30,38.90,30.80],
  'afyonkarahisar':[38.30,30.30,38.90,30.80],'usak':[38.40,29.10,38.80,29.60],
  'elazig':[38.50,39.00,38.90,39.60],'mardin':[37.10,40.40,37.60,41.00],
  'batman':[37.75,41.00,38.10,41.50],'ordu':[40.80,36.90,41.20,37.50],
  'giresun':[40.80,38.20,41.15,38.90],'rize':[40.90,40.40,41.20,41.00],
  'artvin':[41.00,41.50,41.40,42.20]
};

async function _searchOverpass(name, city, out) {
  try {
    const safe = name.replace(/["'\[\]()\{\}\\]/g,'').substring(0,60);
    const k    = trLow(city||'').replace(/\s+/g,'');
    const bbox = CITY_BBOX[k];
    const b    = bbox ? bbox[0]+','+bbox[1]+','+bbox[2]+','+bbox[3] : '36,26,42,45';
    const q    = '[out:json][timeout:12];\n(\n' +
      '  node["name"~"'+safe+'","i"]('+b+');\n' +
      '  way["name"~"'+safe+'","i"]('+b+');\n' +
      ');\nout 6 qt;';
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(q),
      signal: AbortSignal.timeout(14000)
    });
    if (!r.ok) return;
    const d = await r.json();
    for (const el of (d.elements||[])) {
      const t = el.tags||{};
      if (!t.name) continue;
      const aC = t['addr:city']||t['addr:province']||'';
      // addr:district = ilçe, addr:suburb/neighbourhood = mahalle
      const aD = t['addr:district']||t['addr:suburb']||t['addr:neighbourhood']||'';
      const st = [t['addr:street'],t['addr:housenumber']].filter(Boolean).join(' ');
      const fa = t['addr:full']||(st?(st+(aC?', '+aC:'')):'');
      const ph = (t.phone||t['contact:phone']||'').replace(/\s/g,'');
      const wb = t.website||t['contact:website']||'';
      const ok = !city||!aC||trLow(aC).includes(trLow(city).substring(0,5))||trLow(city).includes(trLow(aC).substring(0,5));
      out.push({ source:'OpenStreetMap', priority:ok?0:1, name:t.name,
        address:fa||null, city:aC||null, district:aD||null,
        phone:ph||null, website:wb||null, lat:el.lat||null, lon:el.lon||null });
    }
  } catch(e) { console.warn('[Overpass]', e.message); }
}

// Ana fonksiyon
async function enrichCompanyFromGoogle() {
  if (!currentModalCompanyId) return;
  const c = await dbGet('companies', currentModalCompanyId);
  if (!c||!c.name) { toast('Firma adı bulunamadı. Önce bir firmayı açıp "Adres Kontrol" panelinden deneyin.', 'error'); return; }

  const name = c.name.trim();
  const city = (c.city||'').trim();
  _enrichCandidates = [];

  const panel = document.getElementById('enrich-candidates');
  const list  = document.getElementById('enrich-candidates-list');
  if (panel) panel.style.display = 'none';
  if (list)  list.innerHTML = '';

  showLoading('Arama yap\u0131l\u0131yor\u2026');

  const hasSrv = await _serverAvailable();

  if (hasSrv) {
    // Sunucu varsa: Google dogru sonuc verir
    await _searchViaServer(name, city, _enrichCandidates);
  }
  // beyazsayfa.com.tr - CORS proxy (sunucu olmasa da calisir)
  await _searchViaProxy(name, city, _enrichCandidates);
  // OpenStreetMap
  await _searchOverpass(name, city, _enrichCandidates);

  hideLoading();

  // Oncelik sirala, tekrar kaldir
  _enrichCandidates.sort((a,b)=>{
    if (a.priority!==b.priority) return a.priority-b.priority;
    const ord={'Google (Sunucu)':0,'OpenStreetMap':1};
    return (ord[a.source]||9)-(ord[b.source]||9);
  });
  const seen=new Set();
  _enrichCandidates=_enrichCandidates.filter(x=>{
    const k=(x.city||'')+(x.phone||'')+(x.address||'').substring(0,15);
    if(seen.has(k)) return false; seen.add(k); return true;
  });

  if (_enrichCandidates.length===0) {
    // Sonuc yok: Google arama linki goster
    const gq = encodeURIComponent(name + (city ? ' ' + city : '') + ' iletisim adres telefon');
    const gUrl = 'https://www.google.com/search?q=' + gq;
    if (list) {
      list.innerHTML =
        '<div style="padding:12px;background:#fff3cd;border-radius:6px;border:1px solid #ffc107;">'+
        '<b>\u26a0\ufe0f Otomatik sonu\u00e7 bulunamad\u0131.</b><br>'+
        '<small>\u201c'+esc(name)+'\u201d i\u00e7in veritabanlar\u0131nda kay\u0131t yok.</small><br><br>'+
        '<a href="'+gUrl+'" target="_blank" class="btn btn-sm btn-outline-primary">'+
        '\uD83D\uDD0D Google\u2019da A\u00e7 \u2192</a>'+
        '<small class="text-muted ms-2">Buldu\u011funuz bilgileri forma kendiniz girebilirsiniz.</small>'+
        '</div>';
      if (panel) panel.style.display='';
    }
    return;
  }

  list.innerHTML='';
  _enrichCandidates.forEach((cand,idx)=>{
    const srcColor = {'Google (Sunucu)':'#1a73e8','OpenStreetMap':'#198754'}[cand.source]||'#6c757d';
    const warn = cand.priority===1
      ? '<span style="background:#ffc107;color:#000;border-radius:4px;padding:1px 6px;font-size:10px;margin-left:4px;">\u26a0 Farkl\u0131 \u015fehir</span>' : '';
    const lines=[];
    if (cand.city||cand.district)
      lines.push('<b>'+esc(cand.city||'')+(cand.district?' / '+esc(cand.district):'')+'</b>');
    if (cand.address)  lines.push('\uD83D\uDCCD '+esc(cand.address));
    if (cand.phone)    lines.push('\uD83D\uDCDE '+esc(cand.phone));
    if (cand.website)  lines.push('\uD83C\uDF10 '+esc(cand.website));
    const card=document.createElement('div');
    card.style.cssText='cursor:pointer;border:1px solid #dee2e6;border-radius:6px;padding:8px 10px;margin-bottom:6px;background:#fff;';
    card.onmouseover=()=>{card.style.background='#f0f7ff';card.style.borderColor='#0d6efd';};
    card.onmouseout =()=>{card.style.background='#fff';   card.style.borderColor='#dee2e6';};
    card.onclick    =()=>selectEnrichResult(idx);
    card.innerHTML=
      '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:3px;margin-bottom:4px;">'+
        '<span style="background:'+srcColor+';color:#fff;border-radius:4px;padding:1px 7px;font-size:10px;">'+esc(cand.source)+'</span>'+
        warn+
        '<span style="font-size:13px;font-weight:600;margin-left:5px;">'+esc(cand.name||name)+'</span>'+
      '</div>'+
      (lines.length
        ? '<div style="font-size:12px;color:#444;line-height:1.8;">'+lines.join('<br>')+'</div>'
        : '<div style="font-size:12px;color:#999;">Adres/iletisim yok</div>')+
      '<div style="text-align:right;margin-top:5px;">'+
        '<button class="btn btn-sm btn-primary" style="font-size:11px;padding:2px 10px;" '+
        'onclick="event.stopPropagation();selectEnrichResult('+idx+')">Bu bilgiyi kullan \u2192</button>'+
      '</div>';
    list.appendChild(card);
  });

  panel.style.display='';
  panel.scrollIntoView({behavior:'smooth',block:'nearest'});
  const ok=_enrichCandidates.filter(x=>x.priority===0).length;
  toast(ok+' e\u015fle\u015fen sonu\u00e7 bulundu. Do\u011fru olan\u0131 se\u00e7in.','info');
}

function selectEnrichResult(idx) {
  const cand=_enrichCandidates[idx];
  if (!cand) return;
  if (cand.address)  document.getElementById('cu-address').value =cand.address;
  if (cand.city)     document.getElementById('cu-city').value    =cand.city;
  if (cand.district) document.getElementById('cu-district').value=cand.district;
  if (cand.phone)    document.getElementById('cu-phone').value   =cand.phone;
  if (cand.website)  document.getElementById('cu-website').value =cand.website;
  if (cand.lat&&cand.lon&&currentModalCompanyId) {
    dbGet('companies',currentModalCompanyId).then(c=>{
      if(c) dbPut('companies',{...c,lat:cand.lat,lon:cand.lon,updatedAt:new Date().toISOString()});
    });
  }
  const panel=document.getElementById('enrich-candidates');
  if (panel) panel.style.display='none';
  toast('\u2713 Bilgiler forma aktar\u0131ld\u0131. "G\u00fcncelle & Kaydet" butonuna bas\u0131n.','success');
}

// ─── Nominatim adres objesinden il/ilçe/mahalle/sokak ayıklar ─────────────────
function _parseNominatimAddress(a, displayName) {
  // ── İL (city) ──────────────────────────────────────────────────────────────
  // Nominatim TR'de en güvenilir İl alanları: province, state
  // a.city büyükşehir adını taşır (İstanbul, Bursa, Ankara)
  // a.town = ilçe kasabası → İL için KULLANMA, ilçe fallback'inde kullan
  const city =
    a.province        ||   // en güvenilir: Türkiye'de il = province
    a.state           ||   // alternatif il alanı
    a.city            ||   // büyükşehir adı (İstanbul, Bursa, Ankara...)
    a.state_district  ||
    '';

  // ── İLÇE (district) ────────────────────────────────────────────────────────
  // Nominatim TR'de ilçe için olası tüm alanlar (büyükşehir ve taşra):
  // county        = taşra ilçesi (Bursa: Osmangazi, Nilüfer)
  // city_district = büyükşehir ilçesi (İstanbul: Kadıköy, Beşiktaş)
  // borough       = bazı büyükşehirlerde kullanılır
  // district      = alternatif admin alanı
  // municipality  = belediye
  // town          = ilçe kasabası (taşra fallback)
  // KESİNLİKLE suburb/quarter/neighbourhood KULLANMA → bunlar MAHALLE
  const district =
    a.county          ||   // taşra ilçesi (en yaygın TR ilçe alanı)
    a.city_district   ||   // büyükşehir ilçesi
    a.borough         ||   // alternatif büyükşehir ilçesi
    a.district        ||   // alternatif admin alanı
    a.municipality    ||   // belediye
    a.town            ||   // ilçe kasabası (küçük yerleşim fallback)
    '';

  // ── MAHALLE (neighbourhood) ────────────────────────────────────────────────
  // suburb / quarter / neighbourhood = mahalle seviyesi
  // village = köy (mahalle benzeri küçük yerleşim)
  const neighbourhood =
    a.suburb          ||
    a.quarter         ||
    a.neighbourhood   ||
    a.village         ||
    '';

  // ── ADRES (address): Sokak + Kapı No ──────────────────────────────────────
  const street = [a.road, a.house_number].filter(Boolean).join(' ');

  // Tam adres = sokak + mahalle (ilçe veya il DEĞİL)
  const addrParts = [street, neighbourhood].filter(Boolean);
  const address   = addrParts.length
    ? addrParts.join(', ')
    : (displayName || '').replace(/, T[uü]rkiye$/i, '').replace(/, Turkey$/i, '');

  return { city, district, neighbourhood, street, address };
}

// -- Enlem/Boylamdan Ters Kodlama (Nominatim) ---------------------------------
async function reverseGeocodeFromPanel() {
  const lat = parseFloat(document.getElementById('cu-lat').value);
  const lon = parseFloat(document.getElementById('cu-lon').value);
  if (!lat || !lon) {
    toast('Enlem ve Boylam girin (örn. 40.1885 / 29.0610)', 'error');
    return;
  }
  showLoading('Adres sorgulanıyor…');
  try {
    // addressdetails=1 tüm hiyerarşiyi getirir
    // zoom parametresi KULLANMA — address alanlarını etkilemez, sadece display_name'i etkiler
    const url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=' +
      lat + '&lon=' + lon + '&addressdetails=1&accept-language=tr';
    const r = await fetch(url, {
      headers: { 'User-Agent': 'CRM-App/1.0', 'Accept-Language': 'tr' },
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    hideLoading();
    if (!d || d.error) {
      toast('Bu koordinatlar için adres bulunamadı.', 'error');
      return;
    }

    const a = d.address || {};

    // ── Ham Nominatim alanlarını console'a yaz (diagnoz) ──────────────────────
    const rawKeys = ['road','house_number','suburb','quarter','neighbourhood','village',
      'hamlet','city_district','district','borough','municipality','county',
      'town','city','state_district','state','province','postcode','country'];
    const rawDebug = {};
    rawKeys.forEach(k => { if (a[k]) rawDebug[k] = a[k]; });
    console.log('[ReverseGeo] Ham Nominatim alanları:', JSON.stringify(rawDebug, null, 2));
    console.log('[ReverseGeo] Tüm address objesi:', JSON.stringify(a, null, 2));

    const parsed = _parseNominatimAddress(a, d.display_name);

    // Alanları doldur
    if (parsed.address)       document.getElementById('cu-address').value       = parsed.address;
    const mahEl = document.getElementById('cu-neighbourhood');
    if (mahEl) mahEl.value = parsed.neighbourhood || '';
    if (parsed.city)          document.getElementById('cu-city').value          = parsed.city;
    if (parsed.district)      document.getElementById('cu-district').value      = parsed.district;

    // Sonuç özeti toast
    const info = [];
    if (parsed.city)          info.push('İl: ' + parsed.city);
    if (parsed.district)      info.push('İlçe: ' + parsed.district);
    else {
      // İlçe bulunamadıysa ham alanlarda ne var göster
      const altDistrict = a.county || a.city_district || a.district || a.municipality || a.borough || a.town || '';
      if (altDistrict) info.push('İlçe(?): ' + altDistrict);
      else             info.push('İlçe: —bulunamadı—');
    }
    if (parsed.neighbourhood) info.push('Mahalle: ' + parsed.neighbourhood);
    if (parsed.street)        info.push('Sokak: ' + parsed.street);

    toast('✓ ' + info.join(' · ') + ' | Kontrol edip kaydedin.', 'success');
  } catch(e) {
    hideLoading();
    toast('Adres sorgulanamadı: ' + e.message, 'error');
  }
}

// -- Google Maps Fotograflari (Sunucu gerektirir) ------------------------------
async function fetchCompanyPhotos() {
  if (!currentModalCompanyId) return;
  const c = await dbGet('companies', currentModalCompanyId);
  if (!c) return;

  const gallery = document.getElementById('comp-photo-gallery');
  const strip   = document.getElementById('comp-photos-strip');

  // Sunucu varsa gercek fotograflar al
  const hasSrv = await _serverAvailable();
  if (hasSrv) {
    const btn = document.getElementById('btn-fetch-photos');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Getiriliyor\u2026'; }
    try {
      const r = await fetch('http://localhost:8765/api/place-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: c.name, city: c.city||'', lat: c.lat||null, lon: c.lon||null }),
        signal: AbortSignal.timeout(30000)
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      if (d.photos && d.photos.length > 0) {
        const updated = { ...c, photos: d.photos, updatedAt: new Date().toISOString() };
        await dbPut('companies', updated);
        if (gallery && strip) {
          strip.innerHTML = d.photos.map((src, i) =>
            '<img src="' + src + '" alt="Foto ' + (i+1) + '" ' +
            'style="height:120px;border-radius:6px;object-fit:cover;cursor:pointer;flex-shrink:0;" ' +
            'onclick="window.open(this.src)">'
          ).join('');
          gallery.style.display = '';
        }
        toast('\u2713 ' + d.photos.length + ' foto\u011fraf eklendi!', 'success');
        return;
      }
    } catch(e) {
      console.warn('[Photos]', e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-cloud-download me-1"></i>Google Maps\u0027tan Getir'; }
    }
  }

  // Sunucu yok veya fotograf bulunamadi: Google Maps embed + link goster
  if (!gallery || !strip) return;
  const q   = encodeURIComponent(c.name + (c.city ? ' ' + c.city : ''));
  const lat = c.lat || '';
  const lon = c.lon || '';
  const mapsUrl = lat && lon
    ? 'https://www.google.com/maps/search/' + q + '/@' + lat + ',' + lon + ',17z'
    : 'https://www.google.com/maps/search/' + q;
  const embedSrc = lat && lon
    ? 'https://maps.google.com/maps?q=' + lat + ',' + lon + '&z=17&output=embed'
    : 'https://maps.google.com/maps?q=' + q + '&output=embed';

  strip.innerHTML =
    '<div style="width:100%;">' +
    '<iframe src="' + embedSrc + '" width="100%" height="250" style="border:0;border-radius:8px;" ' +
    'allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>' +
    '<div class="mt-2 d-flex gap-2">' +
    '<a href="' + mapsUrl + '" target="_blank" class="btn btn-sm btn-outline-primary">' +
    '<i class="bi bi-map-fill me-1"></i>Google Maps\u0027ta Foto\u011fraflar\u0131 G\u00f6r</a>' +
    '</div></div>';
  gallery.style.display = '';
}

