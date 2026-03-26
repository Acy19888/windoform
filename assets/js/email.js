'use strict';
// ══════════════════════════════════════════════════════════════
// EMAIL.JS — E-Mail, Notizen, Rollen für Windoform CRM
// ══════════════════════════════════════════════════════════════

const _EM_COL       = 'crm_emails';
const _NOTES_COL    = 'crm_notes';
const _SETTINGS_COL = 'crm_settings';

// ── State ────────────────────────────────────────────────────
let _emContact      = null;   // Kontakt beim Compose/Inbox
let _userSig        = '';     // HTML-Signatur
let _userCrmRole    = 'sales';// 'admin' | 'sales'
let _userEmailAddr  = '';
let _userDispName   = '';
let _rolePerms      = {};
let _notesContactId = null;
let _emailPageAll   = [];

const _DEFAULT_PERMS = {
  admin: ['dashboard','companies','contacts','fuarbot','fuar-dashboard','fuar-users',
          'leads','teklifler','fatura','urunler','uretim','import','reports',
          'duplicates','add-company','add-contact','ayarlar','emails'],
  sales: ['dashboard','companies','contacts','teklifler','fatura','leads','emails'],
};

const _ALL_PAGES = [
  { id:'dashboard',     label:'Dashboard',          icon:'bi-graph-up' },
  { id:'companies',     label:'Firmalar',            icon:'bi-building' },
  { id:'contacts',      label:'Kişiler',             icon:'bi-people' },
  { id:'emails',        label:'E-postalar',          icon:'bi-envelope' },
  { id:'leads',         label:'Leads & Pipeline',    icon:'bi-funnel-fill' },
  { id:'teklifler',     label:'Teklifler',           icon:'bi-file-earmark-text-fill' },
  { id:'fatura',        label:'Fatura',              icon:'bi-receipt' },
  { id:'urunler',       label:'Ürünler',             icon:'bi-box-seam-fill' },
  { id:'uretim',        label:'Üretim',              icon:'bi-gear-fill' },
  { id:'fuarbot',       label:'Fuarbot Sync',        icon:'bi-qr-code-scan' },
  { id:'fuar-dashboard',label:'Fuar Dashboard',      icon:'bi-speedometer2' },
  { id:'fuar-users',    label:'Kullanıcılar',        icon:'bi-people-fill' },
  { id:'import',        label:'Excel Aktar',         icon:'bi-upload' },
  { id:'reports',       label:'Raporlar',            icon:'bi-bar-chart' },
  { id:'duplicates',    label:'Tekrar Kayıtlar',     icon:'bi-copy' },
  { id:'ayarlar',       label:'Ayarlar',             icon:'bi-gear-fill' },
];

// ══════════════════════════════════════════════════════════════
// INIT (nach Login aufrufen)
// ══════════════════════════════════════════════════════════════

