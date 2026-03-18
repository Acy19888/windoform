// fuarbot.js — Fuarbot Firebase sync (Firestore REST API, no SDK)
// Collections: crm_customers | crm_activities | crm_quotes

const FB_CFG_KEY = 'crm_fuarbot_firebase_config';
let fbPollInterval = null;
let fbCustomers    = [];
let fbActivities   = {};
let fbQuotes       = {};
let fbSelectedId   = null;

// ── Config ────────────────────────────────────────────────
function loadFbConfig() {
  try { return JSON.parse(localStorage.getItem(FB_CFG_KEY) || 'null'); } catch { return null; }
}
function saveFbConfig(cfg) { localStorage.setItem(FB_CFG_KEY, JSON.stringify(cfg)); }

function showFbConfig() {
  document.getElementById('fb-config-panel').style.display = '';
  document.getElementById('fb-layout').style.display = 'none';
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
    const [customers, activities, quotes] = await Promise.all([
      fsFetch(apiKey, projectId, 'crm_customers'),
      fsFetch(apiKey, projectId, 'crm_activities').catch(()=>[]),
      fsFetch(apiKey, projectId, 'crm_quotes').catch(()=>[]),
    ]);
    fbCustomers = customers;
    fbActivities = {};
    activities.forEach(a => { const k = a.parentId||a.contactId||''; (fbActivities[k]||(fbActivities[k]=[])).push(a); });
    Object.values(fbActivities).forEach(arr => arr.sort((a,b) => (b.createdAt||'') > (a.createdAt||'') ? 1 : -1));
    fbQuotes = {};
    quotes.forEach(q => { const k = q.contactId||''; (fbQuotes[k]||(fbQuotes[k]=[])).push(q); });
    Object.values(fbQuotes).forEach(arr => arr.sort((a,b) => (b.createdAt||'') > (a.createdAt||'') ? 1 : -1));

    setFbStatus('Bağlı · ' + customers.length + ' kişi', 'success');
    document.getElementById('fb-config-panel').style.display = 'none';
    document.getElementById('fb-layout').style.display = '';
    const syncEl = document.getElementById('fb-last-sync');
    if (syncEl) syncEl.textContent = new Date().toLocaleTimeString('tr-TR');
    if (!silent) { renderCustomerList(fbCustomers); if (fbSelectedId) showDetail(fbSelectedId); }
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
      ${phone     ?`<div class="mb-1"><i class="bi bi-telephone me-2 text-primary"></i>${esc(phone)}</div>`:''}
      ${c.email   ?`<div class="mb-1"><i class="bi bi-envelope me-2 text-primary"></i>${esc(c.email)}</div>`:''}
      ${c.website ?`<div class="mb-1"><i class="bi bi-globe me-2 text-primary"></i>${esc(c.website)}</div>`:''}
      ${c.address ?`<div class="mb-1"><i class="bi bi-geo-alt me-2 text-primary"></i>${esc(c.address)}</div>`:''}
      ${c.notes   ?`<div class="mt-2 text-muted border-top pt-2">${esc(c.notes)}</div>`:''}
    </div></div>
    <ul class="nav nav-tabs mb-3">
      <li class="nav-item"><a class="nav-link active" onclick="fbTab('quotes','${id}');return false;" id="fb-tab-quotes-${id}" href="#">
        <i class="bi bi-file-earmark-text me-1"></i>Teklifler${quotes.length?`<span class="badge bg-warning text-dark ms-1">${quotes.length}</span>`:''}
      </a></li>
      <li class="nav-item"><a class="nav-link" onclick="fbTab('timeline','${id}');return false;" id="fb-tab-timeline-${id}" href="#">
        <i class="bi bi-clock-history me-1"></i>Timeline${acts.length?`<span class="badge bg-secondary ms-1">${acts.length}</span>`:''}
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

function renderQuotes(quotes) {
  if (!quotes.length) return '<div class="text-muted small text-center py-3">Henüz teklif yok</div>';
  const sym = { USD:'$', EUR:'€', TRY:'₺', GBP:'£' };
  return quotes.map(q => {
    const s = sym[q.currency]||q.currency||'€';
    const total = q.totalNet != null ? Number(q.totalNet).toLocaleString('tr-TR',{minimumFractionDigits:2}) : '—';
    const date  = q.createdAt ? new Date(q.createdAt).toLocaleDateString('tr-TR') : '';
    const badge = q.status==='sent' ? '<span class="badge bg-success ms-1">Gönderildi</span>' : '<span class="badge bg-secondary ms-1">Taslak</span>';
    const lines = (q.lines||[]).map(l=>`<div style="font-size:11px;color:#666;">${esc(l.product||'')} · ${l.qty} × ${Number(l.unitPrice||0).toLocaleString('tr-TR',{minimumFractionDigits:2})} ${s}</div>`).join('');
    return `<div class="fb-quote-card">
      <div class="d-flex justify-content-between align-items-start">
        <div><span class="fb-quote-num">${esc(q.quoteNumber||'—')}</span>${badge}
          <div class="fb-quote-prod mt-1">${esc(q.product||'')}</div>${lines}</div>
        <div class="text-end"><div class="fb-quote-total">${total} ${s}</div><div style="font-size:11px;color:#aaa;">${date}</div></div>
      </div></div>`;
  }).join('');
}

function renderTimeline(acts) {
  if (!acts.length) return '<div class="text-muted small text-center py-3">Henüz aktivite yok</div>';
  const icons = { email:'envelope', whatsapp:'whatsapp', quote:'file-earmark-text', scanned:'camera', edit:'pencil', note:'chat-left-text', status:'arrow-repeat' };
  return '<div class="fb-timeline">' + acts.map(a => {
    const type = a.type||'note';
    const time = a.createdAt ? new Date(a.createdAt).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
    return `<div class="fb-tl-item type-${esc(type)}">
      <div class="fb-tl-label"><i class="bi bi-${icons[type]||'circle'} me-1"></i>${esc(a.text||a.label||type)}</div>
      <div class="fb-tl-time">${time}${a.createdBy?' · '+esc(a.createdBy):''}</div>
    </div>`;
  }).join('') + '</div>';
}

// ── Import to IndexedDB ───────────────────────────────────
async function importFuarbotContact(id) {
  const c = fbCustomers.find(x => x._id === id);
  if (!c) return;
  try {
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
    const phone = c.phone||c.mobile||'';
    const ct = { name:c.name||'', title:c.position||'', phone, phoneNormalized:phone.replace(/\D/g,''), phoneValid:/^0[0-9]{10}$/.test(phone.replace(/[\s\-()]/g,'')), email:c.email||'', companyId, status:'Aktif', notes:'Fuarbot: '+(c.source||'Fuarbot')+(c.notes?'\n'+c.notes:''), createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
    ct.qualityScore = calculateContactQuality(ct);
    await new Promise((res,rej) => { const tx3=db.transaction(['contacts'],'readwrite'); const r3=tx3.objectStore('contacts').add(ct); r3.onsuccess=()=>res(r3.result); r3.onerror=()=>rej(r3.error); });
    toast('✓ ' + c.name + ' CRM\'e aktarıldı', 'success');
  } catch (e) { toast('Hata: ' + e.message, 'error'); }
}

async function importAllFuarbotContacts() {
  if (!fbCustomers.length) { toast('Aktarılacak kişi yok', 'error'); return; }
  let n = 0;
  for (const c of fbCustomers) { try { await importFuarbotContact(c._id); n++; } catch(_){} }
  toast('✓ ' + n + ' kişi aktarıldı', 'success');
}

// ── Page init ─────────────────────────────────────────────
function loadFuarbotPage() {
  const cfg = loadFbConfig();
  if (cfg?.apiKey && cfg?.projectId) {
    if (!fbPollInterval) startFuarbotSync(cfg.apiKey, cfg.projectId);
    else { document.getElementById('fb-config-panel').style.display='none'; document.getElementById('fb-layout').style.display=''; renderCustomerList(fbCustomers); if (fbSelectedId) showDetail(fbSelectedId); }
  } else { showFbConfig(); }
}
