// Split from app.js — Pure helper functions and constants

/* ===================== YARDIMCILAR ===================== */
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; }

function trLow(s) {
  return String(s||'')
    .replace(/İ/g,'i').replace(/I/g,'ı').replace(/Ğ/g,'ğ')
    .replace(/Ş/g,'ş').replace(/Ç/g,'ç').replace(/Ö/g,'ö').replace(/Ü/g,'ü')
    .toLowerCase();
}

function normalizePhone(phone) {
  const p = String(phone||'').replace(/\D/g,'');
  if (!p) return {valid:false,normalized:'',type:'',error:'Boş'};
  let num = p.startsWith('90') ? p.substring(2) : p;
  if (num.startsWith('0')) num = num.substring(1);
  if (num.length !== 10) return {valid:false,normalized:'',type:'',error:'Yanlış uzunluk'};
  const prefix = num.substring(0,3);
  const type = ['530','531','532','533','534','535','536','537','538','539'].includes(prefix) ? 'Turkcell'
    : ['540','541','542','543','544','545','546','547','548','549'].includes(prefix) ? 'Vodafone'
    : ['550','551','552','553','554','555','556','501','502','503','504','505'].includes(prefix) ? 'Türk Telekom'
    : 'Diğer';
  return {valid:true, normalized:'+90'+num, type, error:null};
}

function normalizeCity(raw) {
  if (!raw) return null;
  const k = trLow(String(raw).trim());
  return CITIES[k] || (Object.values(CITIES).find(v => trLow(v)===k)) || String(raw).trim();
}

// Excel standart kolon desteği (alias'lar)
const STANDARD_FIELD_ALIASES = {
  // ── Firma ──────────────────────────────────────────────────────────────────
  'Firma':         ['Business', 'Firma', 'Firma Adı', 'Firma Adi', 'Şirket', 'Sirket',
                    'Cari', 'Cari Ünvan', 'Cari Ünvanı', 'Ünvan', 'Unvan', 'Company', 'Name'],
  // ── İletişim ────────────────────────────────────────────────────────────────
  'Telefon':       ['Phone', 'Telefon', 'Tel', 'GSM', 'GSM No', 'Cep', 'Cep Telefonu', 'Mobile'],
  'E-posta':       ['Email', 'E-posta', 'Eposta', 'E Mail', 'E-mail', 'Mail'],
  'Website':       ['Website', 'Web', 'Web Site', 'Websitesi', 'URL', 'Site'],
  'Faks':          ['Faks', 'Fax', 'Faks No', 'Fax No', 'Faks Numarası'],
  // ── Konum ───────────────────────────────────────────────────────────────────
  'Adres':         ['Street', 'Adres', 'Address', 'Sokak', 'Cadde'],
  'Şehir':         ['City', 'Şehir', 'Sehir', 'İl', 'Il'],
  'İlçe':          ['İlçe', 'Ilçe', 'Ilce', 'District'],
  'State':         ['State', 'Province', 'Eyalet', 'İl/Eyalet', 'Region'],
  'Posta Kodu':    ['Postcode', 'Postal Code', 'Zip', 'Zip Code', 'Posta Kodu', 'PostaKodu'],
  'Ülke':          ['Country', 'Ülke', 'Ulke'],
  'Enlem':         ['Lat', 'Enlem', 'Latitude'],
  'Boylam':        ['Lng', 'Boylam', 'Lon', 'Longitude'],
  // ── İş Bilgileri ────────────────────────────────────────────────────────────
  'Sektör':        ['Categories', 'Category', 'Sektör', 'Sektor', 'Sector', 'Kategori'],
  'Açıklama':      ['Description', 'Açıklama', 'About', 'Hakkında', 'Aciklama'],
  'Çalışan':       ['Employees', 'Çalışan', 'Calisan', 'Personel', 'Personel Sayısı', 'Employee Count'],
  'Ciro':          ['Revenue', 'Ciro', 'Gelir', 'Yıllık Ciro', 'Turnover'],
  'Vergi No':      ['Vergi No', 'Vergi Numarası', 'Vergi Numarasi', 'VKN', 'TCKN', 'TC No', 'Vergi/TC', 'Tax'],
  'Vergi Dairesi': ['Vergi Dairesi', 'V. Dairesi', 'Vergi Dai.', 'VergiDairesi'],
  'SIC':           ['Sic', 'SIC', 'SIC Kodu', 'SIC Code'],
  'NAICS':         ['Naics', 'NAICS', 'NAICS Code'],
  // ── Sosyal Medya ────────────────────────────────────────────────────────────
  'LinkedIn':      ['Linkedin', 'LinkedIn', 'LinkedIn URL'],
  'Facebook':      ['Facebook', 'Facebook URL', 'FB'],
  'Instagram':     ['Instagram', 'Instagram URL', 'IG'],
  'Twitter':       ['X', 'Twitter', 'Twitter URL', 'Tweet'],
  'YouTube':       ['Youtube', 'YouTube', 'YouTube URL'],
  // ── Notlar ──────────────────────────────────────────────────────────────────
  'Notlar':        ['Notlar', 'Not', 'Notes', 'Notlar/Açıklama'],
  // ── Kişi kolonları ──────────────────────────────────────────────────────────
  'Adı':           ['Contact First Name', 'First Name', 'Adı', 'Adi', 'Ad Soyad',
                    'İsim', 'Isim', 'Yetkili', 'Yetkili Adı', 'Yetkili Ad Soyad', 'Yetkili Kişi'],
  'Soyadı':        ['Contact Last Name',  'Last Name',  'Soyadı', 'Soyad', 'Yetkili Soyadı'],
  'Unvan':         ['Contact Role', 'Role', 'Unvan', 'Pozisyon', 'Görev', 'Gorev', 'Title', 'Yetkili Unvanı'],
  'Kişi E-posta':  ['Contact Email', 'Yetkili E-posta', 'İletişim E-posta'],
  'Durum':         ['Durum', 'Status']
};

