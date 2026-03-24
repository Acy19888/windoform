// fuarbot.js — Fuarbot Firebase sync (Firestore REST API, no SDK)
// Collections: crm_customers | crm_activities | crm_quotes

const FB_CFG_KEY = 'crm_fuarbot_firebase_config';
let fbPollInterval = null;
let fbCustomers        = [];
let fbAllCustomersRaw  = [];  // all crm_customers incl. already-imported (for timeline lookup)
let fbActivities       = {};
let fbQuotes           = {};
let fbSelectedId   = null;
let fbMainTabActive = 'contacts'; // 'contacts' | 'quotes'

// ── Config ────────────────────────────────────────────────
function loadFbConfig() {
  try { return JSON.parse(localStorage.getItem(FB_CFG_KEY) || 'null'); } catch { return null; }
}
function saveFbConfig(cfg) { localStorage.setItem(FB_CFG_KEY, JSON.stringify(cfg)); }

function showFbConfig() {
  // Redirect to the dedicated Ayarlar page instead of inline panel
  if (typeof showPage === 'function') {
    showPage('ayarlar');
  }
}

// Called when Fuarbot page is opened — show "not connected" notice if needed
function _fbShowNotConnected() {
  const panel = document.getElementById('fb-config-panel');
  const tabs  = document.getElementById('fb-tabs-wrapper');
  if (panel) panel.style.display = '';
  if (tabs)  tabs.style.display  = 'none';
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
    const [rawCustomers, activities, quotes, employees] = await Promise.all([
      fsFetch(apiKey, projectId, 'crm_customers'),
      fsFetch(apiKey, projectId, 'crm_activities').catch(()=>[]),
      fsFetch(apiKey, projectId, 'crm_quotes').catch(()=>[]),
      fsFetch(apiKey, projectId, 'fuarEmployees').catch(()=>[]),
    ]);
    // Keep fbUsersData in sync so renderFuarDashboard always has employee names
    if (employees.length) fbUsersData = employees;

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
    fbAllCustomersRaw = [...seen.values()];  // keep full list for timeline lookup
    fbCustomers       = [...seen.values()]; // will be filtered below

    // ── Filter out contacts already imported into CRM ──────
    // Compare by name+email against IndexedDB contacts so that
    // imported contacts stay gone even after page navigation / re-sync.
    if (typeof dbAll === 'function') {
      try {
        const crmContacts = await dbAll('contacts');
        if (crmContacts.length) {
          const crmSet = new Set(
            crmContacts
              .filter(c => (c.name || '').trim() || (c.email || '').trim()) // skip blanks
              .map(c => [(c.name||'').toLowerCase().trim(), (c.email||'').toLowerCase().trim()].join('§'))
          );
          fbCustomers = fbCustomers.filter(c => {
            const key = [(c.name||'').toLowerCase().trim(), (c.email||'').toLowerCase().trim()].join('§');
            if (!key || key === '§') return true; // can't match empty records — keep them
            return !crmSet.has(key);
          });
        }
      } catch(filterErr) { console.warn('[Fuarbot] CRM filter error:', filterErr); }
    }

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
  fbPollInterval = setInterval(() => fetchAllData(apiKey, projectId, true), 3 * 60 * 1000); // 3 min
}

// ── Targeted fetch: fresh activities + quotes for ONE contact ──
// Called when a contact modal opens so timeline is always up-to-date.
async function fbFetchContactData(fbId) {
  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId || !fbId) return;
  try {
    const base = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents:runQuery?key=${cfg.apiKey}`;

    const runQ = async (col, field, val) => {
      const body = {
        structuredQuery: {
          from: [{ collectionId: col }],
          where: {
            fieldFilter: {
              field: { fieldPath: field },
              op:    'EQUAL',
              value: { stringValue: val },
            },
          },
          orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
          limit: 300,
        },
      };
      const res  = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) return [];
      const rows = await res.json();
      return rows.filter(r => r.document).map(r => fsDoc(r.document));
    };

    // 1. Activities from crm_activities (parentId or contactId)
    // 2. Quotes from crm_quotes
    // 3. Raw contacts/{fbId} document — has embedded timeline[] array with ALL events
    //    (initial card scan, edits etc. that never made it into crm_activities)
    const contactDocUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/contacts/${fbId}?key=${cfg.apiKey}`;

    const [actsA, actsB, quotes, contactDocRes] = await Promise.all([
      runQ('crm_activities', 'contactId', fbId),
      runQ('crm_activities', 'parentId',  fbId),
      runQ('crm_quotes',     'contactId', fbId),
      fetch(contactDocUrl).catch(() => null),
    ]);

    // Merge & deduplicate crm_activities
    const actsMap = new Map();
    [...actsA, ...actsB].forEach(a => actsMap.set(a._id, a));

    // Also include timeline events embedded in contacts/{fbId}.timeline
    if (contactDocRes?.ok) {
      try {
        const contactDoc = await contactDocRes.json();
        const timelineVal = contactDoc?.fields?.timeline;
        // timeline is an arrayValue
        const timelineItems = timelineVal?.arrayValue?.values || [];
        timelineItems.forEach((item, i) => {
          const obj = fsFields(item.mapValue?.fields || {});
          const ts  = obj.timestamp || obj.createdAt || '';
          const key = `tl_${fbId}_${i}`;
          if (!actsMap.has(key)) {
            actsMap.set(key, {
              _id:       key,
              type:      obj.type || 'note',
              text:      obj.label || obj.text || '',
              createdAt: ts,
              createdBy: obj.user || '',
              htmlBody:  obj.htmlBody || null,
              message:   obj.message  || null,
            });
          }
        });
      } catch(parseErr) { /* ignore parse errors */ }
    }

    const acts = [...actsMap.values()].sort((a, b) => (b.createdAt||'') > (a.createdAt||'') ? 1 : -1);

    // Update in-memory caches
    fbActivities[fbId] = acts;
    fbQuotes[fbId]     = quotes.sort((a, b) => (b.createdAt||'') > (a.createdAt||'') ? 1 : -1);
  } catch(e) {
    console.warn('[Fuarbot] fbFetchContactData failed:', e);
  }
}

