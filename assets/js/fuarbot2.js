// fuarbot.js — Fuarbot Firebase sync (Firestore REST API, no SDK)
// Collections: crm_customers | crm_activities | crm_quotes

const FB_CFG_KEY = 'crm_fuarbot_firebase_config';
let fbPollInterval = null;
let fbCustomers    = [];
let fbActivities   = {};
let fbQuotes       = {};
let fbSelectedId   = null;
let fbMainTabActive = 'contacts'; // 'contacts' | 'quotes'

// ── Config ────────────────────────────────────────────────
function loadFbConfig() {
  try { return JSON.parse(localStorage.getItem(FB_CFG_KEY) || 'null'); } catch { return null; }
}
function saveFbConfig(cfg) { localStorage.setItem(FB_CFG_KEY, JSON.stringify(cfg)); }

function showFbConfig() {
  document.getElementById('fb-config-panel').style.display = '';
  document.getElementById('fb-tabs-wrapper').style.display = 'none';
  const cfg = loadFbConfig();
  if (cfg) {
    const s = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    s('fb-api-key', cfg.apiKey); s('fb-project-id', cfg.projectId); s('fb-auth-domain', cfg.authDomain);
  }
}

function connectFuarbot() {
  const g = id => (document.getElementById(id)?.value || '').trim();
  const apiKey = g('fb-api-key'), projectId = g('fb-project-id');
  const errEl = document.getElementById('fb-connect-error');
  if (!apiKey || !projectId) { errEl.style.display = ''; errEl.textContent = 'API Key ve Project ID zorunludur!'; return; }
  errEl.style.display = 'none';
  saveFbConfig({ apiKey, projectId, authDomain: g('fb-auth-domain') || projectId + '.firebaseapp.com' });
  startFuarbotSync(apiKey, projectId);
}

// ── Firestore REST helpers ────────────────────────────────
function fsVal(v) {
  if (!v) return null;
  if (v.stringValue   !== undefined) return v.stringValue;
  if (v.integerValue  !== undefined) return parseInt(v.integerValue, 10);
  if (v.doubleValue   !== undefined) return v.doubleValue;
  if (v.booleanValue  !== undefined) return v.booleanValue;
  if (v.timestampValue!== undefined) return v.timestampValue;
  if (v.nullValue     !== undefined) return null;
  if (v.arrayValue)  return (v.arrayValue.values || []).map(fsVal);
  if (v.mapValue)    return fsFields(v.mapValue.fields || {});
  return null;
}
function fsFields(f) { const o = {}; for (const [k,v] of Object.entries(f||{})) o[k]=fsVal(v); return o; }
function fsDoc(d)    { return { _id: d.name.split('/').pop(), ...fsFields(d.fields||{}) }; }

async function fsFetch(apiKey, projectId, col) {
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  let docs = [], token = '';
  do {
    const url = `${base}/${col}?key=${apiKey}&pageSize=300${token ? '&pageToken='+token : ''}`;
    const res = await fetch(url);
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message||'HTTP '+res.status); }
    const data = await res.json();
    docs = docs.concat((data.documents||[]).map(fsDoc));
    token = data.nextPageToken || '';
  } while (token);
  return docs;
}

// ── Data sync ─────────────────────────────────────────────
function setFbStatus(text, type) {
  const el = document.getElementById('fb-status-badge');
  if (el) { el.className = 'badge bg-' + (type||'secondary'); el.textContent = text; }
  const b = document.getElementById('fuarbot-badge');
  if (b) { b.style.display = (type==='success' && fbCustomers.length) ? '' : 'none'; if (fbCustomers.length) b.textContent = fbCustomers.length; }
}

async function fetchAllData(apiKey, projectId, silent) {
  try {
    const [rawCustomers, activities, quotes] = await Promise.all([
      fsFetch(apiKey, projectId, 'crm_customers'),
      fsFetch(apiKey, projectId, 'crm_activities').catch(()=>[]),
      fsFetch(apiKey, projectId, 'crm_quotes').catch(()=>[]),
    ]);

    // ── Deduplicate crm_customers by name + email ──────────
    // Same person may have been scanned multiple times at the fair.
    // Keep the record with the most filled-in fields.
    const seen = new Map();
    rawCustomers.forEach(c => {
      const key = [
        (c.name  || '').trim().toLowerCase(),
        (c.email || '').trim().toLowerCase(),
      ].join('|');
      if (!seen.has(key)) {
        seen.set(key, c);
      } else {
        const prev  = seen.get(key);
        const score = o => Object.values(o).filter(v => v !== null && v !== '' && v !== undefined).length;
        if (score(c) > score(prev)) seen.set(key, c);
      }
    });
    fbCustomers = [...seen.values()];
    fbActivities = {};
    activities.forEach(a => { const k = a.parentId||a.contactId||''; (fbActivities[k]||(fbActivities[k]=[])).push(a); });
    Object.values(fbActivities).forEach(arr => arr.sort((a,b) => (b.createdAt||'') > (a.createdAt||'') ? 1 : -1));
    fbQuotes = {};
    quotes.forEach(q => { const k = q.contactId||''; (fbQuotes[k]||(fbQuotes[k]=[])).push(q); });
    Object.values(fbQuotes).forEach(arr => arr.sort((a,b) => (b.createdAt||'') > (a.createdAt||'') ? 1 : -1));

    setFbStatus('Bağlı · ' + fbCustomers.length + ' kişi', 'success');
    document.getElementById('fb-config-panel').style.display = 'none';
    document.getElementById('fb-tabs-wrapper').style.display = '';
    const syncEl = document.getElementById('fb-last-sync');
    if (syncEl) syncEl.textContent = new Date().toLocaleTimeString('tr-TR');

    // Update quotes badge
    const totalQ = Object.values(fbQuotes).reduce((s,a)=>s+a.length, 0);
    const qBadge = document.getElementById('fb-maintab-quotes-badge');
    if (qBadge) { qBadge.textContent = totalQ; qBadge.style.display = totalQ ? '' : 'none'; }

    if (!silent) {
      if (fbMainTabActive === 'contacts') { renderCustomerList(fbCustomers); if (fbSelectedId) showDetail(fbSelectedId); }
      else if (fbMainTabActive === 'quotes') { renderAllQuotesView(); }
    }
  } catch (e) {
    setFbStatus((e.message.includes('PERMISSION')||e.message.includes('403')) ? 'Erişim reddedildi — Firebase kurallarını kontrol edin' : 'Hata: ' + e.message, 'danger');
  }
}

