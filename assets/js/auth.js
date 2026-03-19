// ═══════════════════════════════════════════════════════════
// FIREBASE AUTH — email / password via REST API
// No SDK required — pure fetch() calls
// ═══════════════════════════════════════════════════════════

const _AUTH_BASE  = 'https://identitytoolkit.googleapis.com/v1/accounts';
const _TOKEN_BASE = 'https://securetoken.googleapis.com/v1/token';
const _AUTH_KEY   = '_wf_auth';   // localStorage key

let _authUser = null;  // { uid, email, idToken, refreshToken, expiresAt }

// ── Public API ────────────────────────────────────────────

async function authInit() {
  const raw = localStorage.getItem(_AUTH_KEY);
  if (!raw) return false;
  try {
    _authUser = JSON.parse(raw);
    // Refresh token if it expires within 5 minutes
    if (Date.now() > _authUser.expiresAt - 5 * 60 * 1000) {
      const ok = await _authRefresh();
      if (!ok) { _authSignOut(false); return false; }
    }
    return true;
  } catch(e) {
    _authSignOut(false);
    return false;
  }
}

async function authLogin(email, password) {
  const cfg = loadFbConfig();
  if (!cfg?.apiKey) throw new Error('Firebase API Key eksik. Lütfen önce Firebase yapılandırmasını girin.');
  const res = await fetch(`${_AUTH_BASE}:signInWithPassword?key=${cfg.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(_authErrMsg(data.error?.message));
  _authSave(data);
  return data;
}

async function authRegister(email, password) {
  const cfg = loadFbConfig();
  if (!cfg?.apiKey) throw new Error('Firebase API Key eksik.');
  const res = await fetch(`${_AUTH_BASE}:signUp?key=${cfg.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(_authErrMsg(data.error?.message));
  _authSave(data);
  return data;
}

async function authLogout() {
  _authSignOut(true);
}

// Returns valid idToken, auto-refreshes if needed
async function authToken() {
  if (!_authUser) return null;
  if (Date.now() > _authUser.expiresAt - 60 * 1000) {
    const ok = await _authRefresh();
    if (!ok) return null;
  }
  return _authUser.idToken;
}

function authUid()      { return _authUser?.uid   || null; }
function authEmail()    { return _authUser?.email  || null; }
function authIsLoggedIn() { return !!_authUser; }

// ── Internal helpers ──────────────────────────────────────

function _authSave(data) {
  _authUser = {
    uid:          data.localId,
    email:        data.email,
    idToken:      data.idToken,
    refreshToken: data.refreshToken,
    expiresAt:    Date.now() + Number(data.expiresIn || 3600) * 1000,
  };
  localStorage.setItem(_AUTH_KEY, JSON.stringify(_authUser));
}

async function _authRefresh() {
  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !_authUser?.refreshToken) return false;
  try {
    const res = await fetch(`${_TOKEN_BASE}?key=${cfg.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(_authUser.refreshToken)}`,
    });
    const data = await res.json();
    if (!res.ok) return false;
    _authUser = {
      uid:          data.user_id,
      email:        _authUser.email,
      idToken:      data.id_token,
      refreshToken: data.refresh_token,
      expiresAt:    Date.now() + Number(data.expires_in || 3600) * 1000,
    };
    localStorage.setItem(_AUTH_KEY, JSON.stringify(_authUser));
    return true;
  } catch(e) { return false; }
}

function _authSignOut(clearStorage = true) {
  _authUser = null;
  if (clearStorage) localStorage.removeItem(_AUTH_KEY);
}

function _authErrMsg(code) {
  const map = {
    'EMAIL_NOT_FOUND':          'Bu e-posta adresi kayıtlı değil.',
    'INVALID_PASSWORD':         'Şifre hatalı.',
    'USER_DISABLED':            'Hesap devre dışı bırakıldı.',
    'EMAIL_EXISTS':             'Bu e-posta adresi zaten kayıtlı.',
    'WEAK_PASSWORD':            'Şifre en az 6 karakter olmalı.',
    'INVALID_EMAIL':            'Geçersiz e-posta adresi.',
    'TOO_MANY_ATTEMPTS_TRY_LATER': 'Çok fazla deneme. Lütfen biraz bekleyin.',
    'INVALID_LOGIN_CREDENTIALS': 'E-posta veya şifre hatalı.',
  };
  return map[code] || (code || 'Bilinmeyen hata.');
}