async function emailInit() {
  try {
    const cfg = typeof loadFbConfig === 'function' ? loadFbConfig() : null;
    if (!cfg?.apiKey) return;
    const uid   = typeof authUid   === 'function' ? authUid()   : null;
    const token = typeof authToken === 'function' ? await authToken() : null;

    // Benutzer-Profil aus fuarEmployees laden
    if (uid) {
      const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/fuarEmployees/${uid}?key=${cfg.apiKey}`;
      const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
      if (res.ok) {
        const doc = await res.json();
        const f = doc.fields || {};
        _userDispName  = f.name?.stringValue || f.displayName?.stringValue || '';
        _userEmailAddr = f.emailAddress?.stringValue || f.email?.stringValue || (typeof authEmail === 'function' ? authEmail() : '');
        _userSig       = f.emailSignature?.stringValue || '';
        _userCrmRole   = (f.crmRole?.stringValue || 'sales').toLowerCase();
      }
    }

    // Rollen-Berechtigungen laden
    const settingsUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${_SETTINGS_COL}/rolePermissions?key=${cfg.apiKey}`;
    const settingsRes = await fetch(settingsUrl, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
    if (settingsRes.ok) {
      const sd = await settingsRes.json();
      const sf = sd.fields || {};
      if (sf.sales?.arrayValue?.values) _rolePerms.sales = sf.sales.arrayValue.values.map(v => v.stringValue).filter(Boolean);
      if (sf.admin?.arrayValue?.values) _rolePerms.admin = sf.admin.arrayValue.values.map(v => v.stringValue).filter(Boolean);
    }

    _applyRolePerms();
    _updateUserDisplay();
    console.log('[Email] Init OK — Rolle:', _userCrmRole, 'E-Mail:', _userEmailAddr);
  } catch (e) {
    console.warn('[Email] Init Fehler:', e.message);
  }
}

function _updateUserDisplay() {
  // Admin-Badge im Sidebar anzeigen
  const badge = document.getElementById('sidebar-role-badge');
  if (badge) {
    badge.textContent = _userCrmRole === 'admin' ? 'Admin' : 'Sales';
    badge.className = `badge ms-1 ${_userCrmRole === 'admin' ? 'bg-danger' : 'bg-primary'}`;
  }
  // Signatur-Settings initialisieren falls Ayarlar offen
  if (document.getElementById('signature-settings-container')) signatureSettingsInit();
  if (document.getElementById('role-settings-container'))      roleSettingsInit();
}

// ══════════════════════════════════════════════════════════════
// ROLLEN-SYSTEM
// ══════════════════════════════════════════════════════════════

function _applyRolePerms() {
  const allowed = _rolePerms[_userCrmRole] || _DEFAULT_PERMS[_userCrmRole] || _DEFAULT_PERMS.sales;

  document.querySelectorAll('.sidebar a[data-page]').forEach(link => {
    const page = link.getAttribute('data-page');
    link.style.display = (!page || allowed.includes(page)) ? '' : 'none';
  });

  // Elemente die nur Admins sehen
  document.querySelectorAll('[data-role="admin"]').forEach(el => {
    el.style.display = _userCrmRole === 'admin' ? '' : 'none';
  });
}

function roleSettingsInit() {
  const c = document.getElementById('role-settings-container');
  if (!c) return;
  if (_userCrmRole !== 'admin') {
    c.innerHTML = '<div class="alert alert-warning small">Bu bölüm sadece Admin kullanıcıları içindir.</div>';
    return;
  }

  const salesPerms = _rolePerms.sales || _DEFAULT_PERMS.sales;

  c.innerHTML = `
  <div class="card border-0 shadow-sm mb-4">
    <div class="card-header bg-white fw-semibold d-flex align-items-center gap-2">
      <i class="bi bi-shield-lock text-danger"></i>Verkäufer — Görünür Menüler
    </div>
    <div class="card-body">
      <p class="text-muted small mb-3">Aşağıda seçilen menü öğeleri Verkäufer (Sales) rolündeki kullanıcılara görünür. Admin her zaman tüm menüleri görür.</p>
      <div class="row g-2 mb-3">
        ${_ALL_PAGES.map(p => `
          <div class="col-md-4 col-6">
            <div class="form-check">
              <input class="form-check-input" type="checkbox" id="rp-${p.id}" value="${p.id}"${salesPerms.includes(p.id) ? ' checked' : ''}>
              <label class="form-check-label small" for="rp-${p.id}">
                <i class="bi ${p.icon} me-1 text-muted"></i>${p.label}
              </label>
            </div>
          </div>`).join('')}
      </div>
      <button class="btn btn-primary btn-sm" onclick="rolePermsSave()">
        <i class="bi bi-check-lg me-1"></i>Kaydet
      </button>
      <span id="role-save-status" class="ms-2 small text-success" style="display:none;">✓ Kaydedildi</span>
    </div>
  </div>`;
}

async function rolePermsSave() {
  const checked = Array.from(document.querySelectorAll('[id^="rp-"]:checked')).map(cb => cb.value);
  try {
    const cfg   = loadFbConfig();
    const token = await authToken();
    const salesArr = checked.map(v => ({ stringValue: v }));
    const adminArr = _ALL_PAGES.map(p => ({ stringValue: p.id }));

    const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${_SETTINGS_COL}/rolePermissions?updateMask.fieldPaths=sales&updateMask.fieldPaths=admin&key=${cfg.apiKey}`;
    await fetch(url, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ fields: {
        sales: { arrayValue: { values: salesArr } },
        admin: { arrayValue: { values: adminArr } },
      }}),
    });
    _rolePerms.sales = checked;
    _rolePerms.admin = _ALL_PAGES.map(p => p.id);
    const s = document.getElementById('role-save-status');
    if (s) { s.style.display = ''; setTimeout(() => s.style.display = 'none', 3000); }
    _emToast('Yetkiler kaydedildi ✓', 'success');
  } catch (e) { _emToast('Hata: ' + e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// E-POSTA COMPOSE
// ══════════════════════════════════════════════════════════════

async function emailCompose(contact) {
  _emContact = contact || null;
  const modal = document.getElementById('emailComposeModal');
  if (!modal) return;

  const toEl   = document.getElementById('ec-to');
  const subEl  = document.getElementById('ec-subject');
  const bodyEl = document.getElementById('ec-body');
  const fromEl = document.getElementById('ec-from-display');

  if (toEl)   toEl.value = contact?.email || (contact?.name ? contact.name + ' ' : '') + (contact?.email ? `<${contact.email}>` : '') || '';
  // If contact has name+email, show "Name <email>", else just email
  if (contact?.name && contact?.email) {
    if (toEl) toEl.value = `${contact.name} <${contact.email}>`;
  } else if (contact?.email) {
    if (toEl) toEl.value = contact.email;
  } else {
    if (toEl) toEl.value = '';
  }

  if (subEl)  subEl.value = '';
  if (fromEl) fromEl.textContent = _userEmailAddr || '(Ayarlar → E-posta adresinizi girin)';

  // Load signature fresh from Firestore if not yet loaded
  if (!_userSig) await _loadSignatureFresh();

  if (bodyEl) {
    bodyEl.innerHTML = _userSig
      ? `<p><br></p><p><span style="color:#888">--</span></p>${_userSig}`
      : '<p><br></p>';
    setTimeout(() => {
      const r = document.createRange();
      r.setStart(bodyEl.firstChild || bodyEl, 0);
      r.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      bodyEl.focus();
    }, 350);
  }

  // Pre-load contacts for autocomplete
  _loadEmailContactsCache();

  bootstrap.Modal.getOrCreateInstance(modal).show();
}

// ── Signature fresh-load (falls emailInit noch nicht durch) ──
async function _loadSignatureFresh() {
  try {
    const cfg = loadFbConfig(); if (!cfg) return;
    const uid = typeof authUid === 'function' ? authUid() : null; if (!uid) return;
    const token = await authToken(); if (!token) return;
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/fuarEmployees/${uid}?key=${cfg.apiKey}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const d = await res.json();
    if (d.fields?.emailSignature?.stringValue) {
      _userSig      = d.fields.emailSignature.stringValue;
      _userEmailAddr= d.fields.emailAddress?.stringValue || _userEmailAddr;
      _userDispName = d.fields.name?.stringValue || _userDispName;
    }
  } catch {}
}

// ── Kontakt-Autocomplete ─────────────────────────────────────
let _emailContactsCache = [];
async function _loadEmailContactsCache() {
  if (_emailContactsCache.length > 0) return;
  try {
    // Try IndexedDB first
    if (typeof dbGetAll === 'function' && typeof db !== 'undefined' && db) {
      const contacts = await dbGetAll('contacts');
      _emailContactsCache = (contacts || [])
        .filter(c => c.email || c.contactEmail)
        .map(c => ({
          name:  [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || c.firma || '',
          email: c.contactEmail || c.email || '',
          firma: c.firma || '',
        }))
        .filter(c => c.email);
      return;
    }
    // Fallback: Firestore
    const cfg   = loadFbConfig(); if (!cfg) return;
    const token = await authToken(); if (!token) return;
    const res   = await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents:runQuery?key=${cfg.apiKey}`,
      { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
        body: JSON.stringify({ structuredQuery: { from:[{collectionId:'contacts'}], limit:500,
          select:{ fields:[{fieldPath:'firstName'},{fieldPath:'lastName'},{fieldPath:'name'},{fieldPath:'email'},{fieldPath:'contactEmail'},{fieldPath:'firma'}] }
        }})
      }
    );
    const rows = await res.json();
    _emailContactsCache = (Array.isArray(rows)?rows:[]).filter(r=>r.document).map(r => {
      const f = r.document.fields||{};
      return {
        name:  [f.firstName?.stringValue,f.lastName?.stringValue].filter(Boolean).join(' ')
               || f.name?.stringValue || '',
        email: f.contactEmail?.stringValue||f.email?.stringValue||'',
        firma: f.firma?.stringValue||'',
      };
    }).filter(c => c.email);
  } catch {}
}

function emailToSearch(q) {
  const dd = document.getElementById('ec-to-dropdown');
  if (!dd) return;
  if (!q || q.length < 1) { dd.style.display = 'none'; return; }

  // Split query into words — ALL words must match somewhere (name OR email OR firma)
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const hits = _emailContactsCache.filter(c => {
    const haystack = `${c.name} ${c.email} ${c.firma}`.toLowerCase();
    return words.every(w => haystack.includes(w));
  }).slice(0, 8);
  if (!hits.length) { dd.style.display = 'none'; return; }
  dd.innerHTML = hits.map(c => `
    <div class="px-3 py-2 d-flex gap-2 align-items-center"
         style="cursor:pointer;border-bottom:1px solid #f1f5f9;"
         onmousedown="emailToSelect('${esc(c.name)} <${esc(c.email)}>')"
         onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
      <i class="bi bi-person-circle text-muted"></i>
      <div>
        <div style="font-weight:500;">${esc(c.name||c.email)}</div>
        <div class="text-muted" style="font-size:11px;">${esc(c.email)}${c.firma?' · '+esc(c.firma):''}</div>
      </div>
    </div>`).join('');
  dd.style.display = 'block';
}

function emailToSelect(val) {
  const el = document.getElementById('ec-to');
  if (el) el.value = val;
  const dd = document.getElementById('ec-to-dropdown');
  if (dd) dd.style.display = 'none';
}

// Close dropdown on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('#ec-to') && !e.target.closest('#ec-to-dropdown')) {
    const dd = document.getElementById('ec-to-dropdown');
    if (dd) dd.style.display = 'none';
  }
});

