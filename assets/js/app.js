'use strict';

/* ===================== DURUM ===================== */
let selectedCompIds = new Set();
let selectedContIds = new Set();
let charts = {};
let currentModalCompanyId = null;
let currentModalContactId = null;
let importFileData = [];
let importMapping = {};   // col → CRM field name
let importCols    = [];   // ordered list of Excel column names (for dropdown index lookup)
let importDuplicates = [];
let importPendingNonDupes = [];
let importPendingContacts = [];
let compSort = { field: 'name', asc: true };
let contSort = { field: 'createdAt', asc: false }; // default: newest first

/* ===================== BAŞLANGIÇ ===================== */
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  populateSelects();

  // ── Auth init — sadece email/şifre, Firebase config gizli ──
  let loggedIn = false;
  if (typeof authInit === 'function') {
    loggedIn = await authInit();
    if (!loggedIn) {
      authShowLogin('Devam etmek için giriş yapın.');
      return; // app will resume via _authOnSuccess → location.reload or inline init
    }
  }

  // ── Normal app startup ──────────────────────────────
  await _appStart();
});

async function _appStart() {
  // Update user display in sidebar
  if (typeof authEmail === 'function' && authEmail()) {
    const el = document.getElementById('auth-user-email');
    if (el) { el.textContent = authEmail(); el.closest('#auth-user-display').style.display = ''; }
  }

  try {
    await initDB();
    // Show home dashboard immediately
    showPage('home');
    // Pull data from Firestore if local is empty (new browser)
    if (typeof syncFromFirestore === 'function') await syncFromFirestore();
    // Start Fuarbot background sync so activities/quotes are always fresh
    if (typeof fbBackgroundSync === 'function') setTimeout(fbBackgroundSync, 1500);
    if (typeof _autoRegisterCurrentUser === 'function') setTimeout(_autoRegisterCurrentUser, 2000);
    // E-Mail / Rollen / Signatur initialisieren
    if (typeof emailInit === 'function') setTimeout(emailInit, 2500);
    // Performans verilerini arka planda önceden yükle
    if (typeof performansPreload === 'function') setTimeout(performansPreload, 4000);
    // Home-Daten vorausladen → Home-Dashboard erscheint sofort beim nächsten Klick
    if (typeof homePreload === 'function') setTimeout(() => homePreload(loadFbConfig()), 3000);
  } catch (err) {
    console.error('Başlangıç hatası:', err);
    toast('Veritabanı başlatılamadı: ' + err.message + ' — Tarayıcı izinlerini kontrol edin.', 'error');
  }
}

/* ===================== NAVİGASYON ===================== */
function showPage(name) {
  // 1. Sayfaları gizle / göster
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById(name);
  if (pg) { pg.classList.add('active'); } else { console.warn('showPage: bilinmeyen sayfa =', name); return; }

  // 2. Nav aktif durumu
  document.querySelectorAll('[data-page]').forEach(a => a.classList.remove('active'));
  const nav = document.querySelector(`[data-page="${name}"]`);
  if (nav) nav.classList.add('active');

  window.scrollTo(0, 0);

  // 3. Form sıfırla (form sayfaları için)
  if (name === 'add-company') {
    const f = document.getElementById('add-company-form'); if (f) f.reset();
    setTimeout(() => initAddressAutocomplete('ac-address','ac-city','ac-postcode','ac-country'), 100);
    return;
  }
  if (name === 'add-contact') {
    const f = document.getElementById('add-contact-form'); if (f) f.reset();
    refreshCompanyDatalist().catch(console.error);
    setTimeout(() => initAddressAutocomplete('act-address','act-city','act-postcode','act-country'), 100);
    return;
  }

  // Firestore-only pages — kein IndexedDB nötig, immer ausführen
  if (name === 'emails') { if (typeof loadEmailsPage === 'function') loadEmailsPage(); return; }
  if (name === 'home')           { if (typeof loadHome === 'function') loadHome(); return; }
  if (name === 'ayarlar') { loadAyarlar(); if(typeof signatureSettingsInit==='function') signatureSettingsInit(); if(typeof roleSettingsInit==='function') roleSettingsInit(); return; }
  if (name === 'fuarbot')        { loadFuarbotPage(); return; }
  if (name === 'fuar-dashboard') { loadFuarDashboard(); return; }
  if (name === 'fuar-users')     { loadFuarUsers(); return; }
  if (name === 'leads')          { loadLeads().catch(console.error); return; }
  if (name === 'teklifler')      { loadTeklifler(); return; }
  if (name === 'fatura')         { loadFatura(); return; }
  if (name === 'urunler')        { loadProducts(); return; }
  if (name === 'uretim')         { loadUretim(); return; }
  if (name === 'performans')     { if (typeof performansLoad === 'function') performansLoad(); return; }
  if (name === 'musteri-geo')   { if (typeof loadMusteriGeo === 'function') loadMusteriGeo(); return; }
  if (name === 'gorevler')      { if (typeof loadTasksPage  === 'function') loadTasksPage();  return; }

  // 4. IndexedDB-abhängige Seiten
  if (!db) { console.warn('showPage: DB henüz hazır değil, içerik yüklenemedi'); return; }

  if      (name === 'companies')  loadCompanies().catch(console.error);
  else if (name === 'contacts')   loadContacts().catch(console.error);
  else if (name === 'dashboard')  loadDashboard().catch(console.error);
  else if (name === 'import')     loadImportHistory().catch(console.error);
  else if (name === 'reports')    loadReports().catch(console.error);
  else if (name === 'duplicates') loadDuplicates().catch(console.error);
  else if (name === 'teklifler')      loadTeklifler();
  else if (name === 'fatura')         loadFatura();
  else if (name === 'urunler')        loadProducts();
  else if (name === 'uretim')         loadUretim();
}