// ── Find a Fuarbot customer in crm_customers by email or name ──
// Used when fbAllCustomersRaw is empty (background sync not yet run)
async function fbFindCustomerByEmailOrName(email, nameLow) {
  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId) return null;
  if (!email && !nameLow) return null;
  const base = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents:runQuery?key=${cfg.apiKey}`;
  const runQ = async (field, val) => {
    if (!val) return [];
    const body = { structuredQuery: { from:[{collectionId:'crm_customers'}], where:{ fieldFilter:{ field:{fieldPath:field}, op:'EQUAL', value:{stringValue:val} } }, limit:5 } };
    const res = await fetch(base, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.filter(r => r.document).map(r => fsDoc(r.document));
  };
  try {
    const [byEmail, byName] = await Promise.all([
      runQ('email', email),
      runQ('name',  nameLow),
    ]);
    return byEmail[0] || byName[0] || null;
  } catch(e) { return null; }
}

// ── Silent background sync (called from app startup) ──────
function fbBackgroundSync() {
  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId) return;
  if (!fbPollInterval) startFuarbotSync(cfg.apiKey, cfg.projectId);
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

    // ── Remove from list + update badge ──────────────────
    fbCustomers = fbCustomers.filter(x => x._id !== id);
    renderCustomerList(fbCustomers);
    setFbStatus('Bağlı · ' + fbCustomers.length + ' kişi', 'success');
    // Clear detail pane if it was showing this contact
    if (fbSelectedId === id) {
      fbSelectedId = null;
      const det = document.getElementById('fb-detail');
      if (det) det.innerHTML = `<div class="fb-empty"><i class="bi bi-person-lines-fill" style="font-size:48px;opacity:.2;"></i><span>Soldaki listeden bir müşteri seçin</span></div>`;
    }
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
  // Badge already updated per-contact inside importFuarbotContact; final sync:
  setFbStatus('Bağlı · ' + fbCustomers.length + ' kişi', 'success');
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
  } else { _fbShowNotConnected(); }
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
  // fbAllCustomersRaw = alle Kontakte inkl. bereits importierte (ungefiltert)
  // fbCustomers = nur noch NICHT importierte — NICHT für Zählung verwenden!
  const allCusts    = fbAllCustomersRaw.length ? fbAllCustomersRaw : fbCustomers;
  const customers   = allCusts.filter(c =>
    fuarInRange(c.createdAt, from, to) || fuarInRange(c.updatedAt, from, to)
  );
  const allQuotes   = Object.values(fbQuotes).flat().filter(q => {
    // Fuarbot quotes may use sentAt or updatedAt instead of createdAt
    const dt = q.createdAt || q.sentAt || q.updatedAt;
    if (!dt) return fbDashDateFilter === 'all'; // undated → show only in 'all' view
    return fuarInRange(dt, from, to);
  });
  const allActivities = Object.values(fbActivities).flat().filter(a => {
    const dt = a.createdAt || a.timestamp;
    if (!dt) return fbDashDateFilter === 'all';
    return fuarInRange(dt, from, to);
  });

  // ── Quote-activities (Fuarbot stores sent quotes as activities, not crm_quotes docs)
  // Deduplicate against crm_quotes by quote number to avoid double-counting
  const _quoteNumsSeen = new Set(allQuotes.map(q => q.quoteNumber).filter(Boolean));
  const quoteActivities = allActivities.filter(a => {
    const txt = (a.text||'').toLowerCase();
    const isQuoteType  = a.type === 'quote' || a.type === 'offer' || a.type === 'angebot';
    const isEmailQuote = a.type === 'email' && (txt.includes('teklif') || txt.includes('angebot') || txt.includes('quote'));
    const hasQuoteNum  = /[A-Z]{2,}-[\dA-Z]+-\d+/.test(a.text||'');
    if (!isQuoteType && !isEmailQuote && !hasQuoteNum) return false;
    const m = (a.text||'').match(/([A-Z]+-[\dA-Z]+-\d+)/);
    const num = m?.[1];
    if (num) { if (_quoteNumsSeen.has(num)) return false; _quoteNumsSeen.add(num); }
    return true;
  });

  // ── Totals ───────────────────────────────────────────────────
  const totalScanned = customers.length;
  const _actRev = quoteActivities.reduce((s, a) => {
    const m = (a.text||'').match(/([\d.]+,\d{2})\s*(?:EUR|€|\$|₺)/);
    return s + (m ? parseFloat(m[1].replace(/\./g,'').replace(',','.')) : 0);
  }, 0);
  const totalQuotes  = allQuotes.length + quoteActivities.length;
  const totalRevenue = allQuotes.reduce((s, q) => s + Number(q.totalNet || 0), 0) + _actRev;
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

  // Build lookup maps from fuarEmployees: uid → name, email → name
  const _empByUid   = {};
  const _empByEmail = {};
  fbUsersData.forEach(u => {
    if (u._id)   _empByUid[u._id.trim()]               = u.name || u.email || u._id;
    if (u.email) _empByEmail[u.email.trim().toLowerCase()] = u.name || u.email;
  });

  // Resolve raw createdBy (email or name) or createdByUid to display name
  const _resolveEmp = (rawName, rawUid) => {
    if (rawUid && _empByUid[rawUid])   return _empByUid[rawUid];
    if (rawName) {
      const lo = rawName.trim().toLowerCase();
      // Exact email match
      if (_empByEmail[lo]) return _empByEmail[lo];
      // Exact full-name match (case-insensitive)
      const exact = fbUsersData.find(u => (u.name||'').toLowerCase() === lo);
      if (exact) return exact.name;
      // Partial: activity might store only first name ("Volkan" → "Volkan Saglik")
      const partial = fbUsersData.find(u => {
        const n = (u.name||'').toLowerCase();
        return n.startsWith(lo + ' ') || n === lo;
      });
      if (partial) return partial.name;
      return rawName.trim(); // fallback: use as-is
    }
    return null;
  };

  // crm_customers hat kein createdBy — aus crm_activities (erster Eintrag) holen
  const _getCreatedBy = (c) => {
    if (c.createdBy || c.createdByUid) {
      return _resolveEmp(c.createdBy, c.createdByUid);
    }
    // Erste Activity dieses Kontakts = Scan-Event (älteste = letzter im Array)
    const acts = fbActivities[c._id] || [];
    const first = acts[acts.length - 1];
    if (first) {
      const resolved = _resolveEmp(first.createdBy, first.createdByUid);
      if (resolved) return resolved;
    }
    // Alle Activities durchsuchen
    const allFlat = Object.values(fbActivities).flat();
    const anyAct = allFlat.find(a => (a.parentId || a.contactId) === c._id && (a.createdBy || a.createdByUid));
    if (anyAct) return _resolveEmp(anyAct.createdBy, anyAct.createdByUid);
    return null;
  };

  customers.forEach(c => {
    const k = addEmp(_getCreatedBy(c));
    employees[k].scanned++;
  });

  allQuotes.forEach(q => {
    const contactCreatedBy = _getCreatedBy(allCusts.find(c => c._id === q.contactId) || {});
    const by = _resolveEmp(q.createdBy, q.createdByUid) || contactCreatedBy || null;
    const k  = addEmp(by);
    employees[k].quotes++;
    employees[k].revenue += Number(q.totalNet || 0);
  });

  // Quote-activities (Fuarbot quotes stored as activities)
  quoteActivities.forEach(a => {
    const k = addEmp(_resolveEmp(a.createdBy, a.createdByUid));
    employees[k].quotes++;
    const m = (a.text||'').match(/([\d.]+,\d{2})\s*(?:EUR|€|\$|₺)/);
    if (m) employees[k].revenue += parseFloat(m[1].replace(/\./g,'').replace(',','.')) || 0;
  });

  allActivities.filter(a => a.type === 'email').forEach(a => {
    const k = addEmp(_resolveEmp(a.createdBy, a.createdByUid));
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

// Giriş yapan kullanıcıyı fuarEmployees'e ekle (eğer yoksa)
// _appStart'tan çağrılır — sayfa açılışında çalışır
async function _autoRegisterCurrentUser() {
  try {
    const cfg = loadFbConfig();
    if (!cfg?.apiKey || !cfg?.projectId) return;
    if (typeof authEmail !== 'function' || !authEmail()) return;

    const myEmail = authEmail().toLowerCase().trim();
    const myUid   = (typeof authUid === 'function' && authUid()) || myEmail;
    const token   = typeof authToken === 'function' ? await authToken() : null;

    // Belge zaten var mı?
    const docUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${FB_EMP_COL}/${myUid}?key=${cfg.apiKey}`;
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const check = await fetch(docUrl, { headers });
    if (check.ok) return; // zaten var

    // Yok — oluştur
    const now    = new Date().toISOString();
    const name   = myEmail.split('@')[0];
    const fields = {
      name:      { stringValue: name },
      email:     { stringValue: myEmail },
      role:      { stringValue: 'Saha Görevlisi' },
      uid:       { stringValue: myUid },
      createdAt: { stringValue: now },
    };
    const mask = Object.keys(fields).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
    const ph = { 'Content-Type': 'application/json', ...headers };
    await fetch(`${docUrl}&${mask}`, { method: 'PATCH', headers: ph, body: JSON.stringify({ fields }) });
  } catch(e) { /* sessizce geç */ }
}

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

    // Giriş yapan kullanıcı listede yoksa otomatik ekle
    if (typeof authEmail === 'function' && authEmail()) {
      const myEmail = authEmail().toLowerCase().trim();
      const myUid   = typeof authUid === 'function' ? (authUid() || myEmail) : myEmail;
      const exists  = docs.some(u => (u.email||'').toLowerCase().trim() === myEmail || u._id === myUid);
      if (!exists) {
        try {
          const token = typeof authToken === 'function' ? await authToken() : null;
          const name  = myEmail.split('@')[0];
          const now   = new Date().toISOString();
          const fields = {
            name:      { stringValue: name },
            email:     { stringValue: myEmail },
            role:      { stringValue: 'Saha Görevlisi' },
            uid:       { stringValue: myUid },
            createdAt: { stringValue: now },
          };
          const base = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${FB_EMP_COL}/${myUid}?key=${cfg.apiKey}`;
          const mask = Object.keys(fields).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
          const headers = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;
          const r = await fetch(`${base}&${mask}`, { method: 'PATCH', headers, body: JSON.stringify({ fields }) });
          if (r.ok) {
            const newDoc = { _id: myUid, name, email: myEmail, role: 'Saha Görevlisi', uid: myUid, createdAt: now };
            docs.push(newDoc);
          }
        } catch(e) { console.warn('Auto-register user:', e.message); }
      }
    }

    fbUsersData = docs;
    renderFuarUsers();
  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger">Hata: ${esc(e.message)}</div>`;
  }
}

function renderFuarUsers() {
  const el = document.getElementById('fuar-users-content');

  // Fuarbot verisinden henüz eklenmemiş çalışan sayısını hesapla
  const discovered = _discoverFuarbotEmployees();
  const newOnes    = discovered.filter(d => !_isAlreadyEmployee(d.name, d.email));
  const badge         = newOnes.length ? `<span class="badge bg-success ms-1">${newOnes.length}</span>` : '';

  // Buton her zaman görünür — veri yoksa tıklayınca açıklama gösterir
  const importBtn = `<button class="btn btn-sm btn-outline-success me-2" onclick="openFuarbotImport()">
    <i class="bi bi-cloud-download-fill me-1"></i>Fuarbot'tan İçe Aktar${badge}
  </button>`;

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

// Check if a discovered name is already covered by an existing fuarEmployee
// Handles: exact match, partial first-name match ("Volkan" ↔ "Volkan Saglik"),
// and email match
function _isAlreadyEmployee(discoveredName, discoveredEmail) {
  const lo    = (discoveredName  || '').toLowerCase().trim();
  const loMail= (discoveredEmail || '').toLowerCase().trim();
  return fbUsersData.some(u => {
    const n = (u.name  || '').toLowerCase().trim();
    const e = (u.email || '').toLowerCase().trim();
    if (loMail && e && loMail === e) return true;   // email match
    if (!n || !lo) return false;
    if (n === lo) return true;                        // exact name
    if (n.startsWith(lo + ' ')) return true;          // "Volkan" matches "Volkan Saglik"
    if (lo.startsWith(n + ' ')) return true;          // "Volkan Saglik" matches "Volkan"
    return false;
  });
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
  const discovered = _discoverFuarbotEmployees();
  const newOnes    = discovered.filter(d => !_isAlreadyEmployee(d.name, d.email));

  if (!discovered.length) {
    toast('Fuarbot verisi henüz yüklenmemiş. Önce Fuarbot Sync sayfasında senkronize edin.', 'error');
    return;
  }
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

  // Auth token is required for Firestore write rules
  const token = (typeof authToken === 'function') ? await authToken() : null;
  const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};

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
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ fields }),
      });
    } else {
      // Güncelle — PATCH + updateMask
      const mask = Object.keys(fields).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
      res = await fetch(`${base}/${id}?key=${cfg.apiKey}&${mask}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
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
  const token = (typeof authToken === 'function') ? await authToken() : null;
  const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};
  const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${FB_EMP_COL}/${id}?key=${cfg.apiKey}`;
  try {
    const res = await fetch(url, { method: 'DELETE', headers: authHeaders });
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

// ══════════════════════════════════════════════════════════════
// TEKLIFLER
// ══════════════════════════════════════════════════════════════
let tkAllQuotes   = [];
let tkFilterDate  = 'all';
let tkFilterFrom  = '';
let tkFilterTo    = '';
let tkSearchQ     = '';

async function loadTeklifler() {
  const cfg = loadFbConfig();
  const el  = document.getElementById('teklifler-content');
  if (!cfg?.apiKey || !cfg?.projectId) {
    el.innerHTML = `<div class="alert alert-warning"><i class="bi bi-exclamation-triangle me-2"></i>Önce <a href="#" onclick="showPage('fuarbot');return false;">Fuarbot Sync</a> sayfasında bağlantı kurun.</div>`;
    return;
  }
  el.innerHTML = '<div class="text-muted p-3"><span class="spinner-border spinner-border-sm me-2"></span>Teklifler yükleniyor…</div>';
  try {
    // Always fetch fresh from Firestore so newly created quotes appear immediately
    let flat;
    try {
      flat = await fsFetch(cfg.apiKey, cfg.projectId, 'crm_quotes');
      // Keep fbQuotes cache in sync for dashboard/timeline
      fbQuotes = {};
      flat.forEach(q => { const k = q.contactId||''; (fbQuotes[k]||(fbQuotes[k]=[])).push(q); });
    } catch(_) {
      // Fallback to in-memory cache if Firestore unreachable
      flat = Object.values(fbQuotes || {}).flat();
    }
    // Enrich Fuarbot quotes: contactId → contactName/contactCompany if missing
    // (old migrated quotes only have contactId, no name fields)
    const _enrichQuotes = (custList) => {
      flat.forEach(q => {
        if (q.contactId && !(q.contactName||'').trim() && !(q.contactCompany||'').trim()) {
          const c = custList.find(x => x._id === q.contactId);
          if (c) {
            q.contactName    = c.name    || '';
            q.contactCompany = c.company || c.companyName || '';
            q.contactEmail   = q.contactEmail || c.email || '';
            q.contactPhone   = q.contactPhone || c.phone || '';
          }
        }
      });
    };

    // Try in-memory cache first (fast path)
    _enrichQuotes([...(fbAllCustomersRaw||[]), ...(fbCustomers||[])]);

    // Any still missing? Fetch crm_customers from Firestore
    const stillMissing = flat.some(q => q.contactId && !(q.contactName||'').trim());
    if (stillMissing) {
      try {
        const fetched = await fsFetch(cfg.apiKey, cfg.projectId, 'crm_customers');
        if (fetched.length) {
          fetched.forEach(c => { if (!fbAllCustomersRaw.find(x=>x._id===c._id)) fbAllCustomersRaw.push(c); });
          _enrichQuotes(fetched);
        }
      } catch(e) { /* best effort */ }
    }

    // ── Include quote-activities from Fuarbot mobile app ────────
    // Fuarbot stores sent quotes as crm_activities (type:'email', text:'Teklif gönderildi: ANG-...')
    // rather than crm_quotes documents. Merge them in as virtual quote objects.
    const seenNums  = new Set(flat.map(q => q.quoteNumber).filter(Boolean));
    const allCusts  = [...(fbAllCustomersRaw||[]), ...(fbCustomers||[])];
    // Fetch crm_activities AND contacts (embedded timelines) in parallel.
    // The Fuarbot mobile app stores quote-send events in EITHER:
    //   a) crm_activities collection (standalone doc), OR
    //   b) contacts/{id}.timeline[] (embedded array in the contacts collection)
    // We need to check both sources.
    let allActs = [];
    try {
      const [freshActs, contactDocs] = await Promise.all([
        fsFetch(cfg.apiKey, cfg.projectId, 'crm_activities'),
        fsFetch(cfg.apiKey, cfg.projectId, 'contacts').catch(() => []),
      ]);
      // MERGE fresh crm_activities into fbActivities — do NOT reset it.
      // fbFetchContactData already populated fbActivities with embedded timeline
      // entries for contacts the user has opened; resetting would lose that data.
      freshActs.forEach(a => {
        const k = a.parentId||a.contactId||'';
        if (!fbActivities[k]) fbActivities[k] = [];
        if (!fbActivities[k].find(x => x._id === a._id)) fbActivities[k].push(a);
      });
      // Merge embedded contacts/{id}.timeline entries from the contacts collection.
      contactDocs.forEach(contact => {
        const timeline = Array.isArray(contact.timeline) ? contact.timeline : [];
        if (!fbActivities[contact._id]) fbActivities[contact._id] = [];
        timeline.forEach((item, i) => {
          const tid = `tl_${contact._id}_${i}`;
          if (!fbActivities[contact._id].find(x => x._id === tid)) {
            fbActivities[contact._id].push({
              _id:       tid,
              type:      item.type || 'note',
              text:      item.label || item.text || '',
              createdAt: item.timestamp || item.createdAt || '',
              createdBy: item.user || item.createdBy || '',
              contactId: contact._id,
            });
          }
        });
      });
      // allActs = everything we now know about (crm_activities + timelines)
      allActs = Object.values(fbActivities).flat();
    } catch(actErr) {
      console.warn('[Teklifler] activity fetch error:', actErr);
      allActs = Object.values(fbActivities).flat(); // fallback to cache on error
    }
    console.log('[Teklifler] allActs total:', allActs.length, '| seenNums:', [...seenNums]);
    allActs.forEach(a => {
      const txt = a.text || '';
      const lo  = txt.toLowerCase();
      const hasNum    = /[A-Z]{2,}-[\dA-Z]+-\d+/.test(txt);
      const isQuoteAct = a.type === 'quote' || a.type === 'offer' ||
        (a.type === 'email' && (lo.includes('teklif') || lo.includes('angebot'))) || hasNum;
      if (!isQuoteAct) return;
      const numMatch = txt.match(/([A-Z]{2,}-[\dA-Z]+-\d+)/);
      const num = numMatch?.[1];
      console.log('[Teklifler] act candidate:', num, '| dup?', seenNums.has(num), '| type:', a.type, '| txt:', txt.slice(0,60));
      if (num && seenNums.has(num)) return;   // already in crm_quotes
      if (num) seenNums.add(num);
      // Parse amount + currency
      const amtMatch = txt.match(/([\d.]+,\d{2})\s*(EUR|€|\$|₺|USD|TRY)/);
      const amt = amtMatch ? parseFloat(amtMatch[1].replace(/\./g,'').replace(',','.')) : 0;
      const curMap = { '€':'EUR', '₺':'TRY', '$':'USD' };
      const cur = curMap[amtMatch?.[2]] || amtMatch?.[2] || 'EUR';
      // Parse product (between first and second '|')
      const parts = txt.split('|').map(s => s.trim());
      const product = parts[1] || '';
      // Parse recipient email  (An: ...)
      const emailMatch = txt.match(/\(An:\s*([^\)]+)\)/i);
      const contactEmail = emailMatch?.[1]?.trim() || '';
      // Look up contact
      const cust = (contactEmail
        ? allCusts.find(c => (c.email||'').toLowerCase() === contactEmail.toLowerCase())
        : null) || allCusts.find(c => c._id === (a.contactId||a.parentId||''));
      // Resolve creator display name
      let createdByName = a.createdBy || '';
      if (fbUsersData?.length) {
        const u = fbUsersData.find(u =>
          (a.createdByUid && u._id === a.createdByUid) ||
          (a.createdBy && (u.email||'').toLowerCase() === a.createdBy.toLowerCase())
        );
        if (u) createdByName = u.name || u.email || createdByName;
      }
      flat.push({
        _id:            a._id,
        _fromActivity:  true,
        quoteNumber:    num || '',
        contactId:      a.contactId || a.parentId || '',
        contactName:    cust?.name || '',
        contactCompany: cust?.company || cust?.companyName || '',
        contactEmail:   contactEmail || cust?.email || '',
        createdBy:      createdByName,
        createdAt:      a.createdAt || a.timestamp || '',
        status:         'sent',
        totalNet:       amt,
        currency:       cur,
        lines:          product ? [{ product, qty: 1, unitPrice: amt, total: amt }] : [],
        _activityText:  txt,
      });
    });

    // Sort newest first
    tkAllQuotes = flat.sort((a, b) => (b.createdAt || '') > (a.createdAt || '') ? 1 : -1);
    renderTeklifler();
  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger">Hata: ${esc(e.message)}</div>`;
  }
}

function tkSetFilter(f) {
  tkFilterDate = f;
  document.querySelectorAll('#tk-filter-bar .fbd-filter-btn').forEach(b => b.classList.remove('active'));
  const btns = document.querySelectorAll('#tk-filter-bar .fbd-filter-btn');
  const idx  = ['all','today','week','month','year','custom'].indexOf(f);
  if (btns[idx]) btns[idx].classList.add('active');
  const cr = document.getElementById('tk-custom-range');
  if (cr) cr.style.display = f === 'custom' ? 'flex' : 'none';
  if (f !== 'custom') renderTeklifler();
}

function tkCustomChange() {
  tkFilterFrom = document.getElementById('tk-date-from')?.value || '';
  tkFilterTo   = document.getElementById('tk-date-to')?.value   || '';
  renderTeklifler();
}

function tkSearch(q) {
  tkSearchQ = q.toLowerCase().trim();
  renderTeklifler();
}

function tkGetDateRange() {
  const now   = new Date();
  const yy    = now.getFullYear(), mm = now.getMonth(), dd = now.getDate();
  if (tkFilterDate === 'today')  return { from: new Date(yy, mm, dd), to: new Date(yy, mm, dd, 23, 59, 59) };
  if (tkFilterDate === 'week')   { const d = new Date(now); d.setDate(dd - d.getDay() + 1); d.setHours(0,0,0,0); return { from: d, to: new Date(yy, mm, dd, 23, 59, 59) }; }
  if (tkFilterDate === 'month')  return { from: new Date(yy, mm, 1), to: new Date(yy, mm, dd, 23, 59, 59) };
  if (tkFilterDate === 'year')   return { from: new Date(yy, 0, 1), to: new Date(yy, mm, dd, 23, 59, 59) };
  if (tkFilterDate === 'custom') return { from: tkFilterFrom ? new Date(tkFilterFrom) : null, to: tkFilterTo ? new Date(tkFilterTo + 'T23:59:59') : null };
  return { from: null, to: null };
}

function renderTeklifler() {
  const el = document.getElementById('teklifler-content');
  const { from, to } = tkGetDateRange();

  let filtered = tkAllQuotes.filter(q => {
    // Date filter
    if (from || to) {
      const d = q.createdAt ? new Date(q.createdAt) : null;
      if (!d) return false;
      if (from && d < from) return false;
      if (to   && d > to)   return false;
    }
    // Search filter
    if (tkSearchQ) {
      const haystack = [q.quoteNumber, q.contactName, q.contactCompany, q.product, q.createdBy]
        .join(' ').toLowerCase();
      if (!haystack.includes(tkSearchQ)) return false;
    }
    return true;
  });

  if (!tkAllQuotes.length) {
    el.innerHTML = `<div class="alert alert-info d-flex align-items-center gap-3"><i class="bi bi-info-circle fs-5"></i><div>Henüz teklif yok. <strong>Yeni Teklif</strong> butonu ile ilk teklifinizi oluşturun veya Fuarbot'tan teklifler yüklensin.</div><button class="btn btn-sm btn-primary ms-auto" onclick="tkNewQuote()"><i class="bi bi-plus me-1"></i>Yeni Teklif</button><button class="btn btn-sm btn-outline-secondary" onclick="loadTeklifler()"><i class="bi bi-arrow-clockwise"></i></button></div>`;
    return;
  }
  if (!filtered.length) {
    el.innerHTML = `<div class="text-muted p-3 text-center"><i class="bi bi-search me-2"></i>Filtre kriterlerine uyan teklif bulunamadı.</div>`;
    return;
  }

  const totalRev = filtered.reduce((s, q) => s + Number(q.totalNet || 0), 0);
  const currSym  = q => ({ EUR: '€', USD: '$', TRY: '₺' }[q.currency] || q.currency || '€');

  el.innerHTML = `
    <div class="d-flex gap-3 mb-3 flex-wrap">
      <div class="fbd-kpi-card fbd-kpi-blue" style="flex:1;min-width:140px;padding:12px 16px;">
        <div class="fbd-kpi-val">${filtered.length}</div>
        <div class="fbd-kpi-lbl">Teklif</div>
      </div>
      <div class="fbd-kpi-card fbd-kpi-green" style="flex:1;min-width:140px;padding:12px 16px;">
        <div class="fbd-kpi-val">${totalRev.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</div>
        <div class="fbd-kpi-lbl">Toplam Tutar</div>
      </div>
      <div class="fbd-kpi-card fbd-kpi-amber" style="flex:1;min-width:140px;padding:12px 16px;">
        <div class="fbd-kpi-val">${filtered.filter(q => (q.status||'') === 'sent').length}</div>
        <div class="fbd-kpi-lbl">Gönderildi</div>
      </div>
    </div>
    <div class="card">
      <div class="table-responsive">
        <table class="table table-hover mb-0" style="font-size:13px;">
          <thead class="table-light">
            <tr>
              <th>Teklif No</th>
              <th>Müşteri</th>
              <th>Ürün</th>
              <th>Tarih</th>
              <th>Tutar</th>
              <th>Durum</th>
              <th style="width:230px;"></th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(q => tkRenderRow(q)).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function tkRenderRow(q) {
  const date    = q.createdAt ? new Date(q.createdAt).toLocaleDateString('tr-TR') : '—';
  const num     = esc(q.quoteNumber || q._id?.slice(0,8) || '—');
  const cust    = esc(q.contactName || q.contactCompany || '—');
  const prod    = esc(q.product || (q.lines?.[0]?.product) || '—');
  const sym     = { EUR: '€', USD: '$', TRY: '₺' }[q.currency] || '€';
  const total   = Number(q.totalNet || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const status  = q.status === 'sent'
    ? '<span class="badge bg-success-subtle text-success border border-success-subtle">Gönderildi</span>'
    : '<span class="badge bg-secondary-subtle text-secondary border">Taslak</span>';

  // Quotes that originated from the Fuarbot mobile app (stored as crm_activities)
  // are read-only — no edit/delete/print (we don't have the full data)
  if (q._fromActivity) {
    const appBadge = '<span class="badge bg-warning-subtle text-warning border border-warning-subtle ms-1" title="Fuarbot uygulamasından gönderildi"><i class="bi bi-phone"></i> App</span>';
    return `<tr>
      <td class="fw-semibold" style="font-family:monospace;">${num}${appBadge}</td>
      <td>${cust}</td>
      <td class="text-truncate" style="max-width:160px;" title="${prod}">${prod}</td>
      <td>${date}</td>
      <td class="fw-semibold">${total} ${sym}</td>
      <td>${status}</td>
      <td><span class="text-muted small"><i class="bi bi-phone me-1"></i>Fuarbot App</span></td>
    </tr>`;
  }

  const pdfBtn  = q.pdfUrl
    ? `<a href="${esc(q.pdfUrl)}" target="_blank" class="btn btn-sm btn-outline-danger me-1" title="PDF İndir"><i class="bi bi-file-earmark-pdf"></i></a>`
    : `<button class="btn btn-sm btn-outline-danger me-1" title="PDF Yazdır" onclick="tkPrintQuote('${esc(q._id)}')"><i class="bi bi-printer"></i></button>`;
  return `<tr>
    <td class="fw-semibold" style="font-family:monospace;">${num}</td>
    <td>${cust}</td>
    <td class="text-truncate" style="max-width:160px;" title="${prod}">${prod}</td>
    <td>${date}</td>
    <td class="fw-semibold">${total} ${sym}</td>
    <td>${status}</td>
    <td>
      <button class="btn btn-sm btn-outline-primary me-1" onclick="tkViewDetail('${esc(q._id)}')" title="Detay"><i class="bi bi-eye-fill"></i></button>
      ${pdfBtn}
      <button class="btn btn-sm btn-outline-secondary me-1" onclick="tkEmailQuote('${esc(q._id)}')" title="E-posta"><i class="bi bi-envelope-fill"></i></button>
      <button class="btn btn-sm btn-outline-success me-1" onclick="tkToFatura('${esc(q._id)}')" title="Fatura Oluştur"><i class="bi bi-receipt"></i></button>
      <button class="btn btn-sm btn-outline-warning me-1" onclick="tkEditQuote('${esc(q._id)}')" title="Düzenle"><i class="bi bi-pencil-fill"></i></button>
      <button class="btn btn-sm btn-outline-danger" onclick="tkDeleteQuote('${esc(q._id)}')" title="Sil"><i class="bi bi-trash-fill"></i></button>
    </td>
  </tr>`;
}

function tkFindQuote(id) {
  return tkAllQuotes.find(q => q._id === id);
}

function tkViewDetail(id) {
  const q = tkFindQuote(id);
  if (!q) return;
  const sym  = { EUR: '€', USD: '$', TRY: '₺' }[q.currency] || '€';
  const date = q.createdAt ? new Date(q.createdAt).toLocaleDateString('tr-TR', { day:'2-digit', month:'long', year:'numeric' }) : '—';
  const sentDate = q.sentAt ? new Date(q.sentAt).toLocaleDateString('tr-TR') : null;
  const linesHtml = (q.lines || []).length
    ? `<table class="table table-sm mb-0" style="font-size:12px;">
        <thead class="table-light"><tr><th>Ürün</th><th>Açıklama</th><th>Miktar</th><th>Birim</th><th>Fiyat</th><th>Toplam</th></tr></thead>
        <tbody>${(q.lines || []).map(l => {
          const rowTotal = (parseFloat(l.qty) || 0) * (parseFloat(l.unitPrice) || 0);
          return `<tr>
            <td class="fw-semibold">${esc(l.product || '')}</td>
            <td class="text-muted">${esc(l.description || '')}</td>
            <td>${esc(String(l.qty || ''))}</td>
            <td>${esc(l.unit || 'Stk.')}</td>
            <td>${Number(l.unitPrice || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })} ${sym}</td>
            <td class="fw-semibold">${rowTotal.toLocaleString('de-DE', { minimumFractionDigits: 2 })} ${sym}</td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot class="table-light">
          <tr><td colspan="5" class="text-end fw-bold">Toplam</td>
          <td class="fw-bold">${Number(q.totalNet||0).toLocaleString('de-DE',{minimumFractionDigits:2})} ${sym}</td></tr>
        </tfoot>
      </table>`
    : `<p class="text-muted small">Kalem bilgisi yok.</p>`;

  document.getElementById('tk-modal-title').textContent = `Teklif ${q.quoteNumber || q._id?.slice(0,8) || ''}`;
  document.getElementById('tk-modal-body').innerHTML = `
    <div class="row g-3 mb-3">
      <div class="col-md-6">
        <div class="card h-100 border-0 bg-light p-3">
          <div class="fw-semibold mb-2 text-muted small text-uppercase">Müşteri</div>
          <div class="fw-bold">${esc(q.contactName || '—')}</div>
          ${q.contactCompany ? `<div class="text-muted small">${esc(q.contactCompany)}</div>` : ''}
          ${q.contactEmail   ? `<div><a href="mailto:${esc(q.contactEmail)}">${esc(q.contactEmail)}</a></div>` : ''}
          ${q.contactPhone   ? `<div class="text-muted small">${esc(q.contactPhone)}</div>` : ''}
          ${q.contactAddress ? `<div class="text-muted small">${esc(q.contactAddress)}</div>` : ''}
        </div>
      </div>
      <div class="col-md-6">
        <div class="card h-100 border-0 bg-light p-3">
          <div class="fw-semibold mb-2 text-muted small text-uppercase">Teklif Bilgileri</div>
          <div><span class="text-muted small">Tarih:</span> <strong>${date}</strong></div>
          ${sentDate ? `<div><span class="text-muted small">Gönderildi:</span> <strong>${sentDate}</strong></div>` : ''}
          <div><span class="text-muted small">Oluşturan:</span> <strong>${esc(q.createdBy || '—')}</strong></div>
          <div><span class="text-muted small">Durum:</span> ${q.status === 'sent'
            ? '<span class="badge bg-success">Gönderildi</span>'
            : '<span class="badge bg-secondary">Taslak</span>'}</div>
          <div class="mt-2"><span class="text-muted small">Toplam:</span> <span class="fw-bold fs-5">${Number(q.totalNet||0).toLocaleString('de-DE',{minimumFractionDigits:2})} ${sym}</span></div>
        </div>
      </div>
    </div>
    <div class="card border-0">
      <div class="card-header bg-light py-2 fw-semibold small text-uppercase">Kalemler</div>
      ${linesHtml}
    </div>`;
  document.getElementById('tk-modal-footer').innerHTML = `
    ${q.pdfUrl
      ? `<a href="${esc(q.pdfUrl)}" target="_blank" class="btn btn-danger btn-sm"><i class="bi bi-file-earmark-pdf me-1"></i>PDF İndir</a>`
      : `<button class="btn btn-danger btn-sm" onclick="tkPrintQuote('${esc(q._id)}')"><i class="bi bi-printer me-1"></i>Yazdır / PDF</button>`}
    <button class="btn btn-outline-secondary btn-sm" onclick="tkEmailQuote('${esc(q._id)}')"><i class="bi bi-envelope me-1"></i>E-posta</button>
    <button class="btn btn-success btn-sm" onclick="tkToFatura('${esc(q._id)}');bootstrap.Modal.getInstance(document.getElementById('teklifDetailModal'))?.hide()"><i class="bi bi-receipt me-1"></i>Fatura Oluştur</button>
    <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Kapat</button>`;
  new bootstrap.Modal(document.getElementById('teklifDetailModal')).show();
}

function tkEmailQuote(id) {
  const q = tkFindQuote(id);
  if (!q) return;
  const sym   = { EUR: '€', USD: '$', TRY: '₺' }[q.currency] || '€';
  const total = Number(q.totalNet || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 });
  const subj  = encodeURIComponent(`Teklif ${q.quoteNumber || ''} – ${q.contactCompany || q.contactName || ''}`);
  const body  = encodeURIComponent(
    `Sayın ${q.contactName || 'Müşteri'},\n\nTeklif No: ${q.quoteNumber || '—'}\nToplam: ${total} ${sym}\n\nEk bilgi için lütfen iletişime geçin.\n\nSaygılarımızla,\nWindoform`
  );
  const to = q.contactEmail ? encodeURIComponent(q.contactEmail) : '';
  window.open(`mailto:${to}?subject=${subj}&body=${body}`, '_blank');
}

function tkPrintQuote(id) {
  const q = tkFindQuote(id);
  if (!q) return;
  const sym = { EUR: '€', USD: '$', TRY: '₺' }[q.currency] || '€';
  const linesHtml = (q.lines || []).map(l => {
    const t = (parseFloat(l.qty) || 0) * (parseFloat(l.unitPrice) || 0);
    return `<tr><td>${esc(l.product||'')}</td><td>${esc(l.description||'')}</td><td>${esc(String(l.qty||''))}</td><td>${esc(l.unit||'Stk.')}</td><td style="text-align:right">${Number(l.unitPrice||0).toLocaleString('de-DE',{minimumFractionDigits:2})} ${sym}</td><td style="text-align:right;font-weight:bold">${t.toLocaleString('de-DE',{minimumFractionDigits:2})} ${sym}</td></tr>`;
  }).join('');
  const date = q.createdAt ? new Date(q.createdAt).toLocaleDateString('tr-TR') : '—';
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Teklif ${esc(q.quoteNumber||'')}</title>
  <style>body{font-family:Arial,sans-serif;font-size:13px;color:#1a1a1a;padding:40px}h1{font-size:22px;margin-bottom:4px}
  .header{display:flex;justify-content:space-between;margin-bottom:32px}.meta{font-size:12px;color:#666}
  .customer{background:#f8f9fa;padding:16px;border-radius:6px;margin-bottom:24px}
  table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#f1f3f5;padding:8px;text-align:left;font-size:11px;text-transform:uppercase}
  td{padding:8px;border-bottom:1px solid #e9ecef}.total-row td{font-weight:bold;font-size:15px;border-top:2px solid #333}
  @media print{body{padding:20px}button{display:none}}</style></head><body>
  <div class="header"><div><h1>TEKLİF</h1><div class="meta">No: <strong>${esc(q.quoteNumber||q._id?.slice(0,8)||'')}</strong> &nbsp;|&nbsp; Tarih: <strong>${date}</strong></div></div>
  <div style="text-align:right"><div style="font-size:18px;font-weight:800;color:#1a56db">WINDOFORM</div></div></div>
  <div class="customer"><strong>${esc(q.contactName||'')}</strong>${q.contactCompany?`<br>${esc(q.contactCompany)}`:''}${q.contactEmail?`<br>${esc(q.contactEmail)}`:''}${q.contactPhone?`<br>${esc(q.contactPhone)}`:''}${q.contactAddress?`<br>${esc(q.contactAddress)}`:''}</div>
  <table><thead><tr><th>Ürün</th><th>Açıklama</th><th>Miktar</th><th>Birim</th><th style="text-align:right">Birim Fiyat</th><th style="text-align:right">Toplam</th></tr></thead>
  <tbody>${linesHtml}</tbody>
  <tfoot>
  ${q.vatRate > 0 ? `<tr><td colspan="5" style="text-align:right;font-size:12px;color:#555">Ara Toplam</td><td style="text-align:right;font-size:12px">${Number(q.totalNet||0).toLocaleString('de-DE',{minimumFractionDigits:2})} ${sym}</td></tr>
  <tr><td colspan="5" style="text-align:right;font-size:12px;color:#555">KDV (${q.vatRate}%)</td><td style="text-align:right;font-size:12px">${Number(q.vatAmount||0).toLocaleString('de-DE',{minimumFractionDigits:2})} ${sym}</td></tr>` : `<tr><td colspan="5" style="text-align:right;font-size:12px;color:#0a7a4b;font-style:italic">KDV Muaf (Yurtdışı İhracat)</td><td style="text-align:right;font-size:12px;color:#0a7a4b">%0</td></tr>`}
  <tr class="total-row"><td colspan="5" style="text-align:right">GENEL TOPLAM</td><td style="text-align:right">${Number(q.vatRate > 0 ? (q.totalGross||q.totalNet||0) : (q.totalNet||0)).toLocaleString('de-DE',{minimumFractionDigits:2})} ${sym}</td></tr></tfoot>
  </table><br><button onclick="window.print()">🖨️ Yazdır / PDF Olarak Kaydet</button></body></html>`);
  w.document.close();
}

function tkToFatura(id) {
  const q = tkFindQuote(id);
  if (!q) return;
  showPage('fatura');
  loadFatura(q);
}

// ── Teklif create / edit ──────────────────────────────────────
let tkEditingId = null; // null = new quote

function _tkAutoQuoteNum() {
  const d = new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  const rnd = String(Math.floor(Math.random()*900)+100);
  return `TKL-${yy}${mm}${dd}-${rnd}`;
}

// ── Teklif formu: Firmalar datalist + otomatik doldur ────────
let _tkAllCompanies  = [];
let _tkAllContacts   = [];

function _tkMarketChange() {
  const market = document.getElementById('tk-edit-market')?.value;
  const vatEl  = document.getElementById('tk-edit-vat');
  if (!vatEl) return;
  vatEl.value = market === 'export' ? '0' : '20';
  tkModalRecalc();
}

async function _tkPopulateDataLists() {
  try {
    const [companies, contacts] = await Promise.all([
      dbAll('companies'),
      dbAll('contacts'),
    ]);
    _tkAllCompanies = companies || [];
    _tkAllContacts  = contacts  || [];

    // Company datalist
    const cdl = document.getElementById('tk-company-datalist');
    if (cdl) {
      cdl.innerHTML = _tkAllCompanies.map(co => `<option value="${esc(co.name)}">`).join('');
    }
    // Contact datalist (name)
    const ndl = document.getElementById('tk-contact-datalist');
    if (ndl) {
      ndl.innerHTML = _tkAllContacts.map(cn => `<option value="${esc(cn.name)}">`).join('');
    }
  } catch(e) {}
}

function _tkBuildAddr(co) {
  return [co.address, co.district, co.city, co.postcode].filter(Boolean).join(', ');
}

function _tkFillFromCompany(co, overwrite) {
  const fill = (id, v) => {
    const el = document.getElementById(id);
    if (!el || !v) return;
    if (overwrite || !el.value.trim()) el.value = v;
  };
  fill('tk-edit-cemail', co.email);
  fill('tk-edit-cphone', co.phone || co.phoneNormalized);
  const addr = _tkBuildAddr(co);
  fill('tk-edit-caddr', addr);
}

function _tkCompanyPick() {
  const val = (document.getElementById('tk-edit-ccompany')?.value || '').trim().toLowerCase();
  if (!val) return;
  const co = _tkAllCompanies.find(c => (c.name||'').toLowerCase() === val)
          || _tkAllCompanies.find(c => (c.name||'').toLowerCase().startsWith(val));
  if (!co) return;
  _tkFillFromCompany(co, true);   // overwrite — user explicitly picked this company
}

function _tkContactPick() {
  const val = (document.getElementById('tk-edit-cname')?.value || '').trim().toLowerCase();
  if (!val) return;
  const cn = _tkAllContacts.find(c => (c.name||'').toLowerCase() === val)
          || _tkAllContacts.find(c => (c.name||'').toLowerCase().startsWith(val));
  if (!cn) return;
  const fill = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
  fill('tk-edit-cemail', cn.email);
  fill('tk-edit-cphone', cn.phone);
  // Fill from linked company (address + fallback email/phone)
  if (cn.companyId && _tkAllCompanies.length) {
    const co = _tkAllCompanies.find(c => c.id === cn.companyId);
    if (co) {
      fill('tk-edit-ccompany', co.name);
      _tkFillFromCompany(co, false);  // don't overwrite contact's own email/phone
    }
  }
}

function tkNewQuote() {
  _tkPopulateDataLists();   // load Firmalar + Kişiler into datalists
  tkEditingId = null;
  document.getElementById('tk-edit-title').textContent = 'Yeni Teklif';
  document.getElementById('tk-edit-num').value   = _tkAutoQuoteNum();
  document.getElementById('tk-edit-date').value  = new Date().toISOString().slice(0,10);
  document.getElementById('tk-edit-currency').value = 'EUR';
  document.getElementById('tk-edit-market').value   = 'domestic';
  document.getElementById('tk-edit-vat').value      = '20';
  document.getElementById('tk-edit-status').value   = 'draft';
  document.getElementById('tk-edit-cname').value    = '';
  document.getElementById('tk-edit-ccompany').value = '';
  document.getElementById('tk-edit-cemail').value   = '';
  document.getElementById('tk-edit-cphone').value   = '';
  document.getElementById('tk-edit-caddr').value    = '';
  document.getElementById('tk-edit-notes').value    = '';
  document.getElementById('tk-edit-lines').innerHTML = '';
  tkAddModalLine();   // start with one blank line
  tkModalRecalc();
  new bootstrap.Modal(document.getElementById('teklifEditModal')).show();
}

function tkEditQuote(id) {
  _tkPopulateDataLists();   // load Firmalar + Kişiler into datalists
  const q = tkFindQuote(id);
  if (!q) return;
  tkEditingId = id;
  document.getElementById('tk-edit-title').textContent = `Teklif Düzenle — ${q.quoteNumber || id.slice(0,8)}`;
  document.getElementById('tk-edit-num').value      = q.quoteNumber  || '';
  document.getElementById('tk-edit-date').value     = q.createdAt ? q.createdAt.slice(0,10) : new Date().toISOString().slice(0,10);
  document.getElementById('tk-edit-currency').value = q.currency     || 'EUR';
  document.getElementById('tk-edit-market').value   = q.market       || (q.vatRate === 0 ? 'export' : 'domestic');
  document.getElementById('tk-edit-vat').value      = q.vatRate      != null ? String(q.vatRate) : '20';
  document.getElementById('tk-edit-status').value   = q.status       || 'draft';
  document.getElementById('tk-edit-cname').value    = q.contactName    || '';
  document.getElementById('tk-edit-ccompany').value = q.contactCompany || '';
  document.getElementById('tk-edit-cemail').value   = q.contactEmail   || '';
  document.getElementById('tk-edit-cphone').value   = q.contactPhone   || '';
  document.getElementById('tk-edit-caddr').value    = q.contactAddress || '';
  document.getElementById('tk-edit-notes').value    = q.notes          || '';
  const tbody = document.getElementById('tk-edit-lines');
  tbody.innerHTML = '';
  const lines = q.lines && q.lines.length ? q.lines : [];
  if (lines.length) { lines.forEach(l => tkAddModalLine(l)); }
  else              { tkAddModalLine(); }
  tkModalRecalc();
  new bootstrap.Modal(document.getElementById('teklifEditModal')).show();
}

function tkAddModalLine(line) {
  const tbody = document.getElementById('tk-edit-lines');
  const i = tbody.querySelectorAll('tr').length;
  const sym = { EUR: '€', USD: '$', TRY: '₺' }[document.getElementById('tk-edit-currency')?.value] || '€';
  const row = document.createElement('tr');
  row.dataset.lineIdx = i;
  row.innerHTML = `
    <td><input type="text" class="form-control form-control-sm tk-l-prod" value="${esc(line?.product||'')}" oninput="tkModalRecalc()"></td>
    <td><input type="text" class="form-control form-control-sm tk-l-desc" value="${esc(line?.description||'')}"></td>
    <td><input type="number" class="form-control form-control-sm tk-l-qty" value="${line?.qty ?? 1}" min="0" oninput="tkModalRecalc()"></td>
    <td><input type="text" class="form-control form-control-sm tk-l-unit" value="${esc(line?.unit||'Stk.')}"></td>
    <td><input type="number" class="form-control form-control-sm tk-l-price" value="${Number(line?.unitPrice||0).toFixed(2)}" min="0" step="0.01" oninput="tkModalRecalc()"></td>
    <td class="text-end fw-semibold tk-l-total small">0,00 ${sym}</td>
    <td><button class="btn btn-sm btn-link text-danger p-0" onclick="tkRemoveModalLine(this)" title="Kaldır"><i class="bi bi-x-lg"></i></button></td>`;
  tbody.appendChild(row);
  tkModalRecalc();
}

function tkRemoveModalLine(btn) {
  btn.closest('tr').remove();
  tkModalRecalc();
}

function tkModalRecalc() {
  const vatPct = parseFloat(document.getElementById('tk-edit-vat')?.value || 19);
  const sym    = { EUR: '€', USD: '$', TRY: '₺' }[document.getElementById('tk-edit-currency')?.value] || '€';
  const fmt    = n => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let subtotal = 0;
  document.querySelectorAll('#tk-edit-lines tr').forEach(row => {
    const qty   = parseFloat(row.querySelector('.tk-l-qty')?.value   || 0);
    const price = parseFloat(row.querySelector('.tk-l-price')?.value || 0);
    const lineTotal = qty * price;
    subtotal += lineTotal;
    const td = row.querySelector('.tk-l-total');
    if (td) td.textContent = `${fmt(lineTotal)} ${sym}`;
  });
  const vatAmt = subtotal * (vatPct / 100);
  const total  = subtotal + vatAmt;
  if (document.getElementById('tk-edit-subtotal')) document.getElementById('tk-edit-subtotal').textContent = `${fmt(subtotal)} ${sym}`;
  if (document.getElementById('tk-edit-vatpct'))   document.getElementById('tk-edit-vatpct').textContent  = vatPct;
  if (document.getElementById('tk-edit-vatamt'))   document.getElementById('tk-edit-vatamt').textContent  = `${fmt(vatAmt)} ${sym}`;
  if (document.getElementById('tk-edit-total'))    document.getElementById('tk-edit-total').textContent   = `${fmt(total)} ${sym}`;
}

async function tkSaveQuote() {
  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId) { toast('Firebase yapılandırması eksik.', 'error'); return; }

  // Collect values
  const quoteNumber   = document.getElementById('tk-edit-num').value.trim()       || _tkAutoQuoteNum();
  const dateVal       = document.getElementById('tk-edit-date').value             || new Date().toISOString().slice(0,10);
  const currency      = document.getElementById('tk-edit-currency').value         || 'EUR';
  const market        = document.getElementById('tk-edit-market').value           || 'domestic';
  const vatRate       = parseFloat(document.getElementById('tk-edit-vat').value   || 20);
  const status        = document.getElementById('tk-edit-status').value           || 'draft';
  const contactName   = document.getElementById('tk-edit-cname').value.trim();
  const contactCompany= document.getElementById('tk-edit-ccompany').value.trim();
  const contactEmail  = document.getElementById('tk-edit-cemail').value.trim();
  const contactPhone  = document.getElementById('tk-edit-cphone').value.trim();
  const contactAddress= document.getElementById('tk-edit-caddr').value.trim();
  const notes         = document.getElementById('tk-edit-notes').value.trim();

  // Collect lines
  const lines = [];
  let subtotal = 0;
  document.querySelectorAll('#tk-edit-lines tr').forEach(row => {
    const product     = row.querySelector('.tk-l-prod')?.value.trim()  || '';
    const description = row.querySelector('.tk-l-desc')?.value.trim()  || '';
    const qty         = parseFloat(row.querySelector('.tk-l-qty')?.value   || 0);
    const unit        = row.querySelector('.tk-l-unit')?.value.trim() || 'Stk.';
    const unitPrice   = parseFloat(row.querySelector('.tk-l-price')?.value || 0);
    const total       = qty * unitPrice;
    subtotal += total;
    if (product || qty) lines.push({ product, description, qty, unit, unitPrice, total });
  });
  const vatAmt   = subtotal * (vatRate / 100);
  const totalNet = subtotal;       // net before VAT (matches existing field name)
  const totalGross = subtotal + vatAmt;

  const now = new Date().toISOString();
  const createdAt = tkEditingId
    ? (tkFindQuote(tkEditingId)?.createdAt || now)
    : now;

  // Build Firestore fields
  const toStr = v => ({ stringValue: String(v ?? '') });
  const toNum = v => ({ doubleValue: Number(v  ?? 0) });
  const toArr = arr => ({
    arrayValue: {
      values: arr.map(l => ({
        mapValue: {
          fields: {
            product:     toStr(l.product),
            description: toStr(l.description),
            qty:         toNum(l.qty),
            unit:        toStr(l.unit),
            unitPrice:   toNum(l.unitPrice),
            total:       toNum(l.total),
          }
        }
      }))
    }
  });

  const fields = {
    quoteNumber:     toStr(quoteNumber),
    createdAt:       toStr(createdAt),
    updatedAt:       toStr(now),
    currency:        toStr(currency),
    market:          toStr(market),
    vatRate:         toNum(vatRate),
    status:          toStr(status),
    contactName:     toStr(contactName),
    contactCompany:  toStr(contactCompany),
    contactEmail:    toStr(contactEmail),
    contactPhone:    toStr(contactPhone),
    contactAddress:  toStr(contactAddress),
    notes:           toStr(notes),
    product:         toStr(lines[0]?.product || ''),
    lines:           toArr(lines),
    totalNet:        toNum(totalNet),
    totalGross:      toNum(totalGross),
    vatAmount:       toNum(vatAmt),
    source:          toStr('manual'),
    createdBy:       tkEditingId
      ? toStr(tkFindQuote(tkEditingId)?.createdBy || (typeof authEmail==='function'?authEmail():'manual'))
      : toStr(typeof authEmail==='function' ? (authEmail()||'manual') : 'manual'),
  };

  const base = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/crm_quotes`;
  const token = (typeof authToken === 'function') ? await authToken() : null;
  const authH = token ? { 'Authorization': `Bearer ${token}` } : {};

  try {
    let docId;
    if (tkEditingId) {
      // PATCH existing
      const res = await fetch(`${base}/${tkEditingId}?key=${cfg.apiKey}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message||'HTTP '+res.status); }
      docId = tkEditingId;
      // Update local list
      const idx = tkAllQuotes.findIndex(q => q._id === tkEditingId);
      if (idx >= 0) tkAllQuotes[idx] = { _id: docId, quoteNumber, createdAt, updatedAt: now, currency, vatRate, status, contactName, contactCompany, contactEmail, contactPhone, contactAddress, notes, product: lines[0]?.product||'', lines, totalNet, totalGross, vatAmount: vatAmt, source: 'manual' };
      toast(`✓ Teklif güncellendi: ${quoteNumber}`, 'success');
    } else {
      // POST new
      const res = await fetch(`${base}?key=${cfg.apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message||'HTTP '+res.status); }
      const data = await res.json();
      docId = data.name?.split('/').pop() || ('tk_'+Date.now());
      const newQ = { _id: docId, quoteNumber, createdAt, updatedAt: now, currency, vatRate, status, contactName, contactCompany, contactEmail, contactPhone, contactAddress, notes, product: lines[0]?.product||'', lines, totalNet, totalGross, vatAmount: vatAmt, source: 'manual', createdBy: window._currentUserName || 'manual' };
      tkAllQuotes.unshift(newQ);
      // Also update fbQuotes cache so dashboard sees the new quote immediately
      const ck = '';
      (fbQuotes[ck] || (fbQuotes[ck] = [])).unshift(newQ);
      toast(`✓ Teklif oluşturuldu: ${quoteNumber}`, 'success');
    }
    bootstrap.Modal.getInstance(document.getElementById('teklifEditModal'))?.hide();
    renderTeklifler();
    // Refresh dashboard quote count
    if (typeof renderFuarDashboard === 'function') renderFuarDashboard();
    if (typeof _loadFuarbotDashStats === 'function') _loadFuarbotDashStats();
  } catch(e) { toast('Hata: ' + e.message, 'error'); }
}

async function tkDeleteQuote(id) {
  const q = tkFindQuote(id);
  const num = q?.quoteNumber || id.slice(0,8);
  if (!confirm(`"${num}" numaralı teklifi silmek istediğinize emin misiniz?`)) return;
  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId) return;
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/crm_quotes/${id}?key=${cfg.apiKey}`,
      { method: 'DELETE' }
    );
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message||'HTTP '+res.status); }
    tkAllQuotes = tkAllQuotes.filter(x => x._id !== id);
    toast(`✓ Teklif silindi: ${num}`, 'success');
    renderTeklifler();
  } catch(e) { toast('Hata: ' + e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// FATURA (PROVISIONAL)
// ══════════════════════════════════════════════════════════════
let ftCurrentQuote = null;

function ftNewInvoice() {
  // Create a blank quote stub and render an empty invoice
  const today = new Date().toISOString().slice(0,10);
  const rnd   = String(Math.floor(Math.random()*900)+100);
  const num   = `FAT-${today.replace(/-/g,'')}-${rnd}`;
  ftCurrentQuote = {
    _id: null,
    quoteNumber: num,
    contactName: '', contactCompany: '', contactEmail: '',
    contactPhone: '', contactAddress: '',
    currency: 'EUR', vatRate: 19,
    lines: [{ product: '', description: '', qty: 1, unit: 'Stk.', unitPrice: 0 }],
    totalNet: 0,
    notes: '',
    createdAt: today,
    _isManual: true,
  };
  renderFatura();
}

function loadFatura(quote) {
  const el = document.getElementById('fatura-content');
  if (!el) return;
  if (quote) { ftCurrentQuote = quote; }
  if (!ftCurrentQuote) {
    el.innerHTML = `<div class="alert alert-info">
      <i class="bi bi-info-circle me-2"></i>
      Fatura oluşturmak için önce <a href="#" onclick="showPage('teklifler');return false;"><strong>Teklifler</strong></a> sayfasından bir teklif seçin ve <i class="bi bi-receipt"></i> butonuna tıklayın.
    </div>`;
    return;
  }
  renderFatura();
}

function renderFatura() {
  const el = document.getElementById('fatura-content');
  const q  = ftCurrentQuote;
  const sym = { EUR: '€', USD: '$', TRY: '₺' }[q.currency] || '€';
  const today = new Date().toISOString().slice(0, 10);
  const autoFaturaNo = 'F-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-4);

  const linesRows = (q.lines || []).map((l, i) => {
    const rowTotal = (parseFloat(l.qty) || 0) * (parseFloat(l.unitPrice) || 0);
    return `<tr>
      <td><input type="text" class="form-control form-control-sm ft-line-prod" data-i="${i}" value="${esc(l.product||'')}" placeholder="Ürün"></td>
      <td><input type="text" class="form-control form-control-sm ft-line-desc" data-i="${i}" value="${esc(l.description||'')}" placeholder="Açıklama"></td>
      <td><input type="number" class="form-control form-control-sm ft-line-qty" data-i="${i}" value="${l.qty||1}" style="width:70px;" oninput="ftRecalc()"></td>
      <td><input type="text" class="form-control form-control-sm ft-line-unit" data-i="${i}" value="${esc(l.unit||'Stk.')}" style="width:65px;"></td>
      <td><input type="number" class="form-control form-control-sm ft-line-price" data-i="${i}" value="${Number(l.unitPrice||0).toFixed(2)}" style="width:100px;" oninput="ftRecalc()"></td>
      <td class="fw-semibold ft-line-total" style="min-width:90px;">${rowTotal.toLocaleString('de-DE',{minimumFractionDigits:2})} ${sym}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
      <div>
        <span class="badge bg-warning text-dark me-2">Provisional</span>
        <span class="text-muted small">Teklif: <strong>${esc(q.quoteNumber||'—')}</strong></span>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-outline-danger" onclick="ftPrint()"><i class="bi bi-printer me-1"></i>Yazdır / PDF</button>
        <button class="btn btn-sm btn-success" onclick="faturaNetsisSend()" id="ft-netsis-btn" title="Faturayı onayla, stoktan düş ve Netsis'e gönder"><i class="bi bi-cloud-arrow-up me-1"></i>Netsis'e Gönder</button>
        <button class="btn btn-sm btn-outline-secondary" onclick="ftCurrentQuote=null;loadFatura()"><i class="bi bi-x-lg"></i></button>
      </div>
    </div>

    <div class="card" id="fatura-document">
      <div class="card-body p-4">
        <!-- Header -->
        <div class="d-flex justify-content-between align-items-start mb-4">
          <div>
            <h2 class="fw-bold mb-0" style="color:#1a56db;letter-spacing:-0.5px;">WINDOFORM</h2>
            <div class="text-muted small">windoform.de</div>
          </div>
          <div class="text-end">
            <h3 class="fw-bold mb-1">FATURA</h3>
            <div class="row g-2" style="max-width:260px;">
              <div class="col-5 text-muted small text-end">Fatura No:</div>
              <div class="col-7"><input type="text" class="form-control form-control-sm" id="ft-no" value="${esc(autoFaturaNo)}"></div>
              <div class="col-5 text-muted small text-end">Tarih:</div>
              <div class="col-7"><input type="date" class="form-control form-control-sm" id="ft-date" value="${today}"></div>
              <div class="col-5 text-muted small text-end">Vade:</div>
              <div class="col-7"><input type="date" class="form-control form-control-sm" id="ft-due"></div>
            </div>
          </div>
        </div>

        <!-- Customer -->
        <div class="row g-3 mb-4">
          <div class="col-md-6">
            <div class="bg-light rounded p-3">
              <div class="text-muted small fw-semibold text-uppercase mb-2">Fatura Kesilecek</div>
              <input type="text" class="form-control form-control-sm mb-1" id="ft-cust-name" value="${esc(q.contactName||'')}">
              <input type="text" class="form-control form-control-sm mb-1" id="ft-cust-company" value="${esc(q.contactCompany||'')}">
              <input type="email" class="form-control form-control-sm mb-1" id="ft-cust-email" value="${esc(q.contactEmail||'')}">
              <input type="tel" class="form-control form-control-sm mb-1" id="ft-cust-phone" value="${esc(q.contactPhone||'')}">
              <textarea class="form-control form-control-sm" id="ft-cust-addr" rows="2" placeholder="Adres">${esc(q.contactAddress||'')}</textarea>
            </div>
          </div>
          <div class="col-md-6">
            <div class="bg-light rounded p-3 h-100">
              <div class="text-muted small fw-semibold text-uppercase mb-2">Notlar</div>
              <textarea class="form-control form-control-sm" id="ft-notes" rows="5" placeholder="Ödeme koşulları, notlar…">Teklif No: ${esc(q.quoteNumber||'')} referanslıdır.</textarea>
            </div>
          </div>
        </div>

        <!-- Lines -->
        <div class="table-responsive mb-3">
          <table class="table table-sm" id="ft-lines-table">
            <thead class="table-light">
              <tr><th>Ürün</th><th>Açıklama</th><th>Miktar</th><th>Birim</th><th>Birim Fiyat</th><th>Toplam</th></tr>
            </thead>
            <tbody id="ft-lines-tbody">${linesRows}</tbody>
          </table>
        </div>
        <div class="d-flex justify-content-between align-items-center">
          <button class="btn btn-sm btn-outline-secondary" onclick="ftAddLine()"><i class="bi bi-plus me-1"></i>Kalem Ekle</button>
          <div class="text-end">
            <div class="text-muted small">Net Toplam</div>
            <div class="fw-bold fs-4" id="ft-grand-total">${Number(q.totalNet||0).toLocaleString('de-DE',{minimumFractionDigits:2})} ${sym}</div>
            <div class="text-muted small" id="ft-currency-label">${q.currency || 'EUR'}</div>
          </div>
        </div>
      </div>
    </div>`;
}

function ftRecalc() {
  const sym = { EUR: '€', USD: '$', TRY: '₺' }[ftCurrentQuote?.currency] || '€';
  let grand = 0;
  document.querySelectorAll('#ft-lines-tbody tr').forEach((row, i) => {
    const qty   = parseFloat(row.querySelector('.ft-line-qty')?.value  || 0) || 0;
    const price = parseFloat(row.querySelector('.ft-line-price')?.value || 0) || 0;
    const t     = qty * price;
    grand += t;
    const tc = row.querySelector('.ft-line-total');
    if (tc) tc.textContent = t.toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' ' + sym;
  });
  const tot = document.getElementById('ft-grand-total');
  if (tot) tot.textContent = grand.toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' ' + sym;
}

function ftAddLine() {
  const tbody = document.getElementById('ft-lines-tbody');
  if (!tbody) return;
  const i = tbody.querySelectorAll('tr').length;
  const sym = { EUR: '€', USD: '$', TRY: '₺' }[ftCurrentQuote?.currency] || '€';
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="form-control form-control-sm ft-line-prod" data-i="${i}" value="" placeholder="Ürün"></td>
    <td><input type="text" class="form-control form-control-sm ft-line-desc" data-i="${i}" value="" placeholder="Açıklama"></td>
    <td><input type="number" class="form-control form-control-sm ft-line-qty" data-i="${i}" value="1" style="width:70px;" oninput="ftRecalc()"></td>
    <td><input type="text" class="form-control form-control-sm ft-line-unit" data-i="${i}" value="Stk." style="width:65px;"></td>
    <td><input type="number" class="form-control form-control-sm ft-line-price" data-i="${i}" value="0.00" style="width:100px;" oninput="ftRecalc()"></td>
    <td class="fw-semibold ft-line-total">0,00 ${sym}</td>`;
  tbody.appendChild(tr);
}

function ftPrint() {
  const q    = ftCurrentQuote || {};
  const sym  = { EUR: '€', USD: '$', TRY: '₺' }[q.currency] || '€';
  const no   = document.getElementById('ft-no')?.value || '—';
  const date = document.getElementById('ft-date')?.value || '—';
  const due  = document.getElementById('ft-due')?.value || '';
  const cName    = document.getElementById('ft-cust-name')?.value || '';
  const cCompany = document.getElementById('ft-cust-company')?.value || '';
  const cEmail   = document.getElementById('ft-cust-email')?.value || '';
  const cPhone   = document.getElementById('ft-cust-phone')?.value || '';
  const cAddr    = document.getElementById('ft-cust-addr')?.value || '';
  const notes    = document.getElementById('ft-notes')?.value || '';

  let linesHtml = '', grand = 0;
  document.querySelectorAll('#ft-lines-tbody tr').forEach(row => {
    const prod  = row.querySelector('.ft-line-prod')?.value || '';
    const desc  = row.querySelector('.ft-line-desc')?.value || '';
    const qty   = parseFloat(row.querySelector('.ft-line-qty')?.value  || 0);
    const unit  = row.querySelector('.ft-line-unit')?.value || 'Stk.';
    const price = parseFloat(row.querySelector('.ft-line-price')?.value || 0);
    const t     = qty * price;
    grand += t;
    linesHtml += `<tr><td>${esc(prod)}</td><td>${esc(desc)}</td><td>${qty}</td><td>${esc(unit)}</td><td style="text-align:right">${price.toLocaleString('de-DE',{minimumFractionDigits:2})} ${sym}</td><td style="text-align:right;font-weight:bold">${t.toLocaleString('de-DE',{minimumFractionDigits:2})} ${sym}</td></tr>`;
  });

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Fatura ${esc(no)}</title>
  <style>body{font-family:Arial,sans-serif;font-size:13px;color:#1a1a1a;padding:40px;max-width:800px;margin:0 auto}
  .header{display:flex;justify-content:space-between;margin-bottom:32px}.meta table{font-size:12px;border-collapse:collapse}
  .meta td{padding:3px 8px}.meta td:first-child{color:#666;text-align:right}
  .customer{background:#f8f9fa;padding:16px;border-radius:6px;margin-bottom:24px;font-size:13px}
  table.lines{width:100%;border-collapse:collapse;margin-top:8px}
  table.lines th{background:#f1f3f5;padding:8px;text-align:left;font-size:11px;text-transform:uppercase}
  table.lines td{padding:8px;border-bottom:1px solid #e9ecef}
  .total-row td{font-weight:bold;font-size:16px;border-top:2px solid #1a56db;padding-top:12px}
  .notes{margin-top:24px;font-size:12px;color:#666;border-top:1px solid #eee;padding-top:12px}
  .badge{background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:4px;font-size:10px}
  @media print{body{padding:20px}button{display:none}}</style></head><body>
  <div style="text-align:center;margin-bottom:4px;font-size:10px;color:#999;" class="badge">Provisional — Netsis entegrasyonu planlanmaktadır</div>
  <div class="header">
    <div><div style="font-size:22px;font-weight:800;color:#1a56db;margin-bottom:4px">WINDOFORM</div><div style="font-size:11px;color:#666">windoform.de</div></div>
    <div style="text-align:right"><h2 style="margin:0 0 8px">FATURA</h2>
    <table class="meta"><tr><td>Fatura No:</td><td><strong>${esc(no)}</strong></td></tr>
    <tr><td>Tarih:</td><td><strong>${esc(date)}</strong></td></tr>
    ${due ? `<tr><td>Vade:</td><td><strong>${esc(due)}</strong></td></tr>` : ''}
    </table></div>
  </div>
  <div class="customer"><strong>${esc(cName)}</strong>${cCompany?`<br>${esc(cCompany)}`:''}${cEmail?`<br>${esc(cEmail)}`:''}${cPhone?`<br>${esc(cPhone)}`:''}${cAddr?`<br><br>${esc(cAddr).replace(/\n/g,'<br>')}`:''}</div>
  <table class="lines"><thead><tr><th>Ürün</th><th>Açıklama</th><th>Miktar</th><th>Birim</th><th style="text-align:right">Birim Fiyat</th><th style="text-align:right">Toplam</th></tr></thead>
  <tbody>${linesHtml}</tbody>
  <tfoot><tr class="total-row"><td colspan="5" style="text-align:right">NET TOPLAM</td><td style="text-align:right">${grand.toLocaleString('de-DE',{minimumFractionDigits:2})} ${sym}</td></tr></tfoot></table>
  ${notes ? `<div class="notes">${esc(notes).replace(/\n/g,'<br>')}</div>` : ''}
  <br><button onclick="window.print()" style="background:#1a56db;color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:13px;">🖨️ Yazdır / PDF Olarak Kaydet</button>
  </body></html>`);
  w.document.close();
}

// ═══════════════════════════════════════════════════════════
// AYARLAR PAGE — load all saved settings into form fields
// ═══════════════════════════════════════════════════════════
function loadAyarlar() {
  // Firebase fields
  const fbCfg = loadFbConfig();
  if (fbCfg) {
    const s = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    s('fb-api-key',    fbCfg.apiKey);
    s('fb-project-id', fbCfg.projectId);
    s('fb-auth-domain',fbCfg.authDomain);
  }

  // Claude API key
  try {
    const ck = JSON.parse(localStorage.getItem('windoform_cfg') || '{}').claudeKey || '';
    const el = document.getElementById('claude-api-key');
    if (el) el.value = ck;
  } catch { /* ignore */ }

  // Netsis settings
  if (typeof loadNetsisSettingsToForm === 'function') loadNetsisSettingsToForm();

  // Firebase connection status badge
  const badge = document.getElementById('ay-fb-status');
  if (badge) {
    if (fbCfg?.apiKey && fbPollInterval) {
      badge.className = 'badge bg-success ms-auto';
      badge.textContent = 'Bağlı';
    } else if (fbCfg?.apiKey) {
      badge.className = 'badge bg-warning text-dark ms-auto';
      badge.textContent = 'Kayıtlı (bağlanmadı)';
    } else {
      badge.className = 'badge bg-secondary ms-auto';
      badge.textContent = 'Yapılandırılmadı';
    }
  }
}