// ── AI Text-Verbesserung ─────────────────────────────────────
async function emailAiImprove() {
  const bodyEl = document.getElementById('ec-body');
  const btn    = document.getElementById('ec-ai-btn');
  if (!bodyEl) return;

  const text = bodyEl.innerText.trim();
  if (!text || text.length < 10) {
    _emToast('Önce e-posta metni yazın', 'error'); return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ İyileştiriliyor…'; }

  try {
    const res = await fetch('/api/ai/improve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (data.improved) {
      // Keep signature: split at "--" separator if present
      const sigSep = bodyEl.innerHTML.indexOf('<p><span style="color:#888">--</span></p>');
      const sigPart = sigSep > -1 ? bodyEl.innerHTML.slice(sigSep) : '';
      bodyEl.innerHTML = `<p>${data.improved.replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>')}</p>` + sigPart;
      _emToast('Metin geliştirildi ✓', 'success');
    } else {
      _emToast(data.error || 'AI yanıt vermedi', 'error');
    }
  } catch (e) {
    _emToast('AI hatası: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '✨ AI ile Geliştir'; }
  }
}

function emailComposeReply(fromEmail, subject) {
  const fakeContact = { ..._emContact, email: fromEmail };
  emailCompose(fakeContact);
  setTimeout(() => {
    const subEl = document.getElementById('ec-subject');
    if (subEl) subEl.value = subject.startsWith('Re:') ? subject : 'Re: ' + subject;
  }, 150);
}

async function emailSend() {
  const to      = document.getElementById('ec-to')?.value?.trim();
  const subject = document.getElementById('ec-subject')?.value?.trim();
  const html    = document.getElementById('ec-body')?.innerHTML || '';
  const sendBtn = document.getElementById('ec-send-btn');

  if (!to)              return _emToast('Alıcı gerekli', 'warning');
  if (!subject)         return _emToast('Konu gerekli', 'warning');
  if (!_userEmailAddr)  return _emToast('Gönderici e-posta ayarlanmamış → Ayarlar → E-posta İmzası', 'warning');

  if (sendBtn) { sendBtn.disabled = true; sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Gönderiliyor…'; }

  try {
    const cfg       = loadFbConfig();
    const token     = await authToken();
    const contactId = _emContact?._id || '';

    // 1. Firestore'a kaydet (ID almak için)
    const fields = {
      direction:    { stringValue: 'outbound' },
      contactId:    { stringValue: contactId },
      to:           { stringValue: to },
      from:         { stringValue: _userEmailAddr },
      fromName:     { stringValue: _userDispName || _userEmailAddr },
      subject:      { stringValue: subject },
      html:         { stringValue: html },
      sentAt:       { timestampValue: new Date().toISOString() },
      createdAt:    { timestampValue: new Date().toISOString() },
      createdBy:    { stringValue: _userDispName || _userEmailAddr },
      createdByUid: { stringValue: typeof authUid === 'function' ? (authUid() || '') : '' },
      opened:       { booleanValue: false },
      status:       { stringValue: 'sending' },
    };
    const fsUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${_EM_COL}?key=${cfg.apiKey}`;
    const fsRes = await fetch(fsUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ fields }),
    });
    if (!fsRes.ok) throw new Error('Firestore kayıt hatası: ' + fsRes.status);
    const fsData  = await fsRes.json();
    const emailDocId = fsData.name?.split('/').pop() || '';

    // 2. Senden via Vercel API-Route
    const sendRes = await fetch('/api/email/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ to, subject, html, fromName: _userDispName || _userEmailAddr, fromEmail: _userEmailAddr, emailDocId }),
    });
    if (!sendRes.ok) {
      const err = await sendRes.json().catch(() => ({}));
      throw new Error(err.error || 'Gönderme hatası ' + sendRes.status);
    }

    _emToast('✓ E-posta gönderildi', 'success');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('emailComposeModal')).hide();

    // Inbox neu laden falls offen
    if (contactId) emailLoadContactEmails(contactId);
    // Globale E-Posta Seite neu laden
    if (document.getElementById('emails-page-content')?.closest('.page-section')?.style?.display !== 'none') {
      loadEmailsPage();
    }

  } catch (e) {
    _emToast('Hata: ' + e.message, 'error');
  } finally {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = '<i class="bi bi-send me-1"></i>Gönder'; }
  }
}

// Toolbar-Formatierung: für Compose-Body UND Signatur-Editor
function emailFormat(cmd, val) {
  // Aktives contenteditable Element bestimmen
  const active = document.activeElement;
  const target = (active?.contentEditable === 'true') ? active : document.getElementById('ec-body');
  target?.focus();
  document.execCommand(cmd, false, val || null);
}

// ── Konsolen-Helper: eigene UID als Admin setzen ──────────────
// Aufruf in der Browser-Konsole: setMeAsAdmin()
window.setMeAsAdmin = async function() {
  const cfg = typeof loadFbConfig === 'function' ? loadFbConfig() : null;
  const uid = typeof authUid === 'function' ? authUid() : null;
  const token = typeof authToken === 'function' ? await authToken() : null;
  if (!cfg || !uid) return console.error('[Admin] Nicht eingeloggt');
  const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/fuarEmployees/${uid}?updateMask.fieldPaths=crmRole&key=${cfg.apiKey}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ fields: { crmRole: { stringValue: 'admin' } } }),
  });
  if (res.ok) { console.log('[Admin] ✓ crmRole = admin gesetzt. Seite neu laden!'); }
  else { const e = await res.json(); console.error('[Admin] Fehler:', e); }
};

// ══════════════════════════════════════════════════════════════
// E-POSTA INBOX — pro Kontakt
// ══════════════════════════════════════════════════════════════

async function emailLoadContactEmails(contactId) {
  const c = document.getElementById('cont-panel-emails');
  if (!c) return;
  c.innerHTML = '<div class="text-center py-4"><span class="spinner-border spinner-border-sm text-muted"></span></div>';

  try {
    const cfg   = loadFbConfig();
    const token = await authToken();
    const res   = await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents:runQuery?key=${cfg.apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ structuredQuery: {
          from:    [{ collectionId: _EM_COL }],
          where:   { fieldFilter: { field: { fieldPath: 'contactId' }, op: 'EQUAL', value: { stringValue: contactId } } },
          orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
          limit:   50,
        }}),
      }
    );
    const rows   = await res.json();
    const emails = _parseEmailRows(rows);

    if (!emails.length) {
      c.innerHTML = `
        <div class="text-center py-4 text-muted small">
          <i class="bi bi-envelope" style="font-size:2rem;opacity:.4;"></i>
          <div class="mt-2">Henüz e-posta yok</div>
          <a href="#" class="text-primary small mt-1 d-inline-block"
            onclick="emailCompose(window._emContactRef);return false;">
            İlk e-postayı gönder →
          </a>
        </div>`;
      return;
    }

    c.innerHTML = emails.map(_renderEmailItem).join('');

  } catch (e) {
    c.innerHTML = `<div class="alert alert-warning small m-2">E-postalar yüklenemedi: ${esc(e.message)}</div>`;
  }
}

// Expose für onclick im HTML
window._emContactRef = null;

function _parseEmailRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter(r => r.document)
    .map(r => {
      const f = r.document.fields || {};
      return {
        _id:       r.document.name.split('/').pop(),
        direction: f.direction?.stringValue || 'outbound',
        contactId: f.contactId?.stringValue || '',
        from:      f.from?.stringValue || '',
        to:        f.to?.stringValue   || '',
        subject:   f.subject?.stringValue || '(Konu yok)',
        html:      f.html?.stringValue || '',
        text:      f.text?.stringValue || '',
        sentAt:    f.sentAt?.timestampValue || f.sentAt?.stringValue || f.createdAt?.timestampValue || '',
        opened:    f.opened?.booleanValue   || false,
        status:    f.status?.stringValue    || 'sent',
        createdBy: f.createdBy?.stringValue || '',
      };
    });
}

function _renderEmailItem(em) {
  const isOut  = em.direction === 'outbound';
  const dt     = em.sentAt ? new Date(em.sentAt).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
  const preview = (em.text || em.html.replace(/<[^>]+>/g, '')).slice(0, 90).replace(/\n/g, ' ');
  const ticks  = _tickHtml(em);

  return `
  <div class="email-item d-flex gap-2 p-2 border-bottom align-items-start"
       style="cursor:pointer;font-size:13px;"
       onclick="emailShowDetail('${esc(em._id)}')">
    <i class="bi ${isOut ? 'bi-arrow-up-right text-primary' : 'bi-arrow-down-left text-success'} mt-1"></i>
    <div class="flex-grow-1 min-w-0" style="overflow:hidden;">
      <div class="d-flex justify-content-between align-items-center gap-1">
        <span class="fw-semibold text-truncate">${esc(em.subject)}</span>
        <div class="d-flex gap-1 align-items-center flex-shrink-0">
          ${ticks}
          <span class="text-muted" style="font-size:11px;white-space:nowrap;">${dt}</span>
        </div>
      </div>
      <div class="text-muted text-truncate" style="font-size:11px;">
        ${isOut ? '→ ' + esc(em.to) : '← ' + esc(em.from)}
      </div>
      <div class="text-muted text-truncate" style="font-size:11px;opacity:.7;">${esc(preview)}</div>
    </div>
  </div>`;
}

function _tickHtml(em) {
  if (em.direction !== 'outbound') return '';
  if (em.opened)            return '<span style="color:#3b82f6;font-size:12px;" title="Okundu">✓✓</span>';
  if (em.status === 'sent') return '<span style="color:#9ca3af;font-size:12px;" title="Gönderildi">✓</span>';
  return '<span style="color:#d1d5db;font-size:11px;" title="Gönderiliyor">⏳</span>';
}

// ══════════════════════════════════════════════════════════════
// E-POSTA DETAIL MODAL
// ══════════════════════════════════════════════════════════════

async function emailShowDetail(emailId) {
  const modal = document.getElementById('emailDetailModal');
  if (!modal) return;

  document.getElementById('em-detail-body').innerHTML = '<div class="text-center p-4"><span class="spinner-border spinner-border-sm"></span></div>';
  bootstrap.Modal.getOrCreateInstance(modal).show();

  try {
    const cfg   = loadFbConfig();
    const token = await authToken();
    const res   = await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${_EM_COL}/${emailId}?key=${cfg.apiKey}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const doc = await res.json();
    const f   = doc.fields || {};

    const subject   = f.subject?.stringValue || '(Konu yok)';
    const from      = f.from?.stringValue    || '';
    const to        = f.to?.stringValue      || '';
    const html      = f.html?.stringValue    || f.text?.stringValue?.replace(/\n/g, '<br>') || '';
    const dt        = f.sentAt?.timestampValue || f.sentAt?.stringValue || f.createdAt?.timestampValue || '';
    const dtStr     = dt ? new Date(dt).toLocaleString('tr-TR') : '';
    const direction = f.direction?.stringValue || 'outbound';
    const opened    = f.opened?.booleanValue   || false;
    const status    = f.status?.stringValue    || 'sent';

    let statusBadge = '';
    if (direction === 'outbound') {
      if (opened)               statusBadge = '<span class="badge" style="background:#3b82f6;">✓✓ Okundu</span>';
      else if (status === 'sent') statusBadge = '<span class="badge bg-secondary">✓ Gönderildi</span>';
      else                      statusBadge = '<span class="badge bg-warning text-dark">⏳ Gönderiliyor</span>';
    } else {
      statusBadge = '<span class="badge bg-success">← Gelen</span>';
    }

    document.getElementById('em-detail-subject').textContent = subject;
    document.getElementById('em-detail-meta').innerHTML = `
      <div class="d-flex gap-3 flex-wrap align-items-center" style="font-size:13px;">
        <span><strong>Kimden:</strong> ${esc(from)}</span>
        <span><strong>Kime:</strong> ${esc(to)}</span>
        <span class="text-muted">${dtStr}</span>
        ${statusBadge}
      </div>`;
    document.getElementById('em-detail-body').innerHTML =
      `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;padding:8px 0;">${html}</div>`;

    // Reply-Button
    const replyBtn = document.getElementById('em-detail-reply-btn');
    if (replyBtn) replyBtn.onclick = () => {
      bootstrap.Modal.getOrCreateInstance(modal).hide();
      setTimeout(() => emailComposeReply(from, subject), 350);
    };

  } catch (e) {
    document.getElementById('em-detail-body').innerHTML =
      `<div class="alert alert-danger small">Yüklenemedi: ${esc(e.message)}</div>`;
  }
}

// ══════════════════════════════════════════════════════════════
// GLOBALE E-POSTA SEITE
// ══════════════════════════════════════════════════════════════

async function loadEmailsPage() {
  const c = document.getElementById('emails-page-content');
  if (!c) return;
  c.innerHTML = '<div class="text-center py-5"><span class="spinner-border"></span></div>';

  try {
    const cfg   = loadFbConfig();
    const token = await authToken();
    const res   = await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents:runQuery?key=${cfg.apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ structuredQuery: {
          from:    [{ collectionId: _EM_COL }],
          orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
          limit:   200,
        }}),
      }
    );
    const rows   = await res.json();
    _emailPageAll = _parseEmailRows(rows);

    const inboundCnt  = _emailPageAll.filter(e => e.direction === 'inbound').length;
    const outboundCnt = _emailPageAll.filter(e => e.direction === 'outbound').length;
    const unreadCnt   = _emailPageAll.filter(e => e.direction === 'inbound').length; // all inbound = "unread" for now

    c.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div>
        <span class="badge bg-success me-1">${inboundCnt} Gelen</span>
        <span class="badge bg-primary">${outboundCnt} Giden</span>
      </div>
      <button class="btn btn-primary btn-sm" onclick="emailCompose(null)">
        <i class="bi bi-pencil-square me-1"></i>Yeni E-posta
      </button>
    </div>
    <ul class="nav nav-tabs mb-0" id="em-page-tabs">
      <li class="nav-item"><a class="nav-link active" href="#" onclick="emailPageFilter('all',this);return false;">Tümü</a></li>
      <li class="nav-item"><a class="nav-link" href="#" onclick="emailPageFilter('inbound',this);return false;"><i class="bi bi-arrow-down-left text-success me-1"></i>Gelen</a></li>
      <li class="nav-item"><a class="nav-link" href="#" onclick="emailPageFilter('outbound',this);return false;"><i class="bi bi-arrow-up-right text-primary me-1"></i>Giden</a></li>
    </ul>
    <div id="em-page-list" class="border border-top-0 rounded-bottom">
      ${_emailPageAll.length
        ? _emailPageAll.map(_renderEmailPageItem).join('')
        : '<div class="text-muted text-center py-5"><i class="bi bi-inbox" style="font-size:2.5rem;opacity:.3;"></i><div class="mt-2">Henüz e-posta yok</div></div>'}
    </div>`;

  } catch (e) {
    c.innerHTML = `<div class="alert alert-danger">Hata: ${esc(e.message)}</div>`;
  }
}

function emailPageFilter(f, el) {
  document.querySelectorAll('#em-page-tabs .nav-link').forEach(l => l.classList.remove('active'));
  el.classList.add('active');
  const list = document.getElementById('em-page-list');
  if (!list) return;
  let data = _emailPageAll;
  if (f === 'inbound')  data = data.filter(e => e.direction === 'inbound');
  if (f === 'outbound') data = data.filter(e => e.direction === 'outbound');
  list.innerHTML = data.length
    ? data.map(_renderEmailPageItem).join('')
    : '<div class="text-muted text-center py-5">Sonuç yok</div>';
}

function _renderEmailPageItem(em) {
  const isOut = em.direction === 'outbound';
  const dt    = em.sentAt ? new Date(em.sentAt).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
  return `
  <div class="d-flex gap-3 p-3 border-bottom align-items-start" style="cursor:pointer;font-size:13px;"
       onclick="emailShowDetail('${esc(em._id)}')">
    <i class="bi ${isOut ? 'bi-arrow-up-right text-primary' : 'bi-arrow-down-left text-success'} mt-1"></i>
    <div class="flex-grow-1 min-w-0" style="overflow:hidden;">
      <div class="d-flex justify-content-between align-items-center gap-2">
        <span class="fw-semibold text-truncate">${esc(em.subject)}</span>
        <div class="d-flex gap-1 align-items-center flex-shrink-0">
          ${_tickHtml(em)}
          <span class="text-muted" style="font-size:11px;white-space:nowrap;">${dt}</span>
        </div>
      </div>
      <div class="text-muted text-truncate" style="font-size:11px;">
        ${isOut ? '→ ' + esc(em.to) : '← ' + esc(em.from)}
        ${em.createdBy ? ' · ' + esc(em.createdBy) : ''}
      </div>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// NOTIZEN
// ══════════════════════════════════════════════════════════════

const _NOTE_COLORS = {
  yellow: { bg:'#fef9c3', border:'#fde68a', label:'Sarı'   },
  blue:   { bg:'#dbeafe', border:'#93c5fd', label:'Mavi'   },
  green:  { bg:'#dcfce7', border:'#86efac', label:'Yeşil'  },
  red:    { bg:'#fee2e2', border:'#fca5a5', label:'Kırmızı'},
  purple: { bg:'#f3e8ff', border:'#d8b4fe', label:'Mor'    },
};

async function notesLoad(contactId, _silent) {
  _notesContactId = String(contactId);
  const c = document.getElementById('cont-panel-notes-list');
  if (!c) return;
  // In silent mode (background fetch for timeline) don't show spinner or overwrite UI
  if (!_silent) {
    c.innerHTML = '<div class="text-center py-3"><span class="spinner-border spinner-border-sm text-muted"></span></div>';
  }

  try {
    const cfg   = loadFbConfig();
    const token = await authToken();
    const res   = await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents:runQuery?key=${cfg.apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        // No orderBy → avoids composite index requirement; we sort in JS below
        body:    JSON.stringify({ structuredQuery: {
          from:    [{ collectionId: _NOTES_COL }],
          where:   { fieldFilter: { field: { fieldPath: 'contactId' }, op: 'EQUAL', value: { stringValue: String(contactId) } } },
          limit:   200,
        }}),
      }
    );
    const rawBody = await res.text();
    if (!res.ok) {
      c.innerHTML = `<div class="alert alert-warning small m-2">Sorgu hatası ${res.status}: ${esc(rawBody.slice(0,200))}</div>`;
      return;
    }
    const rows  = JSON.parse(rawBody);
    const notes = (Array.isArray(rows) ? rows : [])
      .filter(r => r.document)
      .map(r => {
        const f = r.document.fields || {};
        return {
          _id:       r.document.name.split('/').pop(),
          text:      f.text?.stringValue   || '',
          color:     f.color?.stringValue  || 'yellow',
          pinned:    f.pinned?.booleanValue || false,
          createdBy: f.createdBy?.stringValue || '',
          createdAt: f.createdAt?.timestampValue || '',
        };
      })
      // Sort in JS: pinned first, then newest first
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
        return (b.createdAt || '') > (a.createdAt || '') ? 1 : -1;
      });

    if (!_silent) {
      c.innerHTML = notes.length
        ? notes.map(_renderNote).join('')
        : '<div class="cont-empty-state text-muted py-4"><i class="bi bi-sticky me-2 opacity-25"></i>Henüz not yok</div>';
    }

    // ── Sync notes to Aktiviteler timeline ──
    window._cmNotes = notes;
    // In silent mode (background fetch), only trigger the timeline render if
    // Fuarbot has already finished rendering (flag set in app.js). This prevents
    // the fast Firestore query from overwriting the timeline before Fuarbot data arrives.
    if (!_silent || window._fbPanelsRendered) {
      if (typeof window._contRenderTimeline === 'function') {
        window._contRenderTimeline();
      }
    }

  } catch (e) {
    c.innerHTML = `<div class="alert alert-warning small m-2">Notlar yüklenemedi: ${esc(e.message)}</div>`;
  }
}