function setupEventListeners() {
  // Nav tıklama — inline onclick zaten var, bu ikinci güvence katmanı
  document.querySelectorAll('[data-page]').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); showPage(a.getAttribute('data-page')); });
  });
  // Arama & filtre — null-safe
  const bind = (id, event, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(event, fn); };
  bind('company-search',         'input',  debounce(loadCompanies, 280));
  bind('company-city-filter',    'change', loadCompanies);
  bind('company-sector-filter',  'change', loadCompanies);
  bind('contact-search',         'input',  debounce(loadContacts, 280));
  bind('contact-company-filter', 'change', loadContacts);
  bind('contact-status-filter',  'change', loadContacts);
  bind('contact-date-filter',    'change', loadContacts);
  bind('contact-creator-filter', 'change', loadContacts);
}

function populateSelects() {
  const sectorEls = ['ac-sector','ec-sector','company-sector-filter'];
  sectorEls.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isFilter = id === 'company-sector-filter';
    if (!isFilter) el.innerHTML = '<option value="">Seçin…</option>';
    Object.keys(SECTOR_KEYWORDS).forEach(s => {
      const o = document.createElement('option');
      o.value = s; o.textContent = s;
      el.appendChild(o);
    });
  });
  // Şehir filtresi
  const cityEl = document.getElementById('company-city-filter');
  if (cityEl) {
    [...new Set(Object.values(CITIES))].sort().forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      cityEl.appendChild(o);
    });
  }
}

function clearContactFilters() {
  document.getElementById('contact-search').value = '';
  document.getElementById('contact-company-filter').value = '';
  document.getElementById('contact-status-filter').value = '';
  const dtEl = document.getElementById('contact-date-filter');
  if (dtEl) dtEl.value = '';
  const crEl = document.getElementById('contact-creator-filter');
  if (crEl) crEl.value = '';
  loadContacts();
}

