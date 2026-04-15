'use strict';

// ── Konstanten ───────────────────────────────────────────────
const AUTH_KEY   = '_wf_outlook_auth';
const CFG_KEY    = '_wf_outlook_cfg';
const AUTH_BASE  = 'https://identitytoolkit.googleapis.com/v1/accounts';
const TOKEN_BASE = 'https://securetoken.googleapis.com/v1/token';
const FS_BASE    = 'https://firestore.googleapis.com/v1/projects';
const EM_COL     = 'crm_emails';
const TR_COL     = 'email_tracking';
const API_BASE   = 'https://windoform.vercel.app/api/outlook';
const TRACK_URL  = 'https://windoform.vercel.app/api/track'; // Pixel-URL: TRACK_URL/trackingId

// ── State ────────────────────────────────────────────────────
let _auth         = null;   // { uid, email, idToken, refreshToken, expiresAt }
let _cfg          = null;   // { projectId, apiKey }
let _item         = null;   // Office mailbox item
let _recipients   = [];     // [{email, name}]
let _activeIdx    = 0;
let _contactCache = {};     // email → result from API
let _mode         = 'compose';

// ── Office Init ──────────────────────────────────────────────
Office.onReady(() => {
  _mode = new URLSearchParams(location.search).get('mode') === 'read' ? 'read' : 'compose';
  _cfg  = _loadCfg();
  _auth = _loadAuth();

  if (_auth && Date.now() < _auth.expiresAt) {
    _showMain();
  }

  _item = Office.context.mailbox.item;

  if (_mode === 'compose' && _item?.addHandlerAsync) {
    _item.addHandlerAsync(
      Office.EventType.RecipientsChanged,
      () => _loadRecipients(),
      () => {}
    );
  }
});

// ── Config ───────────────────────────────────────────────────
const _CFG_DEFAULT = { projectId: 'fuarbot', apiKey: 'AIzaSyCvFT3pQn4OFtTjep87-y9wrSZjrKbno1s' };

function _loadCfg() {
  try {
    const cfg = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
    return (cfg?.projectId && cfg?.apiKey) ? cfg : _CFG_DEFAULT;
  } catch { return _CFG_DEFAULT; }
}

function saveConfig() {
  const projectId = document.getElementById('cfg-project').value.trim();
  const apiKey    = document.getElementById('cfg-apikey').value.trim();
  if (!projectId || !apiKey) return showToast('Beide Felder ausfüllen!', 'error');
  _cfg = { projectId, apiKey };
  localStorage.setItem(CFG_KEY, JSON.stringify(_cfg));
  document.getElementById('config-area').style.display = 'none';
  showToast('✓ Konfiguration gespeichert', 'success');
}

function toggleConfig() {
  const el = document.getElementById('config-area');
  el.style.display = el.style.display === 'none' ? '' : 'none';
}

// ── Auth ─────────────────────────────────────────────────────
function _loadAuth() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); } catch { return null; }
}

function _saveAuth(data, email) {
  _auth = {
    uid:          data.localId,
    email:        email || data.email,
    idToken:      data.idToken,
    refreshToken: data.refreshToken,
    expiresAt:    Date.now() + parseInt(data.expiresIn || 3600) * 1000,
  };
  localStorage.setItem(AUTH_KEY, JSON.stringify(_auth));
}

async function _getToken() {
  if (!_auth) return null;
  if (Date.now() < _auth.expiresAt - 60000) return _auth.idToken;
  try {
    const res  = await fetch(`${TOKEN_BASE}?key=${_cfg.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(_auth.refreshToken)}`,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'refresh');
    _auth = { ..._auth, idToken: data.id_token, expiresAt: Date.now() + parseInt(data.expires_in) * 1000 };
    localStorage.setItem(AUTH_KEY, JSON.stringify(_auth));
    return _auth.idToken;
  } catch { return null; }
}

