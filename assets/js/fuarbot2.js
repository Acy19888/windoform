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

function startFuarbotSync(apiKey, projectId) {
  setFbStatus('Bağlanıyor…', 'warning');
  if (fbPollInterval) clearInterval(fbPollInterval);
  fetchAllData(apiKey, projectId, false);
  fbPollInterval = setInterval(() => fetchAllData(apiKey, projectId, true), 30000);
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

  document.body.insertAdjacentHTML('beforeend', `
  <div class="fb-preview-overlay" id="fb-preview-overlay" onclick="if(event.target===this)document.getElementById('fb-preview-overlay').remove()">
    <div class="fb-preview-modal">
      <div class="fb-preview-toolbar no-print">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-weight:700;font-size:14px;">${esc(q.quoteNumber||'Teklif')}</span>
          ${badge}
        </div>
        <div style="display:flex;gap:8px;">
          <button onclick="window.print()" class="btn btn-primary btn-sm"><i class="bi bi-printer me-1"></i>Yazdır / PDF</button>
          <button onclick="document.getElementById('fb-preview-overlay').remove()" class="btn btn-outline-secondary btn-sm"><i class="bi bi-x"></i></button>
        </div>
      </div>
      <div class="fb-preview-paper" id="fb-print-area">
        <!-- Header -->
        <div class="fb-pp-header">
          <div>
            <div class="fb-pp-company">WINDOFORM</div>
            <div class="fb-pp-company-sub">Professional Window Solutions</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:22px;font-weight:800;color:#1a1a2e;letter-spacing:-0.5px;">TEKLİF</div>
            <div style="font-size:13px;color:#2b5597;font-weight:600;">${esc(q.quoteNumber||'')}</div>
            <div style="font-size:11px;color:#888;margin-top:2px;">${dateStr}</div>
          </div>
        </div>
        <!-- Recipient -->
        <div class="fb-pp-recipient">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:4px;">Alıcı</div>
          ${name    ? `<div style="font-weight:700;font-size:14px;">${esc(name)}</div>` : ''}
          ${company ? `<div style="font-size:13px;">${esc(company)}</div>` : ''}
          ${address ? `<div style="font-size:12px;color:#666;margin-top:2px;">${esc(address)}</div>` : ''}
          ${email   ? `<div style="font-size:12px;color:#666;">${esc(email)}</div>` : ''}
          ${phone   ? `<div style="font-size:12px;color:#666;">${esc(phone)}</div>` : ''}
        </div>
        <!-- Items table -->
        <table class="fb-pp-table">
          <thead>
            <tr>
              <th style="width:32px;text-align:center;">#</th>
              <th>Ürün / Hizmet</th>
              <th style="width:80px;text-align:center;">Miktar</th>
              <th style="width:110px;text-align:right;">Birim Fiyat</th>
              <th style="width:120px;text-align:right;">Toplam</th>
            </tr>
          </thead>
          <tbody>${linesHtml}</tbody>
        </table>
        <!-- Totals -->
        <div class="fb-pp-totals">
          <div class="fb-pp-total-row">
            <span>Net Toplam</span>
            <span style="font-size:18px;font-weight:800;color:#2b5597;">${fmt(total)} ${s}</span>
          </div>
        </div>
        <!-- Footer -->
        <div class="fb-pp-footer">
          <div style="color:#888;font-size:10px;text-align:center;padding-top:16px;border-top:1px solid #eee;">
            Windoform · windoform.de${sentStr ? ' · Gönderildi: '+sentStr : ''}
          </div>
        </div>
      </div>
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
