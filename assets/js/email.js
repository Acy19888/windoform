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
let _emailPageAll    = [];
let _emailContactMap = {}; // email → display name cache
let _emailPageFilter = 'inbound'; // current active tab filter
let _emailSearchQ    = '';         // current search query
let _emailSearchTimer = null;      // debounce timer for IMAP search
let _emailCacheTs    = 0;          // timestamp of last Firestore fetch (ms)
const _EMAIL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const _DEFAULT_PERMS = {
  admin: ['home','dashboard','companies','contacts','fuarbot','fuar-dashboard','fuar-users',
          'leads','teklifler','fatura','urunler','uretim','import','reports',
          'duplicates','musteri-geo','gorevler','add-company','add-contact','ayarlar','emails'],
  sales: ['home','dashboard','companies','contacts','teklifler','fatura','leads','emails','gorevler'],
};

const _ALL_PAGES = [
  { id:'home',          label:'Home',               icon:'bi-house-fill' },
  { id:'dashboard',     label:'Dashboard',          icon:'bi-graph-up' },
  { id:'companies',     label:'Firmalar',            icon:'bi-building' },
  { id:'contacts',      label:'Kişiler',             icon:'bi-people' },
  { id:'emails',        label:'E-postalar',          icon:'bi-envelope' },
  { id:'gorevler',      label:'Aufgaben',            icon:'bi-check2-square' },
  { id:'leads',         label:'Leads & Pipeline',    icon:'bi-funnel-fill' },
  { id:'teklifler',     label:'Teklifler',           icon:'bi-file-earmark-text-fill' },
  { id:'fatura',        label:'Fatura',              icon:'bi-receipt' },
  { id:'urunler',       label:'Ürünler',             icon:'bi-box-seam-fill' },
  { id:'uretim',        label:'Üretim',              icon:'bi-gear-fill' },
  { id:'fuarbot',       label:'Fuarbot Sync',        icon:'bi-qr-code-scan' },
  { id:'fuar-dashboard',label:'Fuar Dashboard',      icon:'bi-speedometer2' },
  { id:'fuar-users',    label:'Kullanıcılar',        icon:'bi-people-fill' },
  { id:'musteri-geo',   label:'Müşteri Geo',         icon:'bi-globe2' },
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
      // Cache-Key pro UID, damit mehrere Nutzer auf demselben Gerät korrekt funktionieren
      const _PROFILE_CACHE_KEY = `_wf_profile_${uid}`;

      // Zuerst gecachte Rolle laden (sofort, ohne Wartezeit)
      try {
        const cached = JSON.parse(localStorage.getItem(_PROFILE_CACHE_KEY) || 'null');
        if (cached) {
          _userDispName  = cached.name  || '';
          _userEmailAddr = cached.email || (typeof authEmail === 'function' ? authEmail() : '');
          _userSig       = cached.sig   || '';
          _userCrmRole   = cached.role  || 'sales';
          window._companyName    = cached.companyName    || '';
          window._companyPhone   = cached.companyPhone   || '';
          window._companyEmail   = cached.companyEmail   || '';
          window._companyWebsite = cached.companyWebsite || '';
          window._companyAddress = cached.companyAddress || '';
          window._companyLogo    = cached.companyLogo    || '';
          window._profilePhoto   = cached.profilePhoto   || '';
          // Sofort Tabs rendern mit gecachten Werten
          _applyRolePerms();
          _updateUserDisplay();
        }
      } catch(e) {}

      const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/fuarEmployees/${uid}?key=${cfg.apiKey}`;
      const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
      if (res.ok) {
        const doc = await res.json();
        const f = doc.fields || {};
        _userDispName  = f.name?.stringValue || f.displayName?.stringValue || '';
        _userEmailAddr = f.emailAddress?.stringValue || f.email?.stringValue || (typeof authEmail === 'function' ? authEmail() : '');
        _userSig       = f.emailSignature?.stringValue || '';
        _userCrmRole   = (f.crmRole?.stringValue || 'sales').toLowerCase();
        // Company & profile fields
        window._companyName    = f.companyName?.stringValue    || '';
        window._companyPhone   = f.companyPhone?.stringValue   || '';
        window._companyEmail   = f.companyEmail?.stringValue   || '';
        window._companyWebsite = f.companyWebsite?.stringValue || '';
        window._companyAddress = f.companyAddress?.stringValue || '';
        window._companyLogo    = f.companyLogo?.stringValue    || '';
        window._profilePhoto   = f.profilePhoto?.stringValue   || '';
        // Profil im localStorage cachen für Offline/Quota-Fälle
        try {
          localStorage.setItem(_PROFILE_CACHE_KEY, JSON.stringify({
            name: _userDispName, email: _userEmailAddr, sig: _userSig, role: _userCrmRole,
            companyName: window._companyName, companyPhone: window._companyPhone,
            companyEmail: window._companyEmail, companyWebsite: window._companyWebsite,
            companyAddress: window._companyAddress, companyLogo: window._companyLogo,
            profilePhoto: window._profilePhoto
          }));
        } catch(e) {}
        // Update Home greeting with real name if home page already loaded
        _homeUpdateGreeting();
      }
    }

    // Zentrale Firma-Info laden (überschreibt ggf. User-spezifische Werte)
    _loadCompanyInfo();

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
  // Settings initialisieren falls Ayarlar offen
  if (document.getElementById('company-settings-container'))   companySettingsInit();
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
    // Use IndexedDB (contacts already synced there — zero Firestore reads)
    if (typeof dbAll === 'function') {
      const contacts = await dbAll('contacts');
      if (contacts && contacts.length > 0) {
        _emailContactsCache = contacts
          .filter(c => c.email || c.contactEmail)
          .map(c => ({
            name:  [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || c.firma || '',
            email: c.contactEmail || c.email || '',
            firma: c.firma || '',
          }))
          .filter(c => c.email);
        return;
      }
    }
    // Fallback: Firestore (only if IndexedDB empty/unavailable)
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
      const sigPart = sigSep > -1 ? bodyEl.innerHTML.slice(sigSep) : (_userSig ? `<p><span style="color:#888">--</span></p>${_userSig}` : '');
      // Strip any trailing sign-off the AI may have added (lines after last blank line that look like a signature)
      let improved = data.improved.trim();
      improved = improved.replace(/\n+(Mit freundlichen Grüßen|Freundliche Grüße|Kind regards|Best regards|Regards|Viele Grüße|Mit besten Grüßen)[^\n]*/gi, '').trim();
      bodyEl.innerHTML = `<p>${improved.replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>')}</p>` + sigPart;
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
      toRaw:        { stringValue: _emContact?.name ? `${_emContact.name} <${to}>` : to },
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

    // Check if recipient is already a CRM contact — if not, prompt to add
    try {
      if (typeof dbAll === 'function') {
        const allContacts = await dbAll('contacts');
        const toEmail = to.trim().toLowerCase();
        const exists  = allContacts.some(c => c.email?.trim().toLowerCase() === toEmail);
        if (!exists) {
          // Extract name from display: "Name <email>" or just email
          const nameGuess = (_emContact?.name && _emContact.name !== to) ? _emContact.name : '';
          _emShowAddContactPrompt(to, nameGuess);
        }
      }
    } catch (_) {}

    // Invalidate timeline cache for this contact so next open fetches fresh data
    if (contactId) _emailTimelineCache.delete(contactId);
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

    // E-Mails für Timeline-Integration cachen
    window._cmEmails = emails;
    if (typeof window._contRenderTimeline === 'function') window._contRenderTimeline();

  } catch (e) {
    c.innerHTML = `<div class="alert alert-warning small m-2">E-postalar yüklenemedi: ${esc(e.message)}</div>`;
  }
}