async function doLogin() {
  if (!_cfg?.apiKey) return showToast('Zuerst Firebase konfigurieren ↓', 'error');
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const btn   = document.getElementById('login-btn');
  const err   = document.getElementById('login-error');

  if (!email || !pass) { err.textContent = 'E-Mail und Passwort eingeben'; err.style.display = ''; return; }
  btn.disabled = true; btn.textContent = 'Anmelden…';
  err.style.display = 'none';

  try {
    const res  = await fetch(`${AUTH_BASE}:signInWithPassword?key=${_cfg.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass, returnSecureToken: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Fehler');
    _saveAuth(data, email);
    _showMain();
  } catch (e) {
    const map = {
      'INVALID_LOGIN_CREDENTIALS': 'E-Mail oder Passwort falsch',
      'TOO_MANY_ATTEMPTS_TRY_LATER': 'Zu viele Versuche – bitte warten',
      'USER_DISABLED': 'Konto gesperrt',
    };
    err.textContent = map[e.message] || e.message;
    err.style.display = '';
  } finally {
    btn.disabled = false; btn.textContent = 'Anmelden';
  }
}

function doLogout() {
  localStorage.removeItem(AUTH_KEY);
  _auth = null;
  _contactCache = {};
  document.getElementById('main-panel').style.display = 'none';
  document.getElementById('login-panel').style.display = '';
}

// ── Main Panel ───────────────────────────────────────────────
function _showMain() {
  document.getElementById('login-panel').style.display = 'none';
  document.getElementById('main-panel').style.display  = 'block';
  document.getElementById('header-user').textContent    = _auth?.email || '';
  _loadRecipients();
}

// ── Recipients ───────────────────────────────────────────────
function _loadRecipients() {
  if (!_item) return;

  if (_mode === 'read') {
    _item.from.getAsync(r => {
      if (r.status !== Office.AsyncResultStatus.Succeeded) return;
      _recipients = r.value ? [{ email: r.value.emailAddress, name: r.value.displayName || '' }] : [];
      _renderRecipients();
      if (_recipients.length) _lookupContact(0);
      else _showState('none');
    });
  } else {
    _item.to.getAsync(r => {
      if (r.status !== Office.AsyncResultStatus.Succeeded) return;
      _recipients = (r.value || []).map(x => ({ email: x.emailAddress, name: x.displayName || '' }));
      _renderRecipients();
      if (_recipients.length) _lookupContact(0);
      else _showState('none');
    });
  }
}

function _renderRecipients() {
  const bar   = document.getElementById('recipients-bar');
  const pills = document.getElementById('recipient-pills');
  if (_recipients.length <= 1) { bar.style.display = 'none'; return; }
  bar.style.display = '';
  pills.innerHTML = _recipients.map((r, i) =>
    `<span class="recipient-pill${i === _activeIdx ? ' active' : ''}"
      onclick="selectRecipient(${i})">${_esc(r.name || r.email)}</span>`
  ).join('');
}

function selectRecipient(idx) {
  _activeIdx = idx;
  _renderRecipients();
  _lookupContact(idx);
}

// ── Contact Lookup via API ───────────────────────────────────
async function _lookupContact(idx) {
  const r = _recipients[idx];
  if (!r?.email) return _showState('none');

  const emailKey = r.email.toLowerCase();

  if (_contactCache[emailKey] !== undefined) {
    _renderContact(_contactCache[emailKey], emailKey);
    if (_mode === 'compose') _loadContactTracking(emailKey);
    return;
  }

  _showState('loading');
  document.getElementById('save-area').style.display    = 'none';
  document.getElementById('tracking-area').style.display = 'none';

  try {
    const token = await _getToken();
    if (!token) throw new Error('not logged in');

    const url = `${API_BASE}/search-contact?email=${encodeURIComponent(emailKey)}&projectId=${encodeURIComponent(_cfg.projectId)}&apiKey=${encodeURIComponent(_cfg.apiKey)}`;
    const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const data = await res.json();
    _contactCache[emailKey] = data;
    _renderContact(data, emailKey);

    // Gesendete E-Mails + Tracking laden (nur Compose)
    if (_mode === 'compose') _loadContactTracking(emailKey);

  } catch (e) {
    _contactCache[emailKey] = null;
    _renderContact(null, emailKey);
  }
}

// ── Render Contact ───────────────────────────────────────────
function _renderContact(data, email) {
  document.getElementById('save-area').style.display = '';

  if (!data || !data.found) {
    document.getElementById('c-nf-email').textContent = email;
    _showState('notfound');
    document.getElementById('save-hint').textContent = 'Wird ohne Kontaktverknüpfung gespeichert';
    document.getElementById('recent-area').style.display = 'none';
    return;
  }

  document.getElementById('c-name').textContent    = data.name || email;
  document.getElementById('c-company').textContent = '';
  document.getElementById('c-email').textContent   = email;
  document.getElementById('c-phone-row').style.display  = 'none';
  document.getElementById('c-status-row').style.display = 'none';

  const recentArea = document.getElementById('recent-area');
  const recentList = document.getElementById('recent-list');
  if (data.recentEmails?.length) {
    recentList.innerHTML = data.recentEmails.slice(0, 4).map(e => {
      const isOut = e.direction === 'outbound';
      const dt = e.sentAt ? new Date(e.sentAt).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' }) : '';
      return `<div class="recent-item">
        <span class="recent-dir">${isOut ? '↑' : '↓'}</span>
        <span class="recent-subj">${_esc(e.subject)}</span>
        <span class="recent-dt">${dt}</span>
      </div>`;
    }).join('');
    recentArea.style.display = 'block';
  } else {
    recentArea.style.display = 'none';
  }

  _showState('found');
  document.getElementById('save-hint').textContent =
    data.name ? `Wird bei "${data.name}" gespeichert` : `Wird gespeichert`;
}

function _showState(state) {
  ['loading','found','notfound','none'].forEach(s =>
    document.getElementById('contact-' + s).style.display = s === state ? '' : 'none'
  );
}

// ── Tracking ─────────────────────────────────────────────────

/** Zufällige UUID generieren */
function _genUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/**
 * Gesendete E-Mails an diesen Kontakt aus Firestore laden
 * und Tracking-Status für jede E-Mail mit trackingId abfragen.
 */
async function _loadContactTracking(email) {
  const token = await _getToken();
  if (!token) return;

  try {
    // Firestore-Abfrage: gesendete E-Mails an diese Adresse
    const query = {
      structuredQuery: {
        from: [{ collectionId: EM_COL }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              { fieldFilter: { field: { fieldPath: 'from' }, op: 'EQUAL', value: { stringValue: _auth.email.toLowerCase() } } },
              { fieldFilter: { field: { fieldPath: 'to'   }, op: 'EQUAL', value: { stringValue: email.toLowerCase() } } },
            ]
          }
        },
        orderBy: [{ field: { fieldPath: 'sentAt' }, direction: 'DESCENDING' }],
        limit: 6
      }
    };

    const res = await fetch(
      `${FS_BASE}/${_cfg.projectId}/databases/(default)/documents:runQuery?key=${_cfg.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(query)
      }
    );

    const results = await res.json();
    const emails = (Array.isArray(results) ? results : [])
      .filter(r => r.document)
      .map(r => ({
        subject:    r.document.fields?.subject?.stringValue    || '(kein Betreff)',
        sentAt:     r.document.fields?.sentAt?.timestampValue  || '',
        trackingId: r.document.fields?.trackingId?.stringValue || null,
      }));

    if (emails.length === 0) {
      document.getElementById('tracking-area').style.display = 'none';
      return;
    }

    // Tracking-Status für E-Mails mit trackingId laden
    const withTracking = await Promise.all(
      emails.map(async e => {
        if (!e.trackingId) return { ...e, tracking: null };
        const status = await _fetchTrackingStatus(e.trackingId, token);
        return { ...e, tracking: status };
      })
    );

    _renderTrackingSection(withTracking);

  } catch (err) {
    console.warn('[Tracking] Laden fehlgeschlagen:', err.message);
    document.getElementById('tracking-area').style.display = 'none';
  }
}