function _renderNote(n) {
  const col = _NOTE_COLORS[n.color] || _NOTE_COLORS.yellow;
  const dt  = n.createdAt ? new Date(n.createdAt).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
  return `
  <div class="note-card p-3 rounded mb-2" style="background:${col.bg};border:1px solid ${col.border};">
    <div class="d-flex justify-content-between align-items-start mb-1">
      <span style="font-size:12px;opacity:.7;">${n.pinned ? '📌 Sabitlenmiş' : ''}</span>
      <div class="d-flex gap-1">
        <button class="btn btn-sm py-0 px-1" style="font-size:11px;" title="${n.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}"
          onclick="notesTogglePin('${esc(n._id)}',${n.pinned})">📍</button>
        <button class="btn btn-sm py-0 px-1 text-danger" style="font-size:11px;" title="Sil"
          onclick="notesDelete('${esc(n._id)}')">✕</button>
      </div>
    </div>
    <div style="white-space:pre-wrap;font-size:13px;">${esc(n.text)}</div>
    <div class="mt-1 text-muted" style="font-size:10px;">${esc(n.createdBy)} · ${dt}</div>
  </div>`;
}

async function notesAdd() {
  const textarea = document.getElementById('note-new-text');
  const colorSel = document.getElementById('note-new-color');
  const text     = textarea?.value?.trim();
  const color    = colorSel?.value || 'yellow';
  if (!text) return;
  if (!_notesContactId && typeof currentModalContactId !== 'undefined' && currentModalContactId) {
    _notesContactId = String(currentModalContactId);
  }
  if (!_notesContactId) { _emToast('Kontakt ID bulunamadı', 'error'); return; }

  // Disable button while saving
  const btn = document.querySelector('#cont-panel-notes .cont-note-add-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Kaydediliyor…'; }
  try {
    const cfg   = loadFbConfig();
    const token = await authToken();
    const saveRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${_NOTES_COL}?key=${cfg.apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ fields: {
          contactId:    { stringValue: String(_notesContactId) },
          text:         { stringValue: text },
          color:        { stringValue: color },
          pinned:       { booleanValue: false },
          createdBy:    { stringValue: _userDispName || (typeof authEmail === 'function' ? authEmail() : '') },
          createdByUid: { stringValue: typeof authUid === 'function' ? (authUid() || '') : '' },
          createdAt:    { timestampValue: new Date().toISOString() },
        }}),
      }
    );
    if (!saveRes.ok) {
      const errTxt = await saveRes.text();
      console.error('notesAdd Firestore error:', saveRes.status, errTxt);
      _emToast(`Not kaydedilemedi (${saveRes.status})`, 'error');
      return;
    }
    if (textarea) textarea.value = '';
    await notesLoad(_notesContactId);
  } catch (e) {
    console.error('notesAdd error:', e);
    _emToast('Not kaydedilemedi: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-plus-circle-fill me-1"></i>Not Ekle'; }
  }
}