// Expose für onclick im HTML
window._emContactRef = null;

// ── Emails für Timeline laden (ohne Panel zu rendern) ────────
// In-memory cache so re-opening same contact doesn't re-read Firestore
const _emailTimelineCache = new Map(); // contactId → emails[]

async function emailLoadContactEmailsSilent(contactId) {
  // Return from memory cache if available
  if (_emailTimelineCache.has(contactId)) {
    window._cmEmails = _emailTimelineCache.get(contactId);
    if (typeof _contRenderTimeline === 'function') _contRenderTimeline();
    return;
  }
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
          limit:   30,
        }}),
      }
    );
    if (!res.ok) return;
    const rows = await res.json();
    const emails = _parseEmailRows(rows);
    _emailTimelineCache.set(contactId, emails); // cache in memory
    window._cmEmails = emails;
    if (typeof window._contRenderTimeline === 'function') window._contRenderTimeline();
  } catch (_) {}
}

function _parseEmailRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter(r => r.document)
    .map(r => {
      const f = r.document.fields || {};
      return {
        _id:       r.document.name.split('/').pop(),
        direction: f.direction?.stringValue || 'outbound',
        contactId: f.contactId?.stringValue || '',
        from:      f.fromRaw?.stringValue || f.from?.stringValue || '',
        to:        f.toRaw?.stringValue  || f.to?.stringValue   || '',
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
  const isOut   = em.direction === 'outbound';
  const dt      = em.sentAt ? new Date(em.sentAt).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
  const preview = (em.text || (em.html||'').replace(/<[^>]+>/g, '')).slice(0, 80).replace(/\s+/g,' ').trim();
  const nameRaw = isOut ? (em.to||'') : (em.from||'');
  const nameMatch = nameRaw.match(/^([^<]+?)\s*</);
  const namePart  = (nameMatch ? nameMatch[1].trim() : nameRaw.replace(/<[^>]+>/g,'').trim()) || (isOut ? 'Alıcı' : 'Gönderici');

  return `
  <div class="email-item d-flex gap-2 p-2 border-bottom align-items-start"
       style="cursor:pointer;font-size:13px;"
       onclick="emailShowDetail('${esc(em._id)}')">
    <i class="bi ${isOut ? 'bi-arrow-up-right text-primary' : 'bi-arrow-down-left text-success'} mt-1" style="flex-shrink:0;"></i>
    <div class="flex-grow-1 min-w-0" style="overflow:hidden;">
      <div class="d-flex justify-content-between align-items-center gap-1">
        <span class="fw-bold text-truncate" style="color:#1e293b;">${esc(namePart)}</span>
        <div class="d-flex gap-1 align-items-center flex-shrink-0">
          ${_tickHtml(em)}
          <span class="text-muted" style="font-size:11px;white-space:nowrap;">${dt}</span>
        </div>
      </div>
      <div class="text-truncate fw-semibold" style="font-size:12px;color:#334155;">${esc(em.subject||'(Konu yok)')}</div>
      ${preview ? `<div class="text-muted text-truncate" style="font-size:11px;opacity:.7;">${esc(preview)}</div>` : ''}
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

    // Delete-Button
    const delBtn = document.getElementById('em-detail-delete-btn');
    if (delBtn) delBtn.onclick = () => {
      bootstrap.Modal.getOrCreateInstance(modal).hide();
      setTimeout(() => emailDelete(emailId), 300);
    };

  } catch (e) {
    document.getElementById('em-detail-body').innerHTML =
      `<div class="alert alert-danger small">Yüklenemedi: ${esc(e.message)}</div>`;
  }
}

// ══════════════════════════════════════════════════════════════
// E-POSTA SİL
// ══════════════════════════════════════════════════════════════

async function emailDelete(emailId) {
  if (!emailId) return;
  if (!confirm('Bu e-postayı silmek istediğinizden emin misiniz?')) return;
  try {
    const cfg   = loadFbConfig();
    const token = await authToken();
    const res   = await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${_EM_COL}/${emailId}?key=${cfg.apiKey}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok && res.status !== 404) throw new Error('Silinemedi: ' + res.status);
    _emToast('E-posta silindi', 'success');
    // Refresh whichever view is open
    if (document.getElementById('emails-page-content')?.closest('.page-section')?.style?.display !== 'none') {
      loadEmailsPage();
    }
    if (window.currentModalContactId) {
      emailLoadContactEmails(window.currentModalContactId);
    }
  } catch (e) {
    _emToast('Silme hatası: ' + e.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════════
// GLOBALE E-POSTA SEITE
// ══════════════════════════════════════════════════════════════

function _renderEmailPage(c) {
  const inboundCnt  = _emailPageAll.filter(e => e.direction === 'inbound').length;
  const outboundCnt = _emailPageAll.filter(e => e.direction === 'outbound').length;
  const inboundEmails = _emailPageAll.filter(e => e.direction === 'inbound');
  const defaultTab    = inboundEmails.length ? 'inbound' : 'all';
  const defaultList   = inboundEmails.length ? inboundEmails : _emailPageAll;
  _emailPageFilter    = defaultTab;

  c.innerHTML = `
  <div class="em-page-header">
    <div class="em-page-tabs" id="em-page-tabs">
      <button class="em-tab-btn${defaultTab==='inbound'?' active':''}" onclick="emailPageFilter('inbound',this)">
        <i class="bi bi-arrow-down-left me-1"></i>Gelen
        ${inboundCnt ? `<span class="em-tab-badge em-tab-badge-in">${inboundCnt}</span>` : ''}
      </button>
      <button class="em-tab-btn${defaultTab==='outbound'?' active':''}" onclick="emailPageFilter('outbound',this)">
        <i class="bi bi-arrow-up-right me-1"></i>Giden
        ${outboundCnt ? `<span class="em-tab-badge em-tab-badge-out">${outboundCnt}</span>` : ''}
      </button>
      <button class="em-tab-btn${defaultTab==='all'?' active':''}" onclick="emailPageFilter('all',this)">
        Tümü <span class="em-tab-badge">${_emailPageAll.length}</span>
      </button>
    </div>
  </div>
  <div id="em-page-list" class="em-page-list">
    ${defaultList.length
      ? defaultList.map(_renderEmailPageItem).join('')
      : '<div class="em-empty-state"><i class="bi bi-inbox"></i><div>Henüz e-posta yok</div></div>'}
  </div>`;
}

async function loadEmailsPage(forceRefresh = false) {
  const c      = document.getElementById('emails-page-content');
  const refBtn = document.getElementById('em-refresh-btn');
  if (!c) return;

  const cacheValid = !forceRefresh && _emailPageAll.length > 0 && (Date.now() - _emailCacheTs) < _EMAIL_CACHE_TTL;

  if (!cacheValid) {
    c.innerHTML = '<div class="text-center py-5"><span class="spinner-border"></span></div>';
  }
  if (refBtn) refBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

  try {
    // Only sync IMAP when explicitly refreshing or first load
    if (forceRefresh || _emailCacheTs === 0) {
      fetch('/api/email/imap-sync')
        .then(r => r.json()).catch(() => ({}))
        .then(syncData => {
          if (!syncData.ok && syncData.error) {
            console.warn('[imap-sync] error:', syncData.error);
            _emToast(`IMAP Sync Hatası: ${syncData.error}`, 'danger');
          } else if (syncData.ok && syncData.saved > 0) {
            _emToast(`${syncData.saved} yeni e-posta alındı`, 'success');
            _emailCacheTs = 0; // invalidate cache so refresh fetches fresh
            _refreshEmailListSilent();
          }
        });
    }

    // Use cache if still valid
    if (cacheValid) {
      _renderEmailPage(c);
      if (refBtn) refBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i>';
      return;
    }

    const cfg   = loadFbConfig();
    const token = await authToken();

    // Try with auth token first, then fallback to API-key-only if permission denied
    let rows;
    const queryBody = JSON.stringify({ structuredQuery: {
      from:    [{ collectionId: _EM_COL }],
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
      limit:   100,  // reduced from 200 to save Firestore quota
    }});
    const fsUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents:runQuery?key=${cfg.apiKey}`;

    const res1 = await fetch(fsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: queryBody,
    });
    rows = await res1.json();

    // If result is an error object (permission denied etc), try without auth header
    if (!Array.isArray(rows) || rows[0]?.error) {
      console.warn('[emails] Auth query failed, trying without token:', rows);
      const res2 = await fetch(fsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: queryBody,
      });
      rows = await res2.json();
    }

    let allEmails = _parseEmailRows(rows);

    // Sales-User: nur eigene Emails anzeigen
    if (_userCrmRole !== 'admin') {
      const myUid   = typeof authUid   === 'function' ? authUid()   : null;
      const myEmail = typeof authEmail === 'function' ? (authEmail() || '').toLowerCase() : '';
      if (myUid || myEmail) {
        allEmails = allEmails.filter(e =>
          e.createdByUid === myUid ||
          (myEmail && (e.from||'').toLowerCase().includes(myEmail)) ||
          (myEmail && (e.to  ||'').toLowerCase().includes(myEmail))
        );
      }
    }

    _emailPageAll = allEmails;
    _emailCacheTs = Date.now(); // update cache timestamp

    // Build email→name lookup from contacts (for display names)
    try {
      if (typeof dbAll === 'function') {
        const cons = await dbAll('contacts');
        _emailContactMap = {};
        cons.forEach(c => {
          if (c.email) _emailContactMap[c.email.trim().toLowerCase()] = c.name || '';
        });
      }
    } catch (_) { /* ignore */ }

    _renderEmailPage(c);

  } catch (e) {
    c.innerHTML = `<div class="alert alert-danger">Hata: ${esc(e.message)}</div>`;
  } finally {
    if (refBtn) refBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i>';
  }
}