/** Tracking-Status eines einzelnen Dokuments aus Firestore lesen */
async function _fetchTrackingStatus(trackingId, token) {
  try {
    const res = await fetch(
      `${FS_BASE}/${_cfg.projectId}/databases/(default)/documents/${TR_COL}/${trackingId}?key=${_cfg.apiKey}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const doc = await res.json();
    if (!doc.fields) return null;
    return {
      openedAt:     doc.fields.openedAt?.timestampValue     || null,
      openCount:    parseInt(doc.fields.openCount?.integerValue) || 0,
      lastOpenedAt: doc.fields.lastOpenedAt?.timestampValue || null,
    };
  } catch { return null; }
}

/** Tracking-Bereich im Panel rendern */
function _renderTrackingSection(list) {
  const area = document.getElementById('tracking-area');
  const lst  = document.getElementById('tracking-list');

  if (!list || list.length === 0) { area.style.display = 'none'; return; }

  lst.innerHTML = list.map(e => {
    const dt = e.sentAt
      ? new Date(e.sentAt).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' })
      : '';

    let badge;
    if (!e.trackingId) {
      // Kein Tracking für diese E-Mail
      badge = `<span class="track-badge track-none">Kein Tracking</span>`;
    } else if (!e.tracking || !e.tracking.openedAt) {
      badge = `<span class="track-badge track-unseen">📧 Nicht geöffnet</span>`;
    } else {
      const openDt   = new Date(e.tracking.openedAt).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' });
      const openTime = new Date(e.tracking.openedAt).toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
      const multi    = e.tracking.openCount > 1 ? ` · ${e.tracking.openCount}× geöffnet` : '';
      badge = `<span class="track-badge track-seen">👁 ${openDt} ${openTime}${multi}</span>`;
    }

    return `<div class="tracking-item">
      <div class="tracking-subj">${_esc(e.subject)}</div>
      <div class="tracking-meta">${dt} ${badge}</div>
    </div>`;
  }).join('');

  area.style.display = 'block';
}

// ── Save Email to CRM ────────────────────────────────────────
async function saveEmailToCRM() {
  const btn  = document.getElementById('save-btn');
  const text = document.getElementById('save-btn-text');
  btn.disabled = true; text.textContent = 'Wird gespeichert…';

  try {
    const token = await _getToken();
    if (!token) throw new Error('Nicht angemeldet');

    let subject = '', bodyText = '', bodyHtml = '', to = '', from = '', contactId = '', direction = '';

    // Tracking nur für ausgehende E-Mails (Compose)
    const trackingId = _mode === 'compose' ? _genUUID() : null;

    if (_mode === 'compose') {
      direction = 'outbound';
      to        = _recipients[_activeIdx]?.email || '';
      from      = _auth.email;
      subject   = await _getAsync(cb => _item.subject.getAsync(cb));
      bodyText  = await _getAsync(cb => _item.body.getAsync(Office.CoercionType.Text, cb));
      bodyHtml  = await _getAsync(cb => _item.body.getAsync(Office.CoercionType.Html, cb));
      contactId = _contactCache[to.toLowerCase()]?.contactId || '';

      // Tracking-Pixel in E-Mail-Body einbetten
      if (trackingId && bodyHtml) {
        const pixel  = `<img src="${TRACK_URL}/${trackingId}" `
          + `width="1" height="1" alt="" `
          + `style="display:block;width:1px!important;height:1px!important;`
          + `max-width:1px!important;overflow:hidden;opacity:0.01;">`;
        const newHtml = bodyHtml.includes('</body>')
          ? bodyHtml.replace('</body>', pixel + '</body>')
          : bodyHtml + pixel;
        await new Promise(resolve =>
          _item.body.setAsync(newHtml, { coercionType: Office.CoercionType.Html }, resolve)
        );
      }

    } else {
      direction = 'inbound';
      to        = _auth.email;
      const sender = await _getAsync(cb => _item.from.getAsync(cb));
      from      = sender?.emailAddress || '';
      subject   = await _getAsync(cb => _item.subject.getAsync(cb));
      bodyText  = await _getAsync(cb => _item.body.getAsync(Office.CoercionType.Text, cb));
      contactId = _contactCache[from.toLowerCase()]?.contactId || '';
    }

    const emailKey    = (_mode === 'compose' ? to : from).toLowerCase();
    const cachedData  = _contactCache[emailKey];
    const displayName = cachedData?.name || '';
    const now         = new Date().toISOString();
    const toRaw       = displayName && _mode === 'compose' ? `${displayName} <${to}>` : to;
    const fromRaw     = displayName && _mode === 'read'    ? `${displayName} <${from}>` : from;

    const fields = {
      direction:    { stringValue: direction },
      contactId:    { stringValue: contactId },
      to:           { stringValue: to.toLowerCase() },
      toRaw:        { stringValue: toRaw },
      from:         { stringValue: from.toLowerCase() },
      fromRaw:      { stringValue: fromRaw },
      fromName:     { stringValue: _mode === 'inbound' ? displayName : _auth.email },
      subject:      { stringValue: subject || '(Kein Betreff)' },
      text:         { stringValue: (bodyText || '').slice(0, 5000) },
      sentAt:       { timestampValue: now },
      createdAt:    { timestampValue: now },
      createdBy:    { stringValue: _auth.email },
      createdByUid: { stringValue: _auth.uid || '' },
      source:       { stringValue: 'outlook-addin' },
      status:       { stringValue: 'sent' },
    };

    if (trackingId) fields.trackingId = { stringValue: trackingId };

    // E-Mail in crm_emails speichern
    const saveUrl = `${FS_BASE}/${_cfg.projectId}/databases/(default)/documents/${EM_COL}?key=${_cfg.apiKey}`;
    const saveRes = await fetch(saveUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ fields }),
    });

    if (!saveRes.ok) {
      const e = await saveRes.json().catch(() => ({}));
      throw new Error(e.error?.message || 'HTTP ' + saveRes.status);
    }

    // Tracking-Dokument in email_tracking anlegen
    if (trackingId) {
      await fetch(
        `${FS_BASE}/${_cfg.projectId}/databases/(default)/documents/${TR_COL}?documentId=${trackingId}&key=${_cfg.apiKey}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            fields: {
              trackingId: { stringValue: trackingId },
              subject:    { stringValue: subject || '' },
              to:         { stringValue: to.toLowerCase() },
              from:       { stringValue: from.toLowerCase() },
              createdAt:  { timestampValue: now },
              openCount:  { integerValue: '0' },
            }
          })
        }
      );
    }

    // Cache leeren damit nächster Lookup frische Daten holt
    delete _contactCache[emailKey];

    const msg = trackingId ? '✓ Gespeichert + Tracking aktiv 👁' : '✓ Gespeichert';
    showToast(msg, 'success');
    text.textContent   = trackingId ? '✓ Gespeichert + Tracking 👁' : '✓ Gespeichert';
    btn.style.background = '#059669';

    setTimeout(() => {
      text.textContent   = 'E-Mail ins CRM speichern';
      btn.style.background = '';
      btn.disabled       = false;
    }, 3000);

    // Tracking-Bereich sofort aktualisieren
    if (trackingId) {
      setTimeout(() => _loadContactTracking(emailKey), 800);
    }

  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
    btn.disabled     = false;
    text.textContent = 'E-Mail ins CRM speichern';
  }
}

// ── Helpers ──────────────────────────────────────────────────
function _getAsync(fn) {
  return new Promise(resolve => {
    fn(result => {
      resolve(result.status === Office.AsyncResultStatus.Succeeded ? (result.value || '') : '');
    });
  });
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent   = msg;
  t.className     = type;
  t.style.display = '';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.style.display = 'none', 3500);
}

function _esc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