function buildHeaderIndexMap(headers) {
  const map = {};
  (headers || []).forEach(h => { map[trLow(String(h).trim())] = String(h); });
  return map;
}

function _normHeaderForFuzzy(h) {
  return trLow(String(h || ''))
    .replace(/[\(\)\[\]\{\}\-_.:;,#/\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function _bestFuzzyHeader(headers, includeTerms, excludeTerms) {
  const hs = (headers || []).map(h => ({ raw: String(h), n: _normHeaderForFuzzy(h) }));
  let best = null;
  for (const h of hs) {
    if (!h.n) continue;
    if (excludeTerms && excludeTerms.some(t => h.n.includes(t))) continue;
    const score = includeTerms.reduce((s, t) => s + (h.n.includes(t) ? 1 : 0), 0);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { raw: h.raw, score };
  }
  return best ? best.raw : null;
}

function buildStandardFieldAccessor(headers) {
  const headerMap = buildHeaderIndexMap(headers);
  const fieldToCol = {};
  for (const [field, aliases] of Object.entries(STANDARD_FIELD_ALIASES)) {
    for (const a of aliases) {
      const key = trLow(a);
      if (headerMap[key]) { fieldToCol[field] = headerMap[key]; break; }
    }
  }
  // Fuzzy fallback: başlıklar aynı ama küçük varyasyonlu olabiliyor
  if (!fieldToCol['Firma']) {
    fieldToCol['Firma'] = _bestFuzzyHeader(
      headers,
      ['firma', 'cari', 'unvan', 'ünvan', 'sirket', 'şirket'],
      ['telefon', 'tel', 'gsm', 'mail', 'email', 'e posta', 'vergi', 'vkn', 'tc', 'adres', 'ilce', 'ilçe', 'sehir', 'şehir', 'website', 'web']
    );
  }
  if (!fieldToCol['Vergi No']) {
    fieldToCol['Vergi No'] = _bestFuzzyHeader(headers, ['vergi', 'vkn', 'tckn', 'tc'], ['adres', 'ilce', 'ilçe', 'sehir', 'şehir']);
  }
  if (!fieldToCol['Telefon']) {
    fieldToCol['Telefon'] = _bestFuzzyHeader(headers, ['telefon', 'tel', 'gsm', 'phone'], ['firma', 'cari', 'unvan', 'ünvan']);
  }
  if (!fieldToCol['E-posta']) {
    fieldToCol['E-posta'] = _bestFuzzyHeader(headers, ['email', 'e mail', 'e posta', 'mail'], null);
  }
  if (!fieldToCol['Website']) {
    fieldToCol['Website'] = _bestFuzzyHeader(headers, ['website', 'web', 'url', 'site'], null);
  }
  if (!fieldToCol['Adres']) {
    fieldToCol['Adres'] = _bestFuzzyHeader(headers, ['adres', 'address'], null);
  }
  if (!fieldToCol['Şehir']) {
    fieldToCol['Şehir'] = _bestFuzzyHeader(headers, ['şehir', 'sehir', 'il', 'city'], ['ilce', 'ilçe']);
  }
  if (!fieldToCol['İlçe']) {
    fieldToCol['İlçe'] = _bestFuzzyHeader(headers, ['ilçe', 'ilce', 'district'], ['şehir', 'sehir']);
  }
  if (!fieldToCol['Sektör']) {
    fieldToCol['Sektör'] = _bestFuzzyHeader(headers, ['sekt', 'sector'], null);
  }
  if (!fieldToCol['Notlar']) {
    fieldToCol['Notlar'] = _bestFuzzyHeader(headers, ['not', 'açıklama', 'aciklama', 'notes'], ['vergi']);
  }
  if (!fieldToCol['Faks']) {
    fieldToCol['Faks'] = _bestFuzzyHeader(headers, ['faks', 'fax'], null);
  }
  if (!fieldToCol['Vergi Dairesi']) {
    fieldToCol['Vergi Dairesi'] = _bestFuzzyHeader(headers, ['vergi dairesi', 'v dairesi', 'vergi dai'], ['vergi no', 'vkn']);
  }
  if (!fieldToCol['State']) {
    fieldToCol['State'] = _bestFuzzyHeader(headers, ['state', 'province', 'eyalet', 'region'], ['status', 'durum']);
  }
  if (!fieldToCol['Posta Kodu']) {
    fieldToCol['Posta Kodu'] = _bestFuzzyHeader(headers, ['posta kodu', 'postcode', 'postal', 'zip'], null);
  }
  if (!fieldToCol['Ülke']) {
    fieldToCol['Ülke'] = _bestFuzzyHeader(headers, ['ülke', 'ulke', 'country'], null);
  }
  if (!fieldToCol['Açıklama']) {
    fieldToCol['Açıklama'] = _bestFuzzyHeader(headers, ['description', 'açıklama', 'about', 'hakkında'], ['vergi']);
  }
  if (!fieldToCol['Çalışan']) {
    fieldToCol['Çalışan'] = _bestFuzzyHeader(headers, ['employee', 'çalışan', 'calisan', 'personel'], null);
  }
  if (!fieldToCol['Ciro']) {
    fieldToCol['Ciro'] = _bestFuzzyHeader(headers, ['revenue', 'ciro', 'gelir', 'turnover'], null);
  }
  if (!fieldToCol['SIC']) {
    fieldToCol['SIC'] = _bestFuzzyHeader(headers, ['sic'], null);
  }
  if (!fieldToCol['NAICS']) {
    fieldToCol['NAICS'] = _bestFuzzyHeader(headers, ['naics'], null);
  }
  if (!fieldToCol['LinkedIn']) {
    fieldToCol['LinkedIn'] = _bestFuzzyHeader(headers, ['linkedin'], null);
  }
  if (!fieldToCol['Facebook']) {
    fieldToCol['Facebook'] = _bestFuzzyHeader(headers, ['facebook', ' fb '], null);
  }
  if (!fieldToCol['Instagram']) {
    fieldToCol['Instagram'] = _bestFuzzyHeader(headers, ['instagram', ' ig '], null);
  }
  if (!fieldToCol['Twitter']) {
    fieldToCol['Twitter'] = _bestFuzzyHeader(headers, ['twitter', ' x '], null);
  }
  if (!fieldToCol['YouTube']) {
    fieldToCol['YouTube'] = _bestFuzzyHeader(headers, ['youtube'], null);
  }
  if (!fieldToCol['Soyadı']) {
    fieldToCol['Soyadı'] = _bestFuzzyHeader(headers, ['last name', 'soyad', 'yetkili soyadı'], null);
  }
  if (!fieldToCol['Kişi E-posta']) {
    fieldToCol['Kişi E-posta'] = _bestFuzzyHeader(headers, ['contact email', 'yetkili e-posta', 'kişi e-posta'], null);
  }

  const getField = (row, field) => {
    const col = fieldToCol[field];
    if (!col) return null;
    const v = row[col];
    return (v !== undefined && v !== null && v !== '') ? String(v).trim() : null;
  };
  return { fieldToCol, getField };
}

function companyDupKeyFromRow(row, getField) {
  const name = getField(row, 'Firma');
  const tax  = getField(row, 'Vergi No');
  return {
    name: name ? trLow(name) : null,
    tax:  tax  ? String(tax).replace(/\s+/g,'') : null
  };
}

function calculateCompanyQuality(c) {
  let s = 0;
  if (c.name)       s += 20;
  if (c.city)       s += 15;
  if (c.sector)     s += 10;
  if (c.address)    s += 10;
  if (c.phoneValid) s += 10;
  if (c.email)      s += 10;
  if (c.website)    s += 8;
  if (c.lat && c.lon) s += 7;
  if (c.linkedin || c.facebook || c.instagram || c.twitter || c.youtube) s += 5;
  if (c.description) s += 3;
  if (c.taxNumber)   s += 2;
  return Math.min(s, 100);
}

function calculateContactQuality(c) {
  let s = 0;
  if (c.name)                s += 30;
  if (c.phone || c.phoneValid) s += 30;
  if (c.email)               s += 20;
  if (c.companyId)           s += 15;
  if (c.title)               s += 5;
  return Math.min(s, 100);
}

function parseAddressForLocation(a) {
  if (!a) return {city:null, district:null};
  const l = trLow(a);
  let city = null, district = null;
  for (const [k,v] of Object.entries(DISTRICTS)) {
    if (l.includes(k)) { city = v; district = DISTRICT_NAMES[k] || k; break; }
  }
  for (const [k,v] of Object.entries(CITIES)) {
    if (l.includes(k)) { if (!city) city = v; break; }
  }
  return {city, district};
}

function detectSector(name, notes) {
  const txt = trLow((name||'') + ' ' + (notes||''));
  let best = null, score = 0;
  for (const [sect, kws] of Object.entries(SECTOR_KEYWORDS)) {
    const s = kws.filter(k => txt.includes(k)).length;
    if (s > score) { score = s; best = sect; }
  }
  return score > 0 ? best : null;
}

function qualityClass(q) { return q >= 80 ? 'high' : q >= 50 ? 'mid' : 'low'; }
function qualityBadgeClass(q) { return q >= 80 ? 'bg-success' : q >= 50 ? 'bg-warning text-dark' : 'bg-danger'; }

function phoneLink(phone, normalized) {
  if (!phone) return '-';
  const href = normalized || phone;
  return `<a href="tel:${href}" class="phone-link">${phone}</a>`;
}
function emailLink(email) {
  if (!email) return '-';
  return `<a href="mailto:${email}">${email}</a>`;
}
function websiteLink(url) {
  if (!url) return '-';
  const href = url.startsWith('http') ? url : 'https://' + url;
  return `<a href="${href}" target="_blank" rel="noopener">${url}</a>`;
}

function toast(msg, type='success') {
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = `toast-item ${type}`;
  el.innerHTML = `<i class="bi bi-${type==='success'?'check-circle-fill text-success':type==='error'?'x-circle-fill text-danger':'info-circle-fill text-primary'} me-2"></i>${msg}`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function showLoading(msg='Yükleniyor…') {
  document.getElementById('loading-text').textContent = msg;
  document.getElementById('loading-overlay').classList.add('show');
}
function hideLoading() { document.getElementById('loading-overlay').classList.remove('show'); }