function fbManualRefresh() {
  const cfg = loadFbConfig();
  if (cfg?.apiKey && cfg?.projectId) fetchAllData(cfg.apiKey, cfg.projectId, false);
}

function startFuarbotSync(apiKey, projectId) {
  setFbStatus('Bağlanıyor…', 'warning');
  if (fbPollInterval) clearInterval(fbPollInterval);
  fetchAllData(apiKey, projectId, false);
  fbPollInterval = setInterval(() => fetchAllData(apiKey, projectId, true), 12 * 60 * 60 * 1000); // 12h
}

// ── Main tab switching ────────────────────────────────────
function fbSwitchMainTab(tab) {
  fbMainTabActive = tab;
  ['contacts','quotes'].forEach(t => {
    document.getElementById('fb-maintab-' + t)?.classList.toggle('active', t === tab);
    const pane = document.getElementById('fb-pane-' + t);
    if (pane) pane.style.display = t === tab ? '' : 'none';
  });
  if (tab === 'quotes') renderAllQuotesView();
  if (tab === 'contacts') renderCustomerList(fbCustomers);
}

// ── Render helpers ────────────────────────────────────────
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function fbFilterList() {
  const q = (document.getElementById('fb-search')?.value||'').toLowerCase();
  renderCustomerList(q ? fbCustomers.filter(c =>
    (c.name||'').toLowerCase().includes(q)||(c.company||'').toLowerCase().includes(q)||
    (c.email||'').toLowerCase().includes(q)||(c.source||'').toLowerCase().includes(q)) : fbCustomers);
}

function renderCustomerList(list) {
  const el = document.getElementById('fb-customer-list');
  const cEl = document.getElementById('fb-count-label');
  if (cEl) cEl.textContent = list.length + ' kişi';
  if (!el) return;
  if (!list.length) { el.innerHTML = '<div class="p-3 text-muted text-center small">Bulunamadı</div>'; return; }
  el.innerHTML = list.map(c => {
    const qn = (fbQuotes[c._id]||[]).length, an = (fbActivities[c._id]||[]).length;
    return `<div class="fb-card${c._id===fbSelectedId?' active':''}" onclick="showDetail('${esc(c._id)}')">
      <div class="fb-card-name">${esc(c.name||'—')}</div>
      <div class="fb-card-sub">${esc(c.company||'')}${c.position?' · '+esc(c.position):''}</div>
      <div class="d-flex gap-1 mt-1 flex-wrap">
        <span class="badge bg-info text-dark fb-card-badge">${esc(c.source||'Fuarbot')}</span>
        ${qn?`<span class="badge bg-warning text-dark fb-card-badge">${qn} teklif</span>`:''}
        ${an?`<span class="badge bg-light text-dark border fb-card-badge">${an} aktivite</span>`:''}
      </div>
    </div>`;
  }).join('');
}

// ── Detail pane ───────────────────────────────────────────
function showDetail(id) {
  fbSelectedId = id;
  document.querySelectorAll('.fb-card').forEach(el =>
    el.classList.toggle('active', el.getAttribute('onclick')?.includes(`'${id}'`)));
  const c = fbCustomers.find(x => x._id === id);
  if (!c) return;
  const quotes = fbQuotes[id]||[], acts = fbActivities[id]||[];
  const phone = c.phone || c.mobile || '';
  document.getElementById('fb-detail').innerHTML = `
    <div class="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
      <div><h4 class="mb-0">${esc(c.name||'—')}</h4>${c.position?`<div class="text-muted">${esc(c.position)}</div>`:''}</div>
      <button class="btn btn-sm btn-success" onclick="importFuarbotContact('${esc(id)}')"><i class="bi bi-cloud-download me-1"></i>CRM'e Aktar</button>
    </div>
    <div class="card mb-3"><div class="card-body py-2 px-3" style="font-size:13px;">
      ${c.company ?`<div class="mb-1"><i class="bi bi-building me-2 text-primary"></i>${esc(c.company)}</div>`:''}
      ${phone     ?`<div class="mb-1"><i class="bi bi-telephone me-2 text-primary"></i><a href="tel:${esc(phone)}">${esc(phone)}</a></div>`:''}
      ${c.email   ?`<div class="mb-1"><i class="bi bi-envelope me-2 text-primary"></i><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>`:''}
      ${c.website ?`<div class="mb-1"><i class="bi bi-globe me-2 text-primary"></i>${esc(c.website)}</div>`:''}
      ${c.address ?`<div class="mb-1"><i class="bi bi-geo-alt me-2 text-primary"></i>${esc(c.address)}</div>`:''}
      ${c.notes   ?`<div class="mt-2 text-muted border-top pt-2">${esc(c.notes)}</div>`:''}
    </div></div>
    <ul class="nav nav-tabs mb-3">
      <li class="nav-item"><a class="nav-link active" onclick="fbTab('quotes','${id}');return false;" id="fb-tab-quotes-${id}" href="#">
        <i class="bi bi-file-earmark-text me-1"></i>Teklifler${quotes.length?`<span class="badge bg-warning text-dark ms-1">${quotes.length}</span>`:''}
      </a></li>
      <li class="nav-item"><a class="nav-link" onclick="fbTab('timeline','${id}');return false;" id="fb-tab-timeline-${id}" href="#">
        <i class="bi bi-clock-history me-1"></i>Zaman Tüneli${acts.length?`<span class="badge bg-secondary ms-1">${acts.length}</span>`:''}
      </a></li>
    </ul>
    <div id="fb-panel-quotes-${id}">${renderQuotes(quotes)}</div>
    <div id="fb-panel-timeline-${id}" style="display:none;">${renderTimeline(acts)}</div>`;
}

function fbTab(tab, id) {
  ['quotes','timeline'].forEach(t => {
    document.getElementById(`fb-panel-${t}-${id}`).style.display = t===tab ? '' : 'none';
    document.getElementById(`fb-tab-${t}-${id}`).classList.toggle('active', t===tab);
  });
}

// ── Quote rendering ───────────────────────────────────────
const SYM = { USD:'$', EUR:'€', TRY:'₺', GBP:'£' };

function renderQuotes(quotes) {
  if (!quotes.length) return '<div class="text-muted small text-center py-3">Henüz teklif yok</div>';
  return quotes.map(q => renderQuoteCard(q)).join('');
}