// ── Util: escape HTML ─────────────────────────────────────────────
function esc(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

/* ===================== RAPORLAR ===================== */
async function loadReports() {
  const [cos, cons] = await Promise.all([dbAll('companies'), dbAll('contacts')]);

  const sc = {};
  cos.forEach(c => { if (c.sector) sc[c.sector] = (sc[c.sector]||0)+1; });
  document.getElementById('report-sector-table').innerHTML =
    Object.entries(sc).sort((a,b)=>b[1]-a[1]).map(([k,v]) =>
      `<tr><td>${esc(k)}</td><td class="text-end">${v}</td></tr>`).join('') || '<tr><td colspan="2" class="text-muted">Veri yok</td></tr>';

  const cc = {};
  cos.forEach(c => { if (c.city) cc[c.city] = (cc[c.city]||0)+1; });
  document.getElementById('report-city-table').innerHTML =
    Object.entries(cc).sort((a,b)=>b[1]-a[1]).map(([k,v]) =>
      `<tr><td>${esc(k)}</td><td class="text-end">${v}</td></tr>`).join('') || '<tr><td colspan="2" class="text-muted">Veri yok</td></tr>';

  const hc = cos.filter(c=>(c.qualityScore||0)>=80).length;
  const mc = cos.filter(c=>(c.qualityScore||0)>=50&&(c.qualityScore||0)<80).length;
  const lc = cos.filter(c=>(c.qualityScore||0)<50).length;
  const hct = cons.filter(c=>(c.qualityScore||0)>=80).length;
  const mct = cons.filter(c=>(c.qualityScore||0)>=50&&(c.qualityScore||0)<80).length;
  const lct = cons.filter(c=>(c.qualityScore||0)<50).length;
  document.getElementById('report-quality-table').innerHTML =
    `<tr><td>🟢 Yüksek (80+)</td><td class="text-end">${hc}</td><td class="text-end">${hct}</td></tr>
     <tr><td>🟡 Orta (50-79)</td><td class="text-end">${mc}</td><td class="text-end">${mct}</td></tr>
     <tr><td>🔴 Düşük (&lt;50)</td><td class="text-end">${lc}</td><td class="text-end">${lct}</td></tr>`;
}

/* ===================== TEKRAR KAYITLAR ===================== */
async function loadDuplicates() {
  const [cos, cons] = await Promise.all([dbAll('companies'), dbAll('contacts')]);

  // Firma adı tekrarları
  const cbn = {};
  cos.forEach(c => { const k = trLow(c.name||''); if (!cbn[k]) cbn[k]=[]; cbn[k].push(c); });
  const dcGroups = Object.values(cbn).filter(g => g.length > 1);
  const cdEl = document.getElementById('duplicate-companies');
  if (!dcGroups.length) {
    cdEl.innerHTML = '<p class="text-muted small">Tekrar eden firma adı bulunamadı.</p>';
  } else {
    cdEl.innerHTML = '';
    dcGroups.forEach(g => {
      const d = document.createElement('div');
      d.className = 'dup-group';
      d.innerHTML = `<strong>${esc(g[0].name)}</strong> <span class="badge bg-danger ms-1">${g.length} kayıt</span><br>` +
        g.map(c => `<small class="text-muted">#${c.id} — ${c.city||'-'} · ${c.phone||'-'}</small>`).join('<br>');
      cdEl.appendChild(d);
    });
  }

  // Telefon tekrarları
  const cbp = {};
  cons.forEach(c => { if (c.phone) { if (!cbp[c.phone]) cbp[c.phone]=[]; cbp[c.phone].push(c); } });
  const dcGroups2 = Object.values(cbp).filter(g => g.length > 1);
  const cd2El = document.getElementById('duplicate-contacts');
  if (!dcGroups2.length) {
    cd2El.innerHTML = '<p class="text-muted small">Tekrar eden telefon numarası bulunamadı.</p>';
  } else {
    cd2El.innerHTML = '';
    dcGroups2.forEach(g => {
      const d = document.createElement('div');
      d.className = 'dup-group';
      d.innerHTML = `<strong>${esc(g[0].phone)}</strong> <span class="badge bg-danger ms-1">${g.length} kayıt</span><br>` +
        g.map(c => `<small class="text-muted">#${c.id} — ${esc(c.name||'-')}</small>`).join('<br>');
      cd2El.appendChild(d);
    });
  }
}

/* ===================== CSV İNDİR ===================== */
async function exportCSV() {
  const [cos, cons] = await Promise.all([dbAll('companies'), dbAll('contacts')]);
  const which = confirm('Firmaları mı (Tamam) yoksa Kişileri mi (İptal) indirmek istiyorsunuz?');
  if (which) {
    const h = ['Firma Adı','Sektör','Telefon','E-posta','Website','Vergi No','Adres','Şehir','İlçe','Enlem','Boylam','Kalite %','Oluşturma'];
    const r = cos.map(c => [c.name,c.sector||'',c.phone||'',c.email||'',c.website||'',c.taxNumber||'',c.address||'',c.city||'',c.district||'',c.lat||'',c.lon||'',c.qualityScore||0,c.createdAt||'']);
    downloadCSV(h, r, 'firmalar.csv');
  } else {
    const compMap = new Map(cos.map(c => [c.id, c]));
    const h = ['Ad Soyad','Unvan','Telefon','E-posta','Firma','Durum','Kalite %'];
    const r = cons.map(c => {
      const co = compMap.get(c.companyId);
      return [c.name,c.title||'',c.phone||'',c.email||'',co?co.name:'',c.status||'',c.qualityScore||0];
    });
    downloadCSV(h, r, 'kisiler.csv');
  }
}

function downloadCSV(headers, rows, filename) {
  const bom = '\uFEFF';
  const csv = bom + [
    headers.map(h => `"${h}"`).join(','),
    ...rows.map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','))
  ].join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
