
// ============================================================
// FUARBOT SYNC — Firestore REST API (no SDK needed)
// ============================================================
let fuarbotContacts = [];
let fbPollInterval  = null;

const FB_CFG_KEY = 'crm_fuarbot_firebase_config';

function loadFbConfig() {
  try { return JSON.parse(localStorage.getItem(FB_CFG_KEY) || 'null'); }
  catch { return null; }
}
function saveFbConfig(cfg) {
  localStorage.setItem(FB_CFG_KEY, JSON.stringify(cfg));
}

// ── Firestore REST helpers ────────────────────────────────
function parseFirestoreValue(val) {
  if (!val) return null;
  if (val.stringValue  !== undefined) return val.stringValue;
  if (val.integerValue !== undefined) return parseInt(val.integerValue, 10);
  if (val.doubleValue  !== undefined) return val.doubleValue;
  if (val.booleanValue !== undefined) return val.booleanValue;
  if (val.nullValue    !== undefined) return null;
  if (val.timestampValue !== undefined) return val.timestampValue;
  if (val.arrayValue)  return (val.arrayValue.values || []).map(parseFirestoreValue);
  if (val.mapValue)    return parseFirestoreFields(val.mapValue.fields || {});
  return null;
}
function parseFirestoreFields(fields) {
  const obj = {};
  for (const [k, v] of Object.entries(fields || {})) obj[k] = parseFirestoreValue(v);
  return obj;
}
function parseFirestoreDoc(doc) {
  const id = doc.name.split('/').pop();
  return { _id: id, ...parseFirestoreFields(doc.fields || {}) };
}

// ── Config UI ─────────────────────────────────────────────
function showFbConfig() {
  const panel = document.getElementById('fb-config-panel');
  if (panel) panel.style.display = '';
  const cfg = loadFbConfig();
  if (cfg) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('fb-api-key',     cfg.apiKey);
    set('fb-project-id',  cfg.projectId);
    set('fb-auth-domain', cfg.authDomain);
    set('fb-app-id',      cfg.appId);
  }
}