async function notesTogglePin(id, cur) {
  try {
    const cfg   = loadFbConfig();
    const token = await authToken();
    await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${_NOTES_COL}/${id}?updateMask.fieldPaths=pinned&key=${cfg.apiKey}`,
      {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ fields: { pinned: { booleanValue: !cur } } }),
      }
    );
    notesLoad(_notesContactId);
  } catch (e) { _emToast('Hata: ' + e.message, 'error'); }
}

async function notesDelete(id) {
  if (!confirm('Bu notu silmek istediğinizden emin misiniz?')) return;
  try {
    const cfg   = loadFbConfig();
    const token = await authToken();
    await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${_NOTES_COL}/${id}?key=${cfg.apiKey}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    );
    notesLoad(_notesContactId);
  } catch (e) { _emToast('Hata: ' + e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// SIGNATUR-EINSTELLUNGEN
// ══════════════════════════════════════════════════════════════

function signatureSettingsInit() {
  const c = document.getElementById('signature-settings-container');
  if (!c) return;
  c.innerHTML = `
  <div class="card border-0 shadow-sm mb-4">
    <div class="card-header bg-white fw-semibold d-flex align-items-center gap-2">
      <i class="bi bi-pen text-primary"></i>E-posta İmzası &amp; Profil
    </div>
    <div class="card-body">
      <div class="row g-3 mb-3">
        <div class="col-md-6">
          <label class="form-label small fw-semibold">Gönderen E-posta Adresi</label>
          <input type="email" class="form-control" id="sig-email" value="${esc(_userEmailAddr)}" placeholder="siz@firma.com">
          <div class="form-text">Domain Resend'de doğrulanmış olmalı</div>
        </div>
        <div class="col-md-6">
          <label class="form-label small fw-semibold">Görünen Ad</label>
          <input type="text" class="form-control" id="sig-name" value="${esc(_userDispName)}" placeholder="Adınız Soyadınız">
        </div>
      </div>
      <div class="mb-3">
        <label class="form-label small fw-semibold">E-posta İmzası <span class="text-muted fw-normal">(HTML desteklenir)</span></label>
        <div class="btn-group btn-group-sm mb-1" role="group">
          <button type="button" class="btn btn-outline-secondary" onclick="emailFormat('bold')" title="Kalın"><i class="bi bi-type-bold"></i></button>
          <button type="button" class="btn btn-outline-secondary" onclick="emailFormat('italic')" title="İtalik"><i class="bi bi-type-italic"></i></button>
          <button type="button" class="btn btn-outline-secondary" onclick="emailFormat('underline')" title="Altı çizili"><i class="bi bi-type-underline"></i></button>
        </div>
        <div id="sig-editor" contenteditable="true"
             class="form-control"
             style="min-height:120px;font-family:sans-serif;font-size:14px;line-height:1.6;"
        >${_userSig || '<p><strong>Adınız Soyadınız</strong><br>Ünvan · Windoform<br>Tel: +49 xxx xxx xxxx</p>'}</div>
      </div>
      <div class="d-flex gap-2 align-items-center">
        <button class="btn btn-primary btn-sm" onclick="signatureSave()"><i class="bi bi-check-lg me-1"></i>Kaydet</button>
        <button class="btn btn-outline-secondary btn-sm" onclick="signaturePreview()"><i class="bi bi-eye me-1"></i>Önizle</button>
        <span id="sig-save-status" class="text-success small" style="display:none;">✓ Kaydedildi</span>
      </div>
      <div id="sig-preview" class="mt-3 p-3 border rounded bg-light" style="display:none;"></div>
    </div>
  </div>`;
}

function signaturePreview() {
  const prev = document.getElementById('sig-preview');
  const ed   = document.getElementById('sig-editor');
  if (!prev || !ed) return;
  prev.style.display = '';
  prev.innerHTML     = `<div class="text-muted small mb-1">Önizleme:</div><hr>${ed.innerHTML}`;
}

async function signatureSave() {
  const email = document.getElementById('sig-email')?.value?.trim();
  const name  = document.getElementById('sig-name')?.value?.trim();
  const sig   = document.getElementById('sig-editor')?.innerHTML || '';

  try {
    const cfg   = loadFbConfig();
    const uid   = typeof authUid === 'function' ? authUid() : null;
    const token = await authToken();
    if (!uid) throw new Error('Giriş yapılmamış');

    await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/fuarEmployees/${uid}?updateMask.fieldPaths=emailAddress&updateMask.fieldPaths=name&updateMask.fieldPaths=emailSignature&key=${cfg.apiKey}`,
      {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ fields: {
          emailAddress:   { stringValue: email  || '' },
          name:           { stringValue: name   || '' },
          emailSignature: { stringValue: sig    || '' },
        }}),
      }
    );

    if (email) _userEmailAddr = email;
    if (name)  _userDispName  = name;
    _userSig = sig;

    const s = document.getElementById('sig-save-status');
    if (s) { s.style.display = ''; setTimeout(() => s.style.display = 'none', 3000); }
    _emToast('İmza kaydedildi ✓', 'success');
  } catch (e) { _emToast('Hata: ' + e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// UTIL
// ══════════════════════════════════════════════════════════════

function _emToast(msg, type = 'info') {
  if (typeof toast === 'function') toast(msg, type === 'error' ? 'danger' : type);
  else alert(msg);
}