function renderQuoteCard(q, showContact) {
  const s = SYM[q.currency]||q.currency||'€';
  const total = q.totalNet != null ? Number(q.totalNet).toLocaleString('tr-TR',{minimumFractionDigits:2}) : '—';
  const date  = q.createdAt ? new Date(q.createdAt).toLocaleDateString('tr-TR') : '';
  const sentAt = q.sentAt ? new Date(q.sentAt).toLocaleDateString('tr-TR') : null;
  const badge = q.status==='sent'
    ? `<span class="badge bg-success ms-1">Gönderildi${sentAt?' · '+sentAt:''}</span>`
    : '<span class="badge bg-secondary ms-1">Taslak</span>';
  const lines = (q.lines||[]).map(l =>
    `<div class="fb-quote-line"><span>${esc(l.product||'')}</span><span>${l.qty} × ${Number(l.unitPrice||0).toLocaleString('tr-TR',{minimumFractionDigits:2})} ${s}</span></div>`
  ).join('');
  const contactInfo = showContact && q.contactId ? (() => {
    const c = fbCustomers.find(x => x._id === q.contactId);
    return c ? `<div class="fb-quote-contact" onclick="showDetail('${esc(q.contactId)}');fbSwitchMainTab('contacts');" title="Müşteriye git">
      <i class="bi bi-person me-1"></i>${esc(c.name||'—')}${c.company?' · '+esc(c.company):''}
    </div>` : '';
  })() : '';
  const previewBtn = q._id
    ? `<button class="btn btn-sm btn-outline-primary fb-preview-btn" onclick="showQuotePreview('${esc(q._id)}')"><i class="bi bi-eye me-1"></i>Önizle</button>`
    : '';
  return `<div class="fb-quote-card">
    <div class="d-flex justify-content-between align-items-start gap-2">
      <div style="flex:1;min-width:0;">
        ${contactInfo}
        <div><span class="fb-quote-num">${esc(q.quoteNumber||'—')}</span>${badge}</div>
        <div class="fb-quote-prod mt-1">${esc(q.product||q.lines?.[0]?.product||'')}</div>
        ${lines ? `<div class="fb-quote-lines mt-1">${lines}</div>` : ''}
      </div>
      <div class="text-end flex-shrink-0">
        <div class="fb-quote-total">${total} ${s}</div>
        <div style="font-size:11px;color:#aaa;">${date}</div>
        <div class="mt-1">${previewBtn}</div>
      </div>
    </div>
  </div>`;
}

// ── All Quotes view ───────────────────────────────────────
function renderAllQuotesView() {
  const container = document.getElementById('fb-all-quotes');
  if (!container) return;
  const allQuotes = Object.values(fbQuotes).flat();
  allQuotes.sort((a,b) => (b.createdAt||'') > (a.createdAt||'') ? 1 : -1);

  // Stats row
  const total = allQuotes.reduce((s,q) => s + Number(q.totalNet||0), 0);
  const sent  = allQuotes.filter(q => q.status==='sent').length;
  const draft = allQuotes.filter(q => q.status!=='sent').length;

  if (!allQuotes.length) {
    container.innerHTML = '<div class="text-muted text-center py-5">Henüz teklif yok</div>';
    return;
  }

  // Filter bar
  const filterSel = document.getElementById('fb-quotes-filter')?.value || 'all';
  const searchQ   = (document.getElementById('fb-quotes-search')?.value||'').toLowerCase();
  let filtered = allQuotes;
  if (filterSel === 'sent')  filtered = filtered.filter(q => q.status==='sent');
  if (filterSel === 'draft') filtered = filtered.filter(q => q.status!=='sent');
  if (searchQ) filtered = filtered.filter(q => {
    const c = fbCustomers.find(x => x._id === q.contactId);
    return (q.quoteNumber||'').toLowerCase().includes(searchQ) ||
      (q.product||'').toLowerCase().includes(searchQ) ||
      (c?.name||'').toLowerCase().includes(searchQ) ||
      (c?.company||'').toLowerCase().includes(searchQ);
  });

  container.innerHTML = `
    <div class="fb-aq-stats">
      <div class="fb-stat-card"><div class="fb-stat-val">${allQuotes.length}</div><div class="fb-stat-lbl">Toplam Teklif</div></div>
      <div class="fb-stat-card text-success"><div class="fb-stat-val">${sent}</div><div class="fb-stat-lbl">Gönderildi</div></div>
      <div class="fb-stat-card text-warning"><div class="fb-stat-val">${draft}</div><div class="fb-stat-lbl">Taslak</div></div>
      <div class="fb-stat-card text-primary"><div class="fb-stat-val">${total.toLocaleString('tr-TR',{minimumFractionDigits:2})} €</div><div class="fb-stat-lbl">Toplam Tutar</div></div>
    </div>
    ${filtered.length ? filtered.map(q => renderQuoteCard(q, true)).join('') : '<div class="text-muted text-center py-4">Sonuç bulunamadı</div>'}`;
}

function fbQuotesFilter() { renderAllQuotesView(); }

// ── Timeline rendering ────────────────────────────────────
// Turkish type labels (fuarbot sends German text, we normalise the type label)
const TYPE_TR = {
  email:    'E-posta',
  whatsapp: 'WhatsApp',
  quote:    'Teklif',
  scanned:  'Kart Tarandı',
  edit:     'Düzenlendi',
  note:     'Not',
  status:   'Durum Değişikliği',
  call:     'Arama',
  meeting:  'Toplantı',
  sms:      'SMS',
  sent:     'Gönderildi',
};
const TYPE_ICON = {
  email:'envelope', whatsapp:'whatsapp', quote:'file-earmark-text',
  scanned:'camera', edit:'pencil', note:'chat-left-text',
  status:'arrow-repeat', call:'telephone', meeting:'calendar-event', sms:'chat-dots',
};

function renderTimeline(acts) {
  if (!acts.length) return '<div class="text-muted small text-center py-3">Henüz aktivite yok</div>';
  return '<div class="fb-timeline">' + acts.map((a, idx) => {
    const type  = a.type || 'note';
    const trLabel = TYPE_TR[type] || type;
    const time  = a.createdAt ? new Date(a.createdAt).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
    // The text from Fuarbot is often in German — show it but prefix with Turkish type label if they differ
    const rawText = a.text || a.label || '';
    const displayText = rawText && rawText.toLowerCase() !== trLabel.toLowerCase() ? rawText : trLabel;

    // E-mail body: render expandable
    let bodyHtml = '';
    if (a.htmlBody) {
      const uid = 'fb-body-' + idx;
      bodyHtml = `<button class="fb-tl-toggle" onclick="document.getElementById('${uid}').classList.toggle('open')">
        <i class="bi bi-chevron-down me-1"></i>İçeriği göster
      </button>
      <div id="${uid}" class="fb-tl-body">
        <div class="fb-tl-html">${a.htmlBody}</div>
      </div>`;
    } else if (a.message) {
      const uid = 'fb-msg-' + idx;
      bodyHtml = `<button class="fb-tl-toggle" onclick="document.getElementById('${uid}').classList.toggle('open')">
        <i class="bi bi-chevron-down me-1"></i>Mesajı göster
      </button>
      <div id="${uid}" class="fb-tl-body"><p style="white-space:pre-wrap;">${esc(a.message)}</p></div>`;
    }

    return `<div class="fb-tl-item type-${esc(type)}">
      <div class="fb-tl-label"><i class="bi bi-${TYPE_ICON[type]||'circle'} me-1"></i>${esc(displayText)}</div>
      <div class="fb-tl-time">${time}${a.createdBy?' · '+esc(a.createdBy):''}</div>
      ${bodyHtml}
    </div>`;
  }).join('') + '</div>';
}