function connectFuarbot() {
  const get   = id => (document.getElementById(id)?.value || '').trim();
  const apiKey    = get('fb-api-key');
  const projectId = get('fb-project-id');
  const errEl     = document.getElementById('fb-connect-error');
  if (!apiKey || !projectId) {
    if (errEl) { errEl.style.display = ''; errEl.textContent = 'API Key ve Project ID zorunludur!'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';
  saveFbConfig({ apiKey, projectId, authDomain: get('fb-auth-domain'), appId: get('fb-app-id') });
  startFuarbotSync(apiKey, projectId);
}

// ── REST fetch ────────────────────────────────────────────
async function fetchFuarbotFromRest(apiKey, projectId, silent) {
  try {
    const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    let allDocs = [];
    let pageToken = '';

    // Handle pagination (Firestore returns max 300 docs per request)
    do {
      const url = `${base}/crm_customers?key=${apiKey}&pageSize=300` + (pageToken ? `&pageToken=${pageToken}` : '');
      const res  = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      allDocs = allDocs.concat((data.documents || []).map(parseFirestoreDoc));
      pageToken = data.nextPageToken || '';
    } while (pageToken);

    fuarbotContacts = allDocs;
    const count = fuarbotContacts.length;

    setFbStatus('Bağlı · ' + count + ' kişi', 'success');
    document.getElementById('fb-config-panel').style.display = 'none';
    const ctrl = document.getElementById('fb-controls');
    if (ctrl) ctrl.className = 'd-flex align-items-center gap-2 flex-wrap mb-3';
    updateFuarbotBadge(count);
    const syncEl = document.getElementById('fb-last-sync');
    if (syncEl) syncEl.textContent = 'Son güncelleme: ' + new Date().toLocaleTimeString('tr-TR');
    if (!silent) renderFuarbotContacts(fuarbotContacts);

  } catch (e) {
    const msg = e.message.includes('PERMISSION_DENIED') || e.message.includes('403')
      ? 'Erişim reddedildi — Firebase kurallarını kontrol edin (allow read: if true)'
      : 'Hata: ' + e.message;
    setFbStatus(msg, 'danger');
  }
}

function startFuarbotSync(apiKey, projectId) {
  setFbStatus('Bağlanıyor…', 'warning');
  // Stop previous poll
  if (fbPollInterval) { clearInterval(fbPollInterval); fbPollInterval = null; }
  // First fetch immediately
  fetchFuarbotFromRest(apiKey, projectId, false);
  // Then poll every 30 seconds for near-real-time sync
  fbPollInterval = setInterval(() => fetchFuarbotFromRest(apiKey, projectId, true), 30000);
}

// ── Status / badge ────────────────────────────────────────
function setFbStatus(text, type) {
  const el = document.getElementById('fb-status-badge');
  if (!el) return;
  el.className = 'badge bg-' + (type || 'secondary');
  el.textContent = text;
}
function updateFuarbotBadge(count) {
  const b = document.getElementById('fuarbot-badge');
  if (!b) return;
  if (count > 0) { b.style.display = ''; b.textContent = count; }
  else b.style.display = 'none';
}

// ── Search / filter ───────────────────────────────────────
function filterFuarbotContacts() {
  const q = (document.getElementById('fb-search')?.value || '').toLowerCase();
  renderFuarbotContacts(q
    ? fuarbotContacts.filter(c =>
        (c.name    || '').toLowerCase().includes(q) ||
        (c.company || '').toLowerCase().includes(q) ||
        (c.email   || '').toLowerCase().includes(q) ||
        (c.phone   || '').toLowerCase().includes(q) ||
        (c.source  || '').toLowerCase().includes(q))
    : fuarbotContacts, !!q);
}

// ── HTML escape ───────────────────────────────────────────
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Render list ───────────────────────────────────────────
function renderFuarbotContacts(contacts, isFiltered) {
  const container = document.getElementById('fb-contact-list');
  if (!container) return;
  if (!contacts || contacts.length === 0) {
    container.innerHTML = '<div class="text-center py-5 text-muted">' +
      '<i class="bi bi-inbox" style="font-size:40px;display:block;margin-bottom:12px;"></i>' +
      (isFiltered ? 'Arama sonucu bulunamadı.' : 'Henüz Fuarbot\'ta kayıtlı kişi yok.') + '</div>';
    return;
  }

  // Group by fair source
  const groups = {};
  contacts.forEach(c => {
    const src = c.source || 'Fuarbot';
    if (!groups[src]) groups[src] = [];
    groups[src].push(c);
  });

  let html = '';
  Object.entries(groups).forEach(([src, list]) => {
    html += '<div class="mb-3"><div class="d-flex align-items-center mb-2 gap-2">' +
      '<span class="badge bg-primary">' + esc(src) + '</span>' +
      '<span class="text-muted small">' + list.length + ' kişi</span></div>';
    list.forEach(c => {
      const phone = c.phone || c.mobile || '';
      const updatedAt = c.updatedAt ? new Date(c.updatedAt).toLocaleDateString('tr-TR') : '';
      html += '<div class="card mb-2 fuarbot-contact-card" data-id="' + esc(c._id) + '" style="border-left:3px solid #3b82f6;">' +
        '<div class="card-body py-2 px-3"><div class="d-flex align-items-center gap-3">' +
        '<div class="flex-grow-1">' +
        '<div class="d-flex align-items-center gap-2 flex-wrap">' +
        '<strong>' + esc(c.name || '—') + '</strong>' +
        (c.position ? '<span class="text-muted small">' + esc(c.position) + '</span>' : '') +
        (c.company  ? '<span class="badge bg-light text-dark border" style="font-size:11px;">' + esc(c.company) + '</span>' : '') +
        (c.status === 'new' ? '<span class="badge bg-warning text-dark" style="font-size:10px;">Yeni</span>' : '') +
        '</div><div class="d-flex gap-3 mt-1 flex-wrap" style="font-size:12px;color:#666;">' +
        (phone   ? '<span><i class="bi bi-telephone me-1"></i>' + esc(phone) + '</span>' : '') +
        (c.email ? '<span><i class="bi bi-envelope me-1"></i>' + esc(c.email) + '</span>' : '') +
        (c.address ? '<span><i class="bi bi-geo-alt me-1"></i>' + esc(c.address.slice(0,40)) + '</span>' : '') +
        (updatedAt ? '<span class="ms-auto text-muted">' + updatedAt + '</span>' : '') +
        '</div>' +
        (c.notes ? '<div class="mt-1 text-muted" style="font-size:11px;"><i class="bi bi-chat-left-text me-1"></i>' + esc(c.notes.slice(0,120)) + (c.notes.length > 120 ? '…' : '') + '</div>' : '') +
        '</div>' +
        '<button class="btn btn-sm btn-outline-success flex-shrink-0" onclick="importFuarbotContact(\'' + esc(c._id) + '\')" title="CRM\'e Aktar">' +
        '<i class="bi bi-cloud-download me-1"></i>Aktar</button>' +
        '</div></div></div>';
    });
    html += '</div>';
  });
  container.innerHTML = html;
}

// ── Import single contact ─────────────────────────────────
async function importFuarbotContact(fbId) {
  const c = fuarbotContacts.find(x => x._id === fbId);
  if (!c) return;
  try {
    // Find or create company
    let companyId = null;
    if (c.company && c.company.trim()) {
      const allComps = await new Promise((res, rej) => {
        const tx = db.transaction(['companies'], 'readonly');
        const req = tx.objectStore('companies').getAll();
        req.onsuccess = () => res(req.result);
        req.onerror   = () => rej(req.error);
      });
      const match = allComps.find(co =>
        (co.name || '').toLowerCase().trim() === c.company.toLowerCase().trim()
      );
      if (match) {
        companyId = match.id;
      } else {
        const newCo = {
          name: c.company.trim(), phone: c.phone || '', email: '',
          website: c.website || '', address: c.address || '', city: '',
          notes: 'Fuarbot\'tan aktarıldı. Kaynak: ' + (c.source || 'Fuarbot'),
          marketingStatus: 'Aranacak', qualityScore: 0,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        };
        newCo.qualityScore = calculateCompanyQuality(newCo);
        companyId = await new Promise((res, rej) => {
          const tx2 = db.transaction(['companies'], 'readwrite');
          const req2 = tx2.objectStore('companies').add(newCo);
          req2.onsuccess = () => res(req2.result);
          req2.onerror   = () => rej(req2.error);
        });
      }
    }
    // Create contact
    const phone = c.phone || c.mobile || '';
    const newContact = {
      name: c.name || '', title: c.position || '', phone,
      phoneNormalized: phone.replace(/\D/g,''),
      phoneValid: /^0[0-9]{10}$/.test(phone.replace(/[\s\-()]/g,'')),
      email: c.email || '', companyId, status: 'Aktif',
      notes: 'Fuarbot\'tan aktarıldı. Kaynak: ' + (c.source || 'Fuarbot') + (c.notes ? '\n' + c.notes : ''),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    newContact.qualityScore = calculateContactQuality(newContact);
    await new Promise((res, rej) => {
      const tx3 = db.transaction(['contacts'], 'readwrite');
      const req3 = tx3.objectStore('contacts').add(newContact);
      req3.onsuccess = () => res(req3.result);
      req3.onerror   = () => rej(req3.error);
    });
    // Mark card as done
    const card = document.querySelector('.fuarbot-contact-card[data-id="' + fbId + '"]');
    if (card) {
      card.style.opacity = '0.45';
      card.style.borderLeftColor = '#22c55e';
      const btn = card.querySelector('button');
      if (btn) { btn.disabled = true; btn.className = 'btn btn-sm btn-secondary flex-shrink-0'; btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Aktarıldı'; }
    }
    toast('✓ ' + c.name + ' CRM\'e aktarıldı', 'success');
  } catch (e) {
    console.error('Import error:', e);
    toast('Aktarım hatası: ' + e.message, 'error');
  }
}

async function importAllFuarbotContacts() {
  if (!fuarbotContacts.length) { toast('Aktarılacak kişi yok', 'error'); return; }
  let count = 0;
  for (const c of fuarbotContacts) { try { await importFuarbotContact(c._id); count++; } catch (_) {} }
  toast('✓ ' + count + ' kişi CRM\'e aktarıldı!', 'success');
}

// ── Page init ─────────────────────────────────────────────
function loadFuarbotPage() {
  const cfg = loadFbConfig();
  if (cfg && cfg.apiKey && cfg.projectId) {
    if (!fbPollInterval) {
      startFuarbotSync(cfg.apiKey, cfg.projectId);
    } else {
      document.getElementById('fb-config-panel').style.display = 'none';
      const ctrl = document.getElementById('fb-controls');
      if (ctrl) ctrl.className = 'd-flex align-items-center gap-2 flex-wrap mb-3';
      renderFuarbotContacts(fuarbotContacts);
    }
  } else {
    showFbConfig();
  }
}