// Silently reload email list after background IMAP sync completes
async function _refreshEmailListSilent() {
  try {
    const cfg   = loadFbConfig();
    const token = await authToken();
    const qBody = JSON.stringify({ structuredQuery: {
      from:    [{ collectionId: _EM_COL }],
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
      limit:   200,
    }});
    const fsUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents:runQuery?key=${cfg.apiKey}`;
    let rows = await (await fetch(fsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: qBody,
    })).json();
    if (!Array.isArray(rows) || rows[0]?.error) {
      rows = await (await fetch(fsUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: qBody })).json();
    }
    _emailPageAll = _parseEmailRows(rows);
    // Re-render whichever tab is active
    const list = document.getElementById('em-page-list');
    if (!list) return;
    let data = _emailPageAll;
    if (_emailPageFilter === 'inbound')  data = data.filter(e => e.direction === 'inbound');
    if (_emailPageFilter === 'outbound') data = data.filter(e => e.direction === 'outbound');
    list.innerHTML = data.length
      ? data.map(_renderEmailPageItem).join('')
      : '<div class="em-empty-state"><i class="bi bi-inbox"></i><div>Henüz e-posta yok</div></div>';
    // Update counts
    const inboundCnt  = _emailPageAll.filter(e => e.direction === 'inbound').length;
    const outboundCnt = _emailPageAll.filter(e => e.direction === 'outbound').length;
    document.querySelectorAll('#em-page-tabs .em-tab-btn').forEach(btn => {
      const f = btn.dataset?.filter || 'all';
      const badge = btn.querySelector('.badge');
      if (badge) badge.textContent = f === 'inbound' ? inboundCnt : f === 'outbound' ? outboundCnt : _emailPageAll.length;
    });
  } catch (_) {}
}

function emailPageFilter(f, el) {
  _emailPageFilter = f;
  document.querySelectorAll('#em-page-tabs .em-tab-btn').forEach(l => l.classList.remove('active'));
  el.classList.add('active');
  const list = document.getElementById('em-page-list');
  if (!list) return;
  const data = _getFilteredEmails();
  list.innerHTML = data.length
    ? data.map(_renderEmailPageItem).join('')
    : '<div class="text-muted text-center py-5">Sonuç yok</div>';
}

function _getFilteredEmails() {
  let data = _emailPageAll;
  if (_emailPageFilter === 'inbound')  data = data.filter(e => e.direction === 'inbound');
  if (_emailPageFilter === 'outbound') data = data.filter(e => e.direction === 'outbound');
  if (_emailSearchQ) {
    const q = _emailSearchQ.toLowerCase();
    data = data.filter(e =>
      (e.subject || '').toLowerCase().includes(q) ||
      (e.from    || '').toLowerCase().includes(q) ||
      (e.to      || '').toLowerCase().includes(q) ||
      (e.text    || '').toLowerCase().includes(q)
    );
  }
  return data;
}

function emailPageSearch(val) {
  _emailSearchQ = val.trim();
  const list = document.getElementById('em-page-list');
  if (!list) return;

  // Instant local filter
  const data = _getFilteredEmails();
  list.innerHTML = data.length
    ? data.map(_renderEmailPageItem).join('')
    : `<div class="text-muted text-center py-5"><i class="bi bi-search d-block mb-2" style="font-size:2rem;opacity:.3;"></i>${_emailSearchQ ? 'Sonuç bulunamadı' : 'Henüz e-posta yok'}</div>`;

  // After 600ms, also search IMAP for results not yet cached
  clearTimeout(_emailSearchTimer);
  if (_emailSearchQ.length >= 2) {
    _emailSearchTimer = setTimeout(async () => {
      try {
        const searchIcon = document.getElementById('em-search-input');
        if (searchIcon) searchIcon.style.background = 'linear-gradient(90deg,#f0f0ff,#fff)';
        const res  = await fetch(`/api/email/imap-sync?q=${encodeURIComponent(_emailSearchQ)}`);
        const data = await res.json().catch(() => ({}));
        if (searchIcon) searchIcon.style.background = '';
        if (data.ok && data.saved > 0) {
          // New results found on IMAP — reload and re-filter
          await _refreshEmailListSilent();
          const updated = _getFilteredEmails();
          list.innerHTML = updated.length
            ? updated.map(_renderEmailPageItem).join('')
            : '<div class="text-muted text-center py-5">Sonuç bulunamadı</div>';
        }
      } catch (_) {}
    }, 600);
  }
}

function _renderEmailPageItem(em) {
  const isOut    = em.direction === 'outbound';
  const dt       = em.sentAt ? new Date(em.sentAt).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
  const nameRaw  = isOut ? (em.to || '') : (em.from || '');
  // Extract plain email from "Name <email>" or bare address
  const addrMatch = nameRaw.match(/<([^>]+)>/);
  const emailAddr = (addrMatch ? addrMatch[1] : nameRaw.replace(/<[^>]+>/g,'')).trim().toLowerCase();
  // 1) CRM contact name, 2) display name in "Name <email>" format, 3) email address
  const nameMatch = nameRaw.match(/^([^<]+?)\s*</);
  const namePart  = _emailContactMap[emailAddr]
                    || (nameMatch ? nameMatch[1].trim() : '')
                    || nameRaw.replace(/<[^>]+>/g,'').trim()
                    || (isOut ? 'Alıcı' : 'Gönderici');
  const initials  = namePart.split(/[\s@]+/).filter(Boolean).slice(0,2).map(w => w[0]?.toUpperCase()).join('');
  const avatarBg  = isOut ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : 'linear-gradient(135deg,#10b981,#059669)';
  const preview   = (em.text || em.html?.replace(/<[^>]+>/g,'')||'').slice(0,80).replace(/\s+/g,' ').trim();
  return `
  <div class="em-list-item" onclick="emailShowDetail('${esc(em._id)}')">
    <div class="em-avatar" style="background:${avatarBg}">${initials || (isOut ? '→' : '←')}</div>
    <div class="em-item-body">
      <div class="em-item-top">
        <span class="em-item-name">${esc(namePart)}</span>
        <div class="em-item-meta-right">
          ${_tickHtml(em)}
          <span class="em-item-time">${dt}</span>
          <button class="em-delete-btn" onclick="event.stopPropagation();emailDelete('${esc(em._id)}')" title="Sil">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
      <div class="em-item-subject-row">${esc(em.subject || '(Konu yok)')}</div>
      ${preview ? `<div class="em-item-preview">${esc(preview)}</div>` : ''}
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

function companySettingsInit() {
  const c = document.getElementById('company-settings-container');
  if (!c) return;
  const logo = window._companyLogo || '';
  c.innerHTML = `
  <div class="card border-0 shadow-sm mb-4">
    <div class="card-header bg-white fw-semibold d-flex align-items-center gap-2 py-3">
      <i class="bi bi-building text-primary" style="font-size:18px;"></i>
      <div>
        <div>Firma Bilgileri</div>
        <div class="text-muted fw-normal" style="font-size:12px;">E-posta imzasında ve tekliflerde görünür</div>
      </div>
    </div>
    <div class="card-body">
      <div class="d-flex gap-4 align-items-start mb-4">
        <!-- Logo upload -->
        <div class="text-center">
          <div id="company-logo-wrap" onclick="document.getElementById('company-logo-input').click()"
               style="width:90px;height:90px;border-radius:12px;border:2px dashed #cbd5e1;display:flex;align-items:center;justify-content:center;cursor:pointer;background:#f8faff;overflow:hidden;transition:border-color .15s;"
               onmouseover="this.style.borderColor='#6366f1'" onmouseout="this.style.borderColor='#cbd5e1'">
            ${logo
              ? `<img id="company-logo-preview" src="${logo}" style="width:100%;height:100%;object-fit:contain;">`
              : `<div id="company-logo-placeholder" style="text-align:center;color:#94a3b8;font-size:11px;padding:8px;"><i class="bi bi-image" style="font-size:24px;display:block;margin-bottom:4px;"></i>Logo Yükle</div>`}
          </div>
          <input type="file" id="company-logo-input" accept="image/*" style="display:none" onchange="settingsUploadLogo(this)">
          <div class="text-muted mt-1" style="font-size:10px;">PNG, JPG · max 500KB</div>
        </div>
        <!-- Fields -->
        <div class="flex-grow-1">
          <div class="row g-2">
            <div class="col-12">
              <label class="form-label small fw-semibold mb-1">Firma Adı</label>
              <input type="text" class="form-control form-control-sm" id="comp-name" value="${esc(window._companyName||'')}" placeholder="Windoform GmbH" ${_userCrmRole !== 'admin' ? 'readonly' : ''}>
            </div>
            <div class="col-md-6">
              <label class="form-label small fw-semibold mb-1">Telefon</label>
              <input type="text" class="form-control form-control-sm" id="comp-phone" value="${esc(window._companyPhone||'')}" placeholder="+49 xxx xxx xxxx" ${_userCrmRole !== 'admin' ? 'readonly' : ''}>
            </div>
            <div class="col-md-6">
              <label class="form-label small fw-semibold mb-1">E-posta</label>
              <input type="email" class="form-control form-control-sm" id="comp-email" value="${esc(window._companyEmail||'')}" placeholder="info@windoform.de" ${_userCrmRole !== 'admin' ? 'readonly' : ''}>
            </div>
            <div class="col-md-6">
              <label class="form-label small fw-semibold mb-1">Website</label>
              <input type="text" class="form-control form-control-sm" id="comp-website" value="${esc(window._companyWebsite||'')}" placeholder="www.windoform.de" ${_userCrmRole !== 'admin' ? 'readonly' : ''}>
            </div>
            <div class="col-md-6">
              <label class="form-label small fw-semibold mb-1">Adres</label>
              <input type="text" class="form-control form-control-sm" id="comp-address" value="${esc(window._companyAddress||'')}" placeholder="Musterstraße 1, 12345 Stadt" ${_userCrmRole !== 'admin' ? 'readonly' : ''}>
            </div>
          </div>
        </div>
      </div>
      <div class="d-flex gap-2 align-items-center">
        ${_userCrmRole === 'admin'
          ? `<button class="btn btn-primary btn-sm" onclick="companySave()"><i class="bi bi-floppy me-1"></i>Firma Bilgilerini Kaydet</button>
             <span id="comp-save-status" class="text-success small" style="display:none;">✓ Kaydedildi</span>`
          : `<div class="alert alert-info py-1 px-2 mb-0 small"><i class="bi bi-info-circle me-1"></i>Nur Admins können Firmendaten speichern.</div>`
        }
      </div>
    </div>
  </div>`;
}

function signatureSettingsInit() {
  const c = document.getElementById('signature-settings-container');
  if (!c) return;
  const photo = window._profilePhoto || '';
  c.innerHTML = `
  <div class="card border-0 shadow-sm mb-4">
    <div class="card-header bg-white fw-semibold d-flex align-items-center gap-2 py-3">
      <i class="bi bi-pen text-primary" style="font-size:18px;"></i>
      <div>
        <div>Profil &amp; E-posta İmzası</div>
        <div class="text-muted fw-normal" style="font-size:12px;">Gönderen bilgisi ve e-posta altı imzası</div>
      </div>
    </div>
    <div class="card-body">
      <div class="d-flex gap-4 align-items-start mb-4">
        <!-- Profile photo -->
        <div class="text-center">
          <div id="profile-photo-wrap" onclick="document.getElementById('profile-photo-input').click()"
               style="width:72px;height:72px;border-radius:50%;border:2px dashed #cbd5e1;display:flex;align-items:center;justify-content:center;cursor:pointer;background:linear-gradient(135deg,#e0e7ff,#f0f4ff);overflow:hidden;transition:border-color .15s;"
               onmouseover="this.style.borderColor='#6366f1'" onmouseout="this.style.borderColor='#cbd5e1'">
            ${photo
              ? `<img id="profile-photo-preview" src="${photo}" style="width:100%;height:100%;object-fit:cover;">`
              : `<div id="profile-photo-placeholder" style="text-align:center;color:#6366f1;font-size:11px;padding:4px;"><i class="bi bi-person" style="font-size:28px;display:block;"></i></div>`}
          </div>
          <input type="file" id="profile-photo-input" accept="image/*" style="display:none" onchange="settingsUploadPhoto(this)">
          <div class="text-muted mt-1" style="font-size:10px;">Profil Fotoğrafı</div>
        </div>
        <!-- Name & email -->
        <div class="flex-grow-1">
          <div class="row g-2">
            <div class="col-12">
              <label class="form-label small fw-semibold mb-1">Görünen Ad</label>
              <input type="text" class="form-control form-control-sm" id="sig-name" value="${esc(_userDispName)}" placeholder="Adınız Soyadınız">
            </div>
            <div class="col-12">
              <label class="form-label small fw-semibold mb-1">Gönderen E-posta</label>
              <input type="email" class="form-control form-control-sm" id="sig-email" value="${esc(_userEmailAddr)}" placeholder="siz@windoform.de">
              <div class="form-text">Domain Resend'de doğrulanmış olmalı</div>
            </div>
          </div>
        </div>
      </div>
      <div class="mb-3">
        <label class="form-label small fw-semibold">E-posta İmzası</label>
        <div class="d-flex gap-1 mb-1">
          <button type="button" class="btn btn-xs btn-outline-secondary px-2 py-0" onclick="document.getElementById('sig-editor').focus();document.execCommand('bold')" title="Kalın"><i class="bi bi-type-bold"></i></button>
          <button type="button" class="btn btn-xs btn-outline-secondary px-2 py-0" onclick="document.getElementById('sig-editor').focus();document.execCommand('italic')" title="İtalik"><i class="bi bi-type-italic"></i></button>
          <button type="button" class="btn btn-xs btn-outline-secondary px-2 py-0" onclick="document.getElementById('sig-editor').focus();document.execCommand('underline')" title="Altı çizili"><i class="bi bi-type-underline"></i></button>
          <button type="button" class="btn btn-xs btn-outline-secondary px-2 py-0 ms-2" onclick="signatureAutoGenerate()" title="Firma bilgilerinden otomatik oluştur">
            <i class="bi bi-magic me-1"></i>Otomatik Oluştur
          </button>
        </div>
        <div id="sig-editor" contenteditable="true"
             class="form-control"
             style="min-height:120px;font-family:sans-serif;font-size:14px;line-height:1.6;"
        >${_userSig || '<p><strong>Adınız Soyadınız</strong><br>Ünvan · Windoform<br>Tel: +49 xxx xxx xxxx</p>'}</div>
      </div>
      <div class="d-flex gap-2 align-items-center flex-wrap">
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
  const photo = window._profilePhotoNew || window._profilePhoto || '';

  try {
    const cfg   = loadFbConfig();
    const uid   = typeof authUid === 'function' ? authUid() : null;
    const token = await authToken();
    if (!uid) throw new Error('Giriş yapılmamış');

    const mask = 'updateMask.fieldPaths=emailAddress&updateMask.fieldPaths=name&updateMask.fieldPaths=emailSignature&updateMask.fieldPaths=profilePhoto';
    await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/fuarEmployees/${uid}?${mask}&key=${cfg.apiKey}`,
      {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ fields: {
          emailAddress:   { stringValue: email || '' },
          name:           { stringValue: name  || '' },
          emailSignature: { stringValue: sig   || '' },
          profilePhoto:   { stringValue: photo || '' },
        }}),
      }
    );

    if (email) _userEmailAddr = email;
    if (name)  _userDispName  = name;
    _userSig = sig;
    if (photo) { window._profilePhoto = photo; window._profilePhotoNew = null; }

    const s = document.getElementById('sig-save-status');
    if (s) { s.style.display = ''; setTimeout(() => s.style.display = 'none', 3000); }
    _emToast('Profil & imza kaydedildi ✓', 'success');
  } catch (e) { _emToast('Hata: ' + e.message, 'error'); }
}