// ── Import to IndexedDB (with duplicate check) ────────────
async function checkDuplicate(name, email) {
  return new Promise((res, rej) => {
    const tx = db.transaction(['contacts'], 'readonly');
    const r  = tx.objectStore('contacts').getAll();
    r.onsuccess = () => {
      const all  = r.result;
      const nameLow  = (name||'').trim().toLowerCase();
      const emailLow = (email||'').trim().toLowerCase();
      const dup = all.find(ct =>
        (nameLow  && (ct.name||'').trim().toLowerCase()  === nameLow)  ||
        (emailLow && (ct.email||'').trim().toLowerCase() === emailLow)
      );
      res(dup || null);
    };
    r.onerror = () => rej(r.error);
  });
}

async function importFuarbotContact(id) {
  const c = fbCustomers.find(x => x._id === id);
  if (!c) return;
  try {
    // ── Duplicate check ──────────────────────────────────
    const dup = await checkDuplicate(c.name, c.email);
    if (dup) {
      toast(`"${c.name}" zaten CRM'de kayıtlı`, 'warning');
      return;
    }

    // ── Company lookup / create ──────────────────────────
    let companyId = null;
    if (c.company?.trim()) {
      const all = await new Promise((res,rej) => { const tx=db.transaction(['companies'],'readonly'); const r=tx.objectStore('companies').getAll(); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
      const match = all.find(co => (co.name||'').toLowerCase().trim() === c.company.toLowerCase().trim());
      if (match) { companyId = match.id; } else {
        const nc = { name:c.company.trim(), phone:c.phone||'', email:'', website:c.website||'', address:c.address||'', city:'', notes:'Fuarbot: '+(c.source||'Fuarbot'), marketingStatus:'Aranacak', qualityScore:0, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
        nc.qualityScore = calculateCompanyQuality(nc);
        companyId = await new Promise((res,rej) => { const tx2=db.transaction(['companies'],'readwrite'); const r2=tx2.objectStore('companies').add(nc); r2.onsuccess=()=>res(r2.result); r2.onerror=()=>rej(r2.error); });
      }
    }

    // ── Add contact ──────────────────────────────────────
    const phone = c.phone||c.mobile||'';
    const ct = { name:c.name||'', title:c.position||'', phone, phoneNormalized:phone.replace(/\D/g,''), phoneValid:/^0[0-9]{10}$/.test(phone.replace(/[\s\-()]/g,'')), email:c.email||'', companyId, status:'Aktif', notes:'Fuarbot: '+(c.source||'Fuarbot')+(c.notes?'\n'+c.notes:''), createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
    ct.qualityScore = calculateContactQuality(ct);
    await new Promise((res,rej) => { const tx3=db.transaction(['contacts'],'readwrite'); const r3=tx3.objectStore('contacts').add(ct); r3.onsuccess=()=>res(r3.result); r3.onerror=()=>rej(r3.error); });
    toast('✓ ' + c.name + ' CRM\'e aktarıldı', 'success');
  } catch (e) { toast('Hata: ' + e.message, 'error'); }
}

async function importAllFuarbotContacts() {
  if (!fbCustomers.length) { toast('Aktarılacak kişi yok', 'error'); return; }
  let imported = 0, skipped = 0;
  for (const c of fbCustomers) {
    try {
      const dup = await checkDuplicate(c.name, c.email);
      if (dup) { skipped++; continue; }
      await importFuarbotContact(c._id);
      imported++;
    } catch(_) {}
  }
  if (skipped > 0) toast(`✓ ${imported} aktarıldı · ${skipped} zaten mevcut (atlandı)`, 'info');
  else toast(`✓ ${imported} kişi aktarıldı`, 'success');
}

// ── Quote Preview Modal ───────────────────────────────────
function showQuotePreview(qId) {
  // Find quote across all contacts
  let q = null;
  for (const arr of Object.values(fbQuotes)) {
    q = arr.find(x => x._id === qId);
    if (q) break;
  }
  if (!q) return;

  // Recipient: prefer snapshot fields saved with the quote, fall back to fbCustomers
  const c = fbCustomers.find(x => x._id === q.contactId) || {};
  const name    = q.contactName    || c.name    || '';
  const company = q.contactCompany || c.company || '';
  const email   = q.contactEmail   || c.email   || '';
  const phone   = q.contactPhone   || c.phone   || c.mobile || '';
  const address = q.contactAddress || c.address || '';

  const s = SYM[q.currency] || q.currency || '€';
  const fmt = n => Number(n||0).toLocaleString('tr-TR', {minimumFractionDigits:2, maximumFractionDigits:2});
  const dateStr = q.createdAt ? new Date(q.createdAt).toLocaleDateString('tr-TR') : '';
  const sentStr = q.sentAt    ? new Date(q.sentAt).toLocaleDateString('tr-TR')    : '';

  const linesHtml = (q.lines||[]).length ? (q.lines||[]).map((l, i) => `
    <tr>
      <td style="text-align:center;">${i+1}</td>
      <td>${esc(l.product||'')}${l.description?`<br><span style="font-size:10px;color:#888;">${esc(l.description)}</span>`:''}</td>
      <td style="text-align:center;">${l.qty||1} ${esc(l.unit||'')}</td>
      <td style="text-align:right;">${fmt(l.unitPrice)} ${s}</td>
      <td style="text-align:right;font-weight:700;">${fmt((l.qty||1)*(l.unitPrice||0))} ${s}</td>
    </tr>`).join('') :
    `<tr><td colspan="5" style="text-align:center;color:#aaa;padding:20px;">—</td></tr>`;

  const total = Number(q.totalNet||q.totalGross||0);
  const badge = q.status==='sent'
    ? `<span style="background:#d1fae5;color:#065f46;padding:3px 10px;border-radius:20px;font-size:11px;">✓ Gönderildi${sentStr?' · '+sentStr:''}</span>`
    : `<span style="background:#e5e7eb;color:#555;padding:3px 10px;border-radius:20px;font-size:11px;">Taslak</span>`;

  // ── Use the real PDF when available, fall back to HTML template ──
  const pdfSrc = q.pdfUrl || (q.pdfBase64 ? `data:application/pdf;base64,${q.pdfBase64}` : null);
  const hasPdf = !!pdfSrc;
  const contentHtml = hasPdf
    ? `<iframe src="${pdfSrc}" class="fb-preview-iframe" title="${esc(q.quoteNumber||'Teklif')}"></iframe>`
    : `<div class="fb-preview-paper">
        <div class="fb-pp-header">
          <div><div class="fb-pp-company">WINDOFORM</div><div class="fb-pp-company-sub">Professional Window Solutions</div></div>
          <div style="text-align:right;">
            <div style="font-size:22px;font-weight:800;color:#1a1a2e;">TEKLİF</div>
            <div style="font-size:13px;color:#2b5597;font-weight:600;">${esc(q.quoteNumber||'')}</div>
            <div style="font-size:11px;color:#888;margin-top:2px;">${dateStr}</div>
          </div>
        </div>
        <div class="fb-pp-recipient">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:4px;">Alıcı</div>
          ${name    ? `<div style="font-weight:700;font-size:14px;">${esc(name)}</div>` : ''}
          ${company ? `<div style="font-size:13px;">${esc(company)}</div>` : ''}
          ${address ? `<div style="font-size:12px;color:#666;margin-top:2px;">${esc(address)}</div>` : ''}
          ${email   ? `<div style="font-size:12px;color:#666;">${esc(email)}</div>` : ''}
          ${phone   ? `<div style="font-size:12px;color:#666;">${esc(phone)}</div>` : ''}
        </div>
        <table class="fb-pp-table">
          <thead><tr>
            <th style="width:32px;text-align:center;">#</th><th>Ürün / Hizmet</th>
            <th style="width:80px;text-align:center;">Miktar</th>
            <th style="width:110px;text-align:right;">Birim Fiyat</th>
            <th style="width:120px;text-align:right;">Toplam</th>
          </tr></thead>
          <tbody>${linesHtml}</tbody>
        </table>
        <div class="fb-pp-totals">
          <div class="fb-pp-total-row">
            <span>Net Toplam</span>
            <span style="font-size:18px;font-weight:800;color:#2b5597;">${fmt(total)} ${s}</span>
          </div>
        </div>
        <div style="color:#888;font-size:10px;text-align:center;padding-top:16px;border-top:1px solid #eee;margin-top:16px;">
          Windoform · windoform.de${sentStr ? ' · Gönderildi: '+sentStr : ''}
        </div>
      </div>`;

  const actionBtn = hasPdf
    ? `<a href="${pdfSrc}" download="${esc(q.quoteNumber||'teklif')}.pdf" class="btn btn-success btn-sm" target="_blank"><i class="bi bi-download me-1"></i>PDF İndir</a>`
    : `<button onclick="window.print()" class="btn btn-primary btn-sm"><i class="bi bi-printer me-1"></i>Yazdır / PDF</button>`;

  document.body.insertAdjacentHTML('beforeend', `
  <div class="fb-preview-overlay" id="fb-preview-overlay" onclick="if(event.target===this)document.getElementById('fb-preview-overlay').remove()">
    <div class="fb-preview-modal${hasPdf ? ' fb-preview-modal--pdf' : ''}">
      <div class="fb-preview-toolbar no-print">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-weight:700;font-size:14px;">${esc(q.quoteNumber||'Teklif')}</span>
          ${badge}
        </div>
        <div style="display:flex;gap:8px;">
          ${actionBtn}
          <button onclick="document.getElementById('fb-preview-overlay').remove()" class="btn btn-outline-secondary btn-sm"><i class="bi bi-x"></i></button>
        </div>
      </div>
      ${contentHtml}
    </div>
  </div>`);
}

// ── Page init ─────────────────────────────────────────────
function loadFuarbotPage() {
  const cfg = loadFbConfig();
  if (cfg?.apiKey && cfg?.projectId) {
    if (!fbPollInterval) startFuarbotSync(cfg.apiKey, cfg.projectId);
    else {
      document.getElementById('fb-config-panel').style.display = 'none';
      document.getElementById('fb-tabs-wrapper').style.display = '';
      if (fbMainTabActive === 'contacts') { renderCustomerList(fbCustomers); if (fbSelectedId) showDetail(fbSelectedId); }
      else renderAllQuotesView();
    }
  } else { showFbConfig(); }
}

// ══════════════════════════════════════════════════════════════
// FUAR DASHBOARD
// ══════════════════════════════════════════════════════════════
let fbDashDateFilter = 'month'; // 'today'|'week'|'month'|'year'|'all'|'custom'
let fbDashDateFrom = '', fbDashDateTo = '';

function loadFuarDashboard() {
  const cfg = loadFbConfig();
  if (!cfg?.apiKey) {
    document.getElementById('fuar-dash-nodata').style.display = '';
    document.getElementById('fuar-dash-emp-card').style.display = 'none';
    ['scanned','quotes','revenue','emails'].forEach(k => {
      const el = document.getElementById('fuar-dash-kpi-' + k); if (el) el.textContent = '—';
    });
    return;
  }
  document.getElementById('fuar-dash-nodata').style.display = 'none';
  document.getElementById('fuar-dash-emp-card').style.display = '';
  // Set active button state
  ['today','week','month','year','all','custom'].forEach(f => {
    document.getElementById('fb-dash-btn-'+f)?.classList.toggle('active', f===fbDashDateFilter);
  });
  document.getElementById('fb-dash-custom-range').style.display = fbDashDateFilter==='custom' ? '' : 'none';
  renderFuarDashboard();
}

function fbDashSetFilter(filter) {
  fbDashDateFilter = filter;
  ['today','week','month','year','all','custom'].forEach(f => {
    document.getElementById('fb-dash-btn-'+f)?.classList.toggle('active', f===filter);
  });
  document.getElementById('fb-dash-custom-range').style.display = filter==='custom' ? '' : 'none';
  if (filter !== 'custom') renderFuarDashboard();
}

function fbDashCustomChange() {
  fbDashDateFrom = document.getElementById('fb-dash-from')?.value || '';
  fbDashDateTo   = document.getElementById('fb-dash-to')?.value   || '';
  if (fbDashDateFrom || fbDashDateTo) renderFuarDashboard();
}

function getFuarDateRange() {
  const now = new Date();
  let from, to = new Date(); to.setHours(23, 59, 59, 999);
  switch (fbDashDateFilter) {
    case 'today':
      from = new Date(); from.setHours(0, 0, 0, 0); break;
    case 'week':
      from = new Date(); from.setDate(from.getDate() - ((from.getDay() + 6) % 7)); from.setHours(0,0,0,0); break;
    case 'month':
      from = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case 'year':
      from = new Date(now.getFullYear(), 0, 1); break;
    case 'custom':
      from = fbDashDateFrom ? new Date(fbDashDateFrom + 'T00:00:00') : new Date(2020, 0, 1);
      to   = fbDashDateTo   ? new Date(fbDashDateTo   + 'T23:59:59') : to; break;
    default: // 'all'
      from = new Date(2020, 0, 1); break;
  }
  return { from, to };
}

function fuarInRange(dateStr, from, to) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= from && d <= to;
}

function renderFuarDashboard() {
  const { from, to } = getFuarDateRange();

  // ── Period label ────────────────────────────────────────────
  const fmtD = d => d.toLocaleDateString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric' });
  const lblMap = {
    today:'Bugün', week:'Bu Hafta', month:'Bu Ay', year:'Bu Yıl', all:'Tüm Zamanlar',
    custom: (fbDashDateFrom||'—') + ' – ' + (fbDashDateTo||'—')
  };
  const lbl = document.getElementById('fuar-dash-period-label');
  if (lbl) lbl.textContent = lblMap[fbDashDateFilter] || '';

  // ── Filter data by date ──────────────────────────────────────
  const customers   = fbCustomers.filter(c => fuarInRange(c.createdAt, from, to));
  const allQuotes   = Object.values(fbQuotes).flat().filter(q => fuarInRange(q.createdAt, from, to));
  const allActivities = Object.values(fbActivities).flat().filter(a => fuarInRange(a.createdAt, from, to));

  // ── Totals ───────────────────────────────────────────────────
  const totalScanned = customers.length;
  const totalQuotes  = allQuotes.length;
  const totalRevenue = allQuotes.reduce((s, q) => s + Number(q.totalNet || 0), 0);
  const totalEmails  = allActivities.filter(a => a.type === 'email').length;

  const setKpi = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setKpi('fuar-dash-kpi-scanned', totalScanned);
  setKpi('fuar-dash-kpi-quotes',  totalQuotes);
  setKpi('fuar-dash-kpi-revenue', totalRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' €');
  setKpi('fuar-dash-kpi-emails',  totalEmails);

  // ── Per-employee breakdown ───────────────────────────────────
  const employees = {};
  const addEmp = name => {
    const k = name || 'Bilinmiyor';
    if (!employees[k]) employees[k] = { scanned: 0, quotes: 0, revenue: 0, emails: 0 };
    return k;
  };

  customers.forEach(c => {
    const k = addEmp(c.createdBy);
    employees[k].scanned++;
  });

  allQuotes.forEach(q => {
    // Use quote's own createdBy; fall back to the contact's createdBy
    const by = q.createdBy || fbCustomers.find(c => c._id === q.contactId)?.createdBy || null;
    const k  = addEmp(by);
    employees[k].quotes++;
    employees[k].revenue += Number(q.totalNet || 0);
  });

  allActivities.filter(a => a.type === 'email').forEach(a => {
    const k = addEmp(a.createdBy);
    employees[k].emails++;
  });

  const empRows = Object.entries(employees)
    .sort((a, b) => (b[1].scanned + b[1].quotes) - (a[1].scanned + a[1].quotes));

  const tbody = document.getElementById('fuar-dash-emp-tbody');
  if (!tbody) return;

  if (!empRows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-5">Bu dönemde kayıt bulunamadı</td></tr>';
    return;
  }

  tbody.innerHTML = empRows.map(([name, s], i) => {
    const rank = i === 0 ? ' 🥇' : i === 1 ? ' 🥈' : i === 2 ? ' 🥉' : '';
    return `<tr>
      <td><span class="fbd-emp-name">${esc(name)}${rank}</span></td>
      <td class="text-center">
        <span class="fbd-badge fbd-badge-blue">${s.scanned}</span>
      </td>
      <td class="text-center">
        <span class="fbd-badge fbd-badge-amber">${s.quotes}</span>
      </td>
      <td class="text-end fw-semibold" style="color:#059669;">
        ${s.revenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} €
      </td>
      <td class="text-center">
        <span class="fbd-badge fbd-badge-purple">${s.emails}</span>
      </td>
    </tr>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════
// FUAR USERS
// ══════════════════════════════════════════════════════════════
// ── Kullanıcılar (fuarEmployees) ──────────────────────────
let fbUsersData = [];
const FB_EMP_COL = 'fuarEmployees';

async function loadFuarUsers() {
  const cfg = loadFbConfig();
  const el  = document.getElementById('fuar-users-content');
  if (!cfg?.apiKey || !cfg?.projectId) {
    el.innerHTML = `<div class="alert alert-warning">
      <i class="bi bi-exclamation-triangle me-2"></i>Önce <a href="#" onclick="showPage('fuarbot');return false;">Fuarbot Sync</a> sayfasında Firebase bağlantısını kurun.
    </div>`;
    return;
  }
  el.innerHTML = '<div class="text-muted p-3"><span class="spinner-border spinner-border-sm me-2"></span>Çalışanlar yükleniyor…</div>';
  try {
    let docs = [];
    try { docs = await fsFetch(cfg.apiKey, cfg.projectId, FB_EMP_COL); } catch(_) {}
    fbUsersData = docs;
    renderFuarUsers();
  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger">Hata: ${esc(e.message)}</div>`;
  }
}

function renderFuarUsers() {
  const el = document.getElementById('fuar-users-content');

  // Fuarbot verisinden henüz eklenmemiş çalışan sayısını hesapla
  const discovered  = _discoverFuarbotEmployees();
  const existingNames = new Set(fbUsersData.map(u => (u.name||'').toLowerCase().trim()));
  const newOnes = discovered.filter(d => !existingNames.has(d.name.toLowerCase().trim()));

  const importBtn = newOnes.length
    ? `<button class="btn btn-sm btn-outline-success me-2" onclick="openFuarbotImport()">
        <i class="bi bi-cloud-download-fill me-1"></i>Fuarbot'tan İçe Aktar
        <span class="badge bg-success ms-1">${newOnes.length}</span>
      </button>`
    : '';

  const addBtn = `<button class="btn btn-sm btn-primary" onclick="openAddFuarUser()">
    <i class="bi bi-person-plus-fill me-1"></i>Çalışan Ekle</button>`;

  const headerBtns = `<div class="d-flex gap-1">${importBtn}${addBtn}</div>`;

  if (!fbUsersData.length) {
    el.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <span class="text-muted small">Henüz çalışan eklenmemiş</span>
        ${headerBtns}
      </div>
      <div class="alert alert-info mb-0">
        <i class="bi bi-info-circle me-2"></i>
        Fuarbot verilerinden çalışanları otomatik içe aktarabilir veya manuel ekleyebilirsiniz.
        <br><small class="text-muted mt-1 d-block">
          Şifreler Firebase Authentication üzerinden yönetilir —
          <a href="https://console.firebase.google.com" target="_blank">Firebase Console →</a>
        </small>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="card">
      <div class="card-header d-flex align-items-center justify-content-between py-2 px-3">
        <span class="fw-semibold" style="font-size:13px;">
          <i class="bi bi-people-fill me-2 text-primary"></i>${fbUsersData.length} çalışan
        </span>
        ${headerBtns}
      </div>
      <div class="table-responsive">
        <table class="table table-hover mb-0 fbd-users-table">
          <thead class="table-light">
            <tr>
              <th>Ad Soyad</th>
              <th>E-posta</th>
              <th>Rol</th>
              <th style="width:140px;"></th>
            </tr>
          </thead>
          <tbody>
            ${fbUsersData.map(u => renderFuarUserRow(u)).join('')}
          </tbody>
        </table>
      </div>
      <div class="card-footer text-muted small py-2 px-3">
        <i class="bi bi-lock-fill me-1"></i>Şifre değişikliği için
        <a href="https://console.firebase.google.com" target="_blank">Firebase Console → Authentication</a>
        sayfasını kullanın veya <i class="bi bi-key-fill"></i> butonuyla sıfırlama e-postası gönderin.
      </div>
    </div>`;
}

// Fuarbot verilerinden benzersiz çalışanları topla
function _discoverFuarbotEmployees() {
  const map = {};
  // fbCustomers = array, fbActivities/fbQuotes = {contactId: [...]} nesneleri
  const all = [
    ...(fbCustomers || []),
    ...Object.values(fbActivities || {}).flat(),
    ...Object.values(fbQuotes     || {}).flat(),
  ];
  for (const doc of all) {
    const raw = (doc.createdBy || '').trim();
    if (!raw || raw === 'Fuarbot') continue;
    if (!map[raw]) {
      // createdBy bazen "Ad Soyad <email>" veya sadece email formatında olabilir
      const emailMatch = raw.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      map[raw] = {
        name:  emailMatch ? raw.replace(emailMatch[0], '').replace(/[<>]/g,'').trim() || raw : raw,
        email: emailMatch ? emailMatch[0] : '',
      };
    }
  }
  return Object.values(map);
}

// İçe aktarma modalını aç
function openFuarbotImport() {
  const discovered    = _discoverFuarbotEmployees();
  const existingNames = new Set(fbUsersData.map(u => (u.name||'').toLowerCase().trim()));
  const newOnes       = discovered.filter(d => !existingNames.has(d.name.toLowerCase().trim()));

  if (!newOnes.length) { toast('Tüm çalışanlar zaten eklenmiş.', 'success'); return; }

  const rows = newOnes.map((d, i) => `
    <tr>
      <td><input type="checkbox" class="form-check-input fuar-import-chk" data-i="${i}" checked></td>
      <td><input type="text"  class="form-control form-control-sm fuar-import-name"  data-i="${i}" value="${esc(d.name)}"  placeholder="Ad Soyad"></td>
      <td><input type="email" class="form-control form-control-sm fuar-import-email" data-i="${i}" value="${esc(d.email)}" placeholder="email@..."></td>
    </tr>`).join('');

  document.getElementById('fuar-import-body').innerHTML = `
    <p class="text-muted small mb-2">
      <i class="bi bi-info-circle me-1"></i>
      Fuarbot verilerinde tespit edilen çalışanlar. E-posta adreslerini tamamlayın, ardından içe aktarın.
    </p>
    <div class="table-responsive">
      <table class="table table-sm mb-0">
        <thead class="table-light"><tr><th style="width:32px;"></th><th>Ad Soyad</th><th>E-posta</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  // Gizli veriyi sakla
  document.getElementById('fuar-import-body').dataset.json = JSON.stringify(newOnes);
  new bootstrap.Modal(document.getElementById('fuarImportModal')).show();
}

async function saveFuarbotImport() {
  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId) return;

  const checkboxes = document.querySelectorAll('.fuar-import-chk:checked');
  if (!checkboxes.length) { toast('En az bir çalışan seçin.', 'error'); return; }

  const btn = document.getElementById('fuar-import-save-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Aktarılıyor…';

  const base = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${FB_EMP_COL}`;
  const now  = new Date().toISOString();
  let added  = 0, errors = 0;

  for (const chk of checkboxes) {
    const i     = chk.dataset.i;
    const name  = document.querySelector(`.fuar-import-name[data-i="${i}"]`)?.value.trim() || '';
    const email = document.querySelector(`.fuar-import-email[data-i="${i}"]`)?.value.trim() || '';
    if (!name) continue;
    try {
      const res = await fetch(`${base}?key=${cfg.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: {
          name:      { stringValue: name },
          email:     { stringValue: email },
          role:      { stringValue: 'Saha Görevlisi' },
          createdAt: { stringValue: now },
          updatedAt: { stringValue: now },
        }}),
      });
      if (res.ok) {
        const data = await res.json();
        const docId = data.name?.split('/').pop() || ('emp_' + Date.now() + added);
        fbUsersData.push({ _id: docId, name, email, role: 'Saha Görevlisi' });
        added++;
      } else { errors++; }
    } catch(_) { errors++; }
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="bi bi-cloud-download-fill me-1"></i>İçe Aktar';
  bootstrap.Modal.getInstance(document.getElementById('fuarImportModal'))?.hide();
  toast(`✓ ${added} çalışan eklendi${errors ? `, ${errors} hata` : ''}`, added ? 'success' : 'error');
  renderFuarUsers();
}

function renderFuarUserRow(u) {
  const name  = esc(u.name || u._id || '—');
  const email = esc(u.email || '—');
  const role  = esc(u.role || '—');
  return `<tr>
    <td class="fw-semibold">${name}</td>
    <td><span style="font-family:monospace;font-size:12px;">${email}</span></td>
    <td><span class="badge bg-light text-dark border">${role}</span></td>
    <td>
      <button class="btn btn-sm btn-outline-primary me-1" onclick="editFuarUser('${esc(u._id)}')" title="Düzenle">
        <i class="bi bi-pencil-fill"></i>
      </button>
      <button class="btn btn-sm btn-outline-warning me-1" onclick="resetFuarUserPassword('${esc(u._id)}')" title="Şifre Sıfırlama E-postası">
        <i class="bi bi-key-fill"></i>
      </button>
      <button class="btn btn-sm btn-outline-danger" onclick="deleteFuarUser('${esc(u._id)}')" title="Sil">
        <i class="bi bi-trash-fill"></i>
      </button>
    </td>
  </tr>`;
}

function openAddFuarUser() {
  document.getElementById('fuar-edit-user-id').value    = '';
  document.getElementById('fuar-edit-user-name').value  = '';
  document.getElementById('fuar-edit-user-email').value = '';
  document.getElementById('fuar-edit-user-role').value  = '';
  document.getElementById('fuar-edit-modal-title').textContent = 'Çalışan Ekle';
  document.getElementById('fuar-reset-pw-btn').style.display = 'none';
  new bootstrap.Modal(document.getElementById('fuarUserEditModal')).show();
}

function editFuarUser(id) {
  const u = fbUsersData.find(x => x._id === id);
  if (!u) return;
  document.getElementById('fuar-edit-user-id').value    = id;
  document.getElementById('fuar-edit-user-name').value  = u.name || '';
  document.getElementById('fuar-edit-user-email').value = u.email || '';
  document.getElementById('fuar-edit-user-role').value  = u.role || '';
  document.getElementById('fuar-edit-modal-title').textContent = 'Çalışan Düzenle';
  document.getElementById('fuar-reset-pw-btn').style.display = '';
  new bootstrap.Modal(document.getElementById('fuarUserEditModal')).show();
}

async function saveFuarUser() {
  const id  = document.getElementById('fuar-edit-user-id').value.trim();
  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId) return;

  const nameVal  = document.getElementById('fuar-edit-user-name').value.trim();
  const emailVal = document.getElementById('fuar-edit-user-email').value.trim();
  const roleVal  = document.getElementById('fuar-edit-user-role').value.trim();

  if (!nameVal || !emailVal) { toast('Ad ve e-posta zorunludur.', 'error'); return; }

  const now = new Date().toISOString();
  const fields = {
    name:      { stringValue: nameVal },
    email:     { stringValue: emailVal },
    role:      { stringValue: roleVal },
    updatedAt: { stringValue: now },
  };
  const base = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${FB_EMP_COL}`;

  try {
    let res, docId = id;
    if (!id) {
      // Yeni belge — POST (otomatik ID)
      fields.createdAt = { stringValue: now };
      res = await fetch(`${base}?key=${cfg.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
    } else {
      // Güncelle — PATCH + updateMask
      const mask = Object.keys(fields).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
      res = await fetch(`${base}/${id}?key=${cfg.apiKey}&${mask}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
    }
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error?.message || 'HTTP ' + res.status);
    }
    const data = await res.json();
    if (!id) docId = data.name?.split('/').pop() || ('emp_' + Date.now());

    const emp = { _id: docId, name: nameVal, email: emailVal, role: roleVal };
    if (!id) {
      fbUsersData.push(emp);
    } else {
      const idx = fbUsersData.findIndex(x => x._id === id);
      if (idx >= 0) Object.assign(fbUsersData[idx], emp);
    }
    bootstrap.Modal.getInstance(document.getElementById('fuarUserEditModal'))?.hide();
    toast(id ? '✓ Çalışan güncellendi' : '✓ Çalışan eklendi', 'success');
    renderFuarUsers();
  } catch (e) {
    toast('Hata: ' + e.message, 'error');
  }
}

// Şifre sıfırlama — satır butonundan
async function resetFuarUserPassword(id) {
  const u = fbUsersData.find(x => x._id === id);
  if (!u?.email) { toast('E-posta adresi bulunamadı.', 'error'); return; }
  await _sendPasswordReset(u.email);
}

// Şifre sıfırlama — modal içindeki butondan
async function resetFuarUserPasswordFromModal() {
  const email = document.getElementById('fuar-edit-user-email').value.trim();
  if (!email) { toast('Önce e-posta adresini girin.', 'error'); return; }
  await _sendPasswordReset(email);
}

async function _sendPasswordReset(email) {
  const cfg = loadFbConfig();
  if (!cfg?.apiKey) return;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${cfg.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = data?.error?.message || 'HTTP ' + res.status;
      // EMAIL_NOT_FOUND = bu e-posta Firebase Auth'da kayıtlı değil
      if (code.includes('EMAIL_NOT_FOUND') || code.includes('INVALID_EMAIL')) {
        toast(`⚠️ ${email} Firebase Authentication'da kayıtlı değil. Önce Firebase Console → Authentication → Users'dan ekleyin.`, 'error');
      } else {
        toast('Hata: ' + code, 'error');
      }
      return;
    }
    // Başarılı — spam uyarısı ile birlikte göster
    toast(`✓ Sıfırlama e-postası ${email} adresine gönderildi — gelmezse spam/junk klasörünü kontrol edin.`, 'success');
  } catch (e) {
    toast('Ağ hatası: ' + e.message, 'error');
  }
}

// Çalışan sil
async function deleteFuarUser(id) {
  const u = fbUsersData.find(x => x._id === id);
  if (!u) return;
  const name = u.name || u.email || id;
  if (!confirm(`"${name}" adlı çalışanı silmek istediğinize emin misiniz?`)) return;

  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId) return;
  const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${FB_EMP_COL}/${id}?key=${cfg.apiKey}`;
  try {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error?.message || 'HTTP ' + res.status);
    }
    fbUsersData = fbUsersData.filter(x => x._id !== id);
    toast(`✓ "${name}" silindi`, 'success');
    renderFuarUsers();
  } catch (e) {
    toast('Silme hatası: ' + e.message, 'error');
  }
}

function togglePassVis(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  const isPass = inp.type === 'password';
  inp.type = isPass ? 'text' : 'password';
  const icon = btn.querySelector('i');
  if (icon) { icon.className = isPass ? 'bi bi-eye-slash' : 'bi bi-eye'; }
}