// ═══════════════════════════════════════════════════════════
// FIRESTORE SYNC  — companies / contacts / settings
// Stored as JSON blobs in collection "_sync" with docs:
//   _sync/companies  →  { json: "[{...},{...}]" }
//   _sync/contacts   →  { json: "[{...},{...}]" }
//   _sync/settings   →  { claudeKey, nsBaseUrl, nsUsername, nsPassword, nsCompany, nsBranch }
// ═══════════════════════════════════════════════════════════

const _SYNC_COL = '_sync';
let   _syncTimer = null;

// ── Push local IndexedDB → Firestore ─────────────────────
async function syncToFirestore(stores = ['companies','contacts']) {
  if (!authIsLoggedIn()) return;
  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId) return;
  const token = await authToken();

  for (const store of stores) {
    try {
      const rows = await dbAll(store);
      const json = JSON.stringify(rows);
      await _fsPatch(cfg, `${_SYNC_COL}/${store}`, { json }, token);
    } catch(e) {
      console.warn(`[Sync] ${store} push failed:`, e);
    }
  }
}

// ── Pull Firestore → IndexedDB (on login from new browser) ─
async function syncFromFirestore() {
  if (!authIsLoggedIn()) return;
  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId) return;
  const token = await authToken();

  for (const store of ['companies','contacts']) {
    try {
      const doc = await _fsGetDoc(cfg, `${_SYNC_COL}/${store}`, token);
      if (!doc) continue;
      const rows = JSON.parse(doc.json || '[]');
      if (!rows.length) continue;

      // Only import if local is empty (avoid overwriting newer local data)
      const local = await dbAll(store);
      if (local.length > 0) continue;  // local wins

      // Bulk insert into IndexedDB
      for (const row of rows) {
        if (row.id) await dbPut(store, row).catch(() => dbAdd(store, row).catch(() => {}));
      }
      console.log(`[Sync] ${store}: ${rows.length} kayıt Firestore'dan yüklendi`);
    } catch(e) {
      console.warn(`[Sync] ${store} pull failed:`, e);
    }
  }
}

// ── Save settings to Firestore ────────────────────────────
async function syncSettingsToFirestore() {
  if (!authIsLoggedIn()) return;
  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId) return;
  const token = await authToken();

  // Claude key is stored under windoform_cfg.claudeKey
  let claudeKey = '';
  try { claudeKey = JSON.parse(localStorage.getItem('windoform_cfg') || '{}').claudeKey || ''; } catch {}
  // Netsis is stored under windoform_netsis_cfg
  let nsCfg = {};
  try { nsCfg = JSON.parse(localStorage.getItem('windoform_netsis_cfg') || '{}'); } catch {}

  const settings = {
    claudeKey:  claudeKey,
    nsBaseUrl:  nsCfg.baseUrl  || '',
    nsUsername: nsCfg.username || '',
    nsPassword: nsCfg.password || '',
    nsCompany:  nsCfg.company  || '',
    nsBranch:   nsCfg.branch   || '',
  };

  try {
    await _fsPatch(cfg, `${_SYNC_COL}/settings`, settings, token);
  } catch(e) {
    console.warn('[Sync] settings push failed:', e);
  }
}

// ── Load settings from Firestore → localStorage ───────────
async function syncSettingsFromFirestore() {
  if (!authIsLoggedIn()) return;
  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId) return;
  const token = await authToken();

  try {
    const s = await _fsGetDoc(cfg, `${_SYNC_COL}/settings`, token);
    if (!s) return;

    // Claude key → windoform_cfg.claudeKey
    if (s.claudeKey) {
      try {
        const wCfg = JSON.parse(localStorage.getItem('windoform_cfg') || '{}');
        if (!wCfg.claudeKey) { wCfg.claudeKey = s.claudeKey; localStorage.setItem('windoform_cfg', JSON.stringify(wCfg)); }
      } catch {}
    }

    // Netsis → windoform_netsis_cfg
    const nsCfg = {};
    let hasNetsis = false;
    if (s.nsBaseUrl)  { nsCfg.baseUrl  = s.nsBaseUrl;  hasNetsis = true; }
    if (s.nsUsername) { nsCfg.username = s.nsUsername; hasNetsis = true; }
    if (s.nsPassword) { nsCfg.password = s.nsPassword; hasNetsis = true; }
    if (s.nsCompany)  { nsCfg.company  = s.nsCompany;  hasNetsis = true; }
    if (s.nsBranch)   { nsCfg.branch   = s.nsBranch;   hasNetsis = true; }
    if (hasNetsis) {
      try {
        const existing = JSON.parse(localStorage.getItem('windoform_netsis_cfg') || '{}');
        if (!existing.baseUrl) localStorage.setItem('windoform_netsis_cfg', JSON.stringify(nsCfg));
      } catch {}
    }

    console.log('[Sync] Ayarlar Firestore\'dan yüklendi');
  } catch(e) {
    console.warn('[Sync] settings pull failed:', e);
  }
}