async function companySave() {
  if (_userCrmRole !== 'admin') { _emToast('Nur Admins können Firmendaten speichern', 'error'); return; }

  const name    = document.getElementById('comp-name')?.value?.trim()    || '';
  const phone   = document.getElementById('comp-phone')?.value?.trim()   || '';
  const email   = document.getElementById('comp-email')?.value?.trim()   || '';
  const website = document.getElementById('comp-website')?.value?.trim() || '';
  const address = document.getElementById('comp-address')?.value?.trim() || '';
  const logo    = window._companyLogoNew || window._companyLogo || '';

  try {
    const cfg   = loadFbConfig();
    const token = await authToken();

    // ── Zentral für alle User speichern (_sync/companyInfo) ──
    const mask = ['companyName','companyPhone','companyEmail','companyWebsite','companyAddress','companyLogo']
      .map(f => `updateMask.fieldPaths=${f}`).join('&');
    await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/_sync/companyInfo?${mask}&key=${cfg.apiKey}`,
      {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ fields: {
          companyName:    { stringValue: name    },
          companyPhone:   { stringValue: phone   },
          companyEmail:   { stringValue: email   },
          companyWebsite: { stringValue: website },
          companyAddress: { stringValue: address },
          companyLogo:    { stringValue: logo    },
        }}),
      }
    );

    window._companyName    = name;
    window._companyPhone   = phone;
    window._companyEmail   = email;
    window._companyWebsite = website;
    window._companyAddress = address;
    if (logo) { window._companyLogo = logo; window._companyLogoNew = null; }

    // Lokal cachen damit alle User es sofort haben
    try {
      const ci = { companyName:name, companyPhone:phone, companyEmail:email, companyWebsite:website, companyAddress:address, companyLogo:logo };
      localStorage.setItem('_wf_companyInfo', JSON.stringify(ci));
    } catch(_) {}

    const s = document.getElementById('comp-save-status');
    if (s) { s.style.display = ''; setTimeout(() => s.style.display = 'none', 3000); }
    _emToast('Firma bilgileri kaydedildi ✓ (für alle Benutzer)', 'success');
  } catch (e) { _emToast('Hata: ' + e.message, 'error'); }
}

// ── Firma-Info zentral laden (für alle User) ───────────────────
async function _loadCompanyInfo() {
  // 1. Zuerst aus localStorage-Cache (sofort)
  try {
    const ci = JSON.parse(localStorage.getItem('_wf_companyInfo') || 'null');
    if (ci) {
      window._companyName    = ci.companyName    || window._companyName    || '';
      window._companyPhone   = ci.companyPhone   || window._companyPhone   || '';
      window._companyEmail   = ci.companyEmail   || window._companyEmail   || '';
      window._companyWebsite = ci.companyWebsite || window._companyWebsite || '';
      window._companyAddress = ci.companyAddress || window._companyAddress || '';
      window._companyLogo    = ci.companyLogo    || window._companyLogo    || '';
    }
  } catch(_) {}

  // 2. Dann aus Firestore (aktuellste Version)
  try {
    const cfg   = loadFbConfig();
    const token = typeof authToken === 'function' ? await authToken() : null;
    const res   = await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/_sync/companyInfo?key=${cfg.apiKey}`,
      token ? { headers: { Authorization: `Bearer ${token}` } } : {}
    );
    if (!res.ok) return;
    const f = (await res.json()).fields || {};
    if (f.companyName?.stringValue) {
      window._companyName    = f.companyName?.stringValue    || '';
      window._companyPhone   = f.companyPhone?.stringValue   || '';
      window._companyEmail   = f.companyEmail?.stringValue   || '';
      window._companyWebsite = f.companyWebsite?.stringValue || '';
      window._companyAddress = f.companyAddress?.stringValue || '';
      window._companyLogo    = f.companyLogo?.stringValue    || '';
      // Lokal cachen
      try {
        localStorage.setItem('_wf_companyInfo', JSON.stringify({
          companyName: window._companyName, companyPhone: window._companyPhone,
          companyEmail: window._companyEmail, companyWebsite: window._companyWebsite,
          companyAddress: window._companyAddress, companyLogo: window._companyLogo,
        }));
      } catch(_) {}
    }
  } catch(_) {}
}

// ── Image upload helpers ───────────────────────────────────────
async function settingsUploadLogo(input) {
  const file = input.files[0]; if (!file) return;
  if (file.size > 512 * 1024) { _emToast('Dosya 500KB\'dan küçük olmalı', 'error'); return; }
  const b64 = await _compressImage(file, 300);
  window._companyLogoNew = b64;
  const wrap = document.getElementById('company-logo-wrap');
  if (wrap) wrap.innerHTML = `<img src="${b64}" style="width:100%;height:100%;object-fit:contain;">`;
}

async function settingsUploadPhoto(input) {
  const file = input.files[0]; if (!file) return;
  if (file.size > 512 * 1024) { _emToast('Dosya 500KB\'dan küçük olmalı', 'error'); return; }
  const b64 = await _compressImage(file, 200);
  window._profilePhotoNew = b64;
  const wrap = document.getElementById('profile-photo-wrap');
  if (wrap) wrap.innerHTML = `<img src="${b64}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
}

function _compressImage(file, maxW = 300) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale  = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function signatureAutoGenerate() {
  const ed = document.getElementById('sig-editor');
  if (!ed) return;
  const name    = document.getElementById('sig-name')?.value?.trim()  || _userDispName || 'Adınız Soyadınız';
  const company = window._companyName    || 'Windoform';
  const phone   = window._companyPhone   || '';
  const email   = window._companyEmail   || _userEmailAddr || '';
  const website = window._companyWebsite || '';
  const logo    = window._companyLogo    || '';
  const photo   = window._profilePhotoNew || window._profilePhoto || '';

  let html = `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;color:#334155;">
  <tr>`;
  if (photo) {
    html += `<td style="padding-right:14px;vertical-align:top;">
      <img src="${photo}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;">
    </td>`;
  }
  html += `<td style="vertical-align:top;border-left:3px solid #6366f1;padding-left:12px;">
      <div style="font-weight:700;font-size:14px;color:#1e293b;">${esc(name)}</div>`;
  if (company) html += `<div style="color:#6366f1;font-size:12px;margin-bottom:6px;">${esc(company)}</div>`;
  if (phone)   html += `<div><span style="color:#94a3b8;">Tel:</span> ${esc(phone)}</div>`;
  if (email)   html += `<div><span style="color:#94a3b8;">E-posta:</span> ${esc(email)}</div>`;
  if (website) html += `<div><span style="color:#94a3b8;">Web:</span> <a href="https://${esc(website)}" style="color:#6366f1;">${esc(website)}</a></div>`;
  if (logo)    html += `<div style="margin-top:8px;"><img src="${logo}" style="max-height:36px;max-width:120px;object-fit:contain;"></div>`;
  html += `</td></tr></table>`;

  ed.innerHTML = html;
  _emToast('İmza oluşturuldu — beğenmezseniz düzenleyebilirsiniz', 'success');
}

// ══════════════════════════════════════════════════════════════
// UTIL
// ══════════════════════════════════════════════════════════════

function _emToast(msg, type = 'info') {
  if (typeof toast === 'function') toast(msg, type === 'error' ? 'danger' : type);
  else alert(msg);
}

function _emShowAddContactPrompt(email, nameGuess) {
  // Remove any existing prompt
  document.getElementById('_em-add-contact-prompt')?.remove();

  const banner = document.createElement('div');
  banner.id = '_em-add-contact-prompt';
  banner.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;background:#fff;border:1.5px solid #6366f1;border-radius:12px;box-shadow:0 4px 24px rgba(99,102,241,.18);padding:14px 18px;max-width:340px;display:flex;align-items:center;gap:12px;';
  banner.innerHTML = `
    <i class="bi bi-person-plus-fill" style="font-size:1.4rem;color:#6366f1;flex-shrink:0;"></i>
    <div style="flex:1;min-width:0;">
      <div style="font-weight:600;font-size:13px;color:#1e293b;">CRM'de kayıtlı değil</div>
      <div style="font-size:12px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(email)}</div>
    </div>
    <button onclick="_emQuickAddContact('${esc(email)}','${esc(nameGuess)}')" style="background:#6366f1;color:#fff;border:none;border-radius:7px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">+ Ekle</button>
    <button onclick="document.getElementById('_em-add-contact-prompt')?.remove()" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;line-height:1;padding:0 2px;">×</button>
  `;
  document.body.appendChild(banner);
  // Auto-dismiss after 12 seconds
  setTimeout(() => banner.remove(), 12000);
}

function _emQuickAddContact(email, nameGuess) {
  document.getElementById('_em-add-contact-prompt')?.remove();
  // Navigate to add-contact page and pre-fill email/name
  if (typeof showPage === 'function') showPage('add-contact');
  setTimeout(() => {
    const emailEl = document.getElementById('act-email');
    const nameEl  = document.getElementById('act-name');
    if (emailEl) emailEl.value = email;
    if (nameEl && nameGuess) nameEl.value = nameGuess;
    // Focus on name field
    (nameEl || emailEl)?.focus();
  }, 350);
}