// ── Debounced sync trigger (called after each db change) ──
function _syncSchedule() {
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => syncToFirestore(), 3000);
}

// ── Low-level Firestore helpers ───────────────────────────
async function _fsPatch(cfg, path, fieldsObj, token) {
  const fields = {};
  Object.entries(fieldsObj).forEach(([k, v]) => {
    fields[k] = { stringValue: String(v ?? '') };
  });
  const docName = `projects/${cfg.projectId}/databases/(default)/documents/${path}`;
  const fieldPaths = Object.keys(fieldsObj).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const url = `https://firestore.googleapis.com/v1/${docName}?${fieldPaths}&key=${cfg.apiKey}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ fields }) });
  if (!res.ok) throw new Error(await res.text());
}

async function _fsGetDoc(cfg, path, token) {
  const docName = `projects/${cfg.projectId}/databases/(default)/documents/${path}`;
  const url = `https://firestore.googleapis.com/v1/${docName}?key=${cfg.apiKey}`;
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  const doc = await res.json();
  const out = {};
  if (doc.fields) {
    Object.entries(doc.fields).forEach(([k, v]) => {
      out[k] = v.stringValue ?? v.integerValue ?? v.booleanValue ?? null;
    });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════
// LOGIN OVERLAY UI
// ═══════════════════════════════════════════════════════════

function authShowLogin(reason) {
  const overlay = document.getElementById('auth-overlay');
  if (!overlay) return;
  const msg = document.getElementById('auth-reason-msg');
  if (msg) msg.textContent = reason || '';
  overlay.style.display = 'flex';
}

function authHideLogin() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.style.display = 'none';
}

function authSwitchTab(tab) {
  ['login','register'].forEach(t => {
    document.getElementById(`auth-tab-${t}`)?.classList.toggle('active', t === tab);
    document.getElementById(`auth-panel-${t}`)?.style && (document.getElementById(`auth-panel-${t}`).style.display = t === tab ? '' : 'none');
  });
}

async function authSubmitLogin() {
  const email = document.getElementById('auth-email')?.value.trim();
  const pass  = document.getElementById('auth-password')?.value;
  const btn   = document.getElementById('auth-login-btn');
  const err   = document.getElementById('auth-login-error');
  if (!email || !pass) { err.textContent = 'E-posta ve şifre gerekli.'; return; }
  btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Giriş yapılıyor…';
  err.textContent = '';
  try {
    await authLogin(email, pass);
    await _authOnSuccess();
  } catch(e) {
    err.textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Giriş Yap';
  }
}

async function authSubmitRegister() {
  const email = document.getElementById('auth-reg-email')?.value.trim();
  const pass  = document.getElementById('auth-reg-password')?.value;
  const pass2 = document.getElementById('auth-reg-password2')?.value;
  const btn   = document.getElementById('auth-register-btn');
  const err   = document.getElementById('auth-register-error');
  if (!email || !pass) { err.textContent = 'E-posta ve şifre gerekli.'; return; }
  if (pass !== pass2)  { err.textContent = 'Şifreler eşleşmiyor.'; return; }
  if (pass.length < 6) { err.textContent = 'Şifre en az 6 karakter olmalı.'; return; }
  btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Kayıt olunuyor…';
  err.textContent = '';
  try {
    await authRegister(email, pass);
    await _authOnSuccess();
  } catch(e) {
    err.textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Kayıt Ol';
  }
}

async function _authOnSuccess() {
  // Pull settings from Firestore first (fills Claude key, Netsis config etc.)
  await syncSettingsFromFirestore();
  authHideLogin();
  // Start or re-start the app
  if (typeof _appStart === 'function') {
    await _appStart();
    // Refresh Ayarlar if it was the active page
    if (typeof loadAyarlar === 'function') {
      try { loadAyarlar(); } catch(e) {}
    }
  } else {
    location.reload();
  }
}

function authShowLogoutConfirm() {
  if (confirm(`${authEmail()} hesabından çıkış yapmak istediğinize emin misiniz?`)) {
    authLogout();
    location.reload();
  }
}
