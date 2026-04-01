// ═══════════════════════════════════════════════════════════════
// HOME DASHBOARD — Windoform CRM
// ═══════════════════════════════════════════════════════════════
'use strict';

let _homeLoaded = false;
let _homeChart  = null;

// ── Home data cache (avoids repeated Firestore reads) ──────────
const HOME_CACHE_KEY = 'wf_home_cache';
const HOME_CACHE_TTL = 30 * 60 * 1000; // 30 min

function _homeGetCache() {
  try {
    const raw = localStorage.getItem(HOME_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (Date.now() - (c.ts || 0) > HOME_CACHE_TTL) return null; // stale
    return c;
  } catch { return null; }
}
function _homeSetCache(data) {
  try { localStorage.setItem(HOME_CACHE_KEY, JSON.stringify({ ts: Date.now(), ...data })); } catch {}
}
function _homeClearCache() {
  try { localStorage.removeItem(HOME_CACHE_KEY); } catch {}
}

async function loadHome(forceRefresh) {
  _homeLoaded = true;
  const cfg = typeof loadFbConfig === 'function' ? loadFbConfig() : null;

  // Greeting — prefer real display name from profile cache, fallback to email prefix
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';

  // 1. Try _userDispName (set by email.js if already initialized)
  let displayName = (typeof _userDispName !== 'undefined' && _userDispName) ? _userDispName : null;

  // 2. Scan ALL _wf_profile_* keys in localStorage (doesn't need authUid)
  if (!displayName) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('_wf_profile_')) {
          const cached = JSON.parse(localStorage.getItem(key) || 'null');
          if (cached?.name) { displayName = cached.name; break; }
        }
      }
    } catch {}
  }

  // 3. Last resort: email prefix (only if nothing else found)
  if (!displayName && typeof authEmail === 'function') {
    displayName = (authEmail() || '').split('@')[0] || null;
  }

  // Capitalize first letter only
  const nameCap = displayName
    ? displayName.charAt(0).toUpperCase() + displayName.slice(1)
    : '';

  const el = document.getElementById('home-greeting');
  if (el) el.textContent = nameCap ? `${greeting}, ${nameCap} 👋` : `${greeting} 👋`;

  // Date
  const dateEl = document.getElementById('home-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('de-DE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  const cache = forceRefresh ? null : _homeGetCache();

  // Load all sections in parallel
  _homeLoadWeather();
  _homeLoadStats(cfg);
  _homeLoadEmails(cfg, cache);
  _homeLoadTasks(cfg, cache);
  _homeLoadRevenue(cfg, cache);
  _homeLoadProduction(cfg, cache);
  _homeLoadRevenueChart(cfg, cache);
}

// ── Weather ─────────────────────────────────────────────────
async function _homeLoadWeather() {
  const el = document.getElementById('home-weather');
  if (!el) return;
  try {
    // 1. Get location from IP
    const geoRes  = await fetch('https://ipapi.co/json/');
    const geo     = await geoRes.json();
    const lat     = geo.latitude, lon = geo.longitude;
    const city    = geo.city || geo.region || '';

    // 2. Get weather from open-meteo (no API key)
    const wRes  = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode,windspeed_10m,relative_humidity_2m&timezone=auto`
    );
    const w     = await wRes.json();
    const cur   = w.current;
    const temp  = Math.round(cur.temperature_2m);
    const wind  = Math.round(cur.windspeed_10m);
    const hum   = cur.relative_humidity_2m;
    const code  = cur.weathercode;

    const icon  = _weatherIcon(code);
    const desc  = _weatherDesc(code);

    el.innerHTML = `
      <div class="home-weather-icon">${icon}</div>
      <div class="home-weather-info">
        <div class="home-weather-temp">${temp}°C</div>
        <div class="home-weather-city">${city} · ${desc}</div>
        <div class="home-weather-meta">
          <span>💨 ${wind} km/h</span>
          <span>💧 ${hum}%</span>
        </div>
      </div>`;
  } catch {
    el.innerHTML = `<div class="home-weather-icon">🌤️</div><div class="home-weather-info"><div class="home-weather-temp">—</div><div class="home-weather-city">Wetter nicht verfügbar</div></div>`;
  }
}

function _weatherIcon(code) {
  if (code === 0)              return '☀️';
  if (code <= 2)               return '🌤️';
  if (code === 3)              return '☁️';
  if (code <= 49)              return '🌫️';
  if (code <= 69)              return '🌧️';
  if (code <= 79)              return '🌨️';
  if (code <= 82)              return '🌦️';
  if (code <= 86)              return '❄️';
  if (code <= 99)              return '⛈️';
  return '🌡️';
}
function _weatherDesc(code) {
  if (code === 0)  return 'Klar';
  if (code <= 2)   return 'Teils bewölkt';
  if (code === 3)  return 'Bewölkt';
  if (code <= 49)  return 'Nebel';
  if (code <= 69)  return 'Regen';
  if (code <= 79)  return 'Schneeregen';
  if (code <= 82)  return 'Schauer';
  if (code <= 86)  return 'Schnee';
  if (code <= 99)  return 'Gewitter';
  return 'Unbekannt';
}

// ── Stats Cards ──────────────────────────────────────────────
async function _homeLoadStats(cfg) {
  // Contacts count from IndexedDB
  try {
    if (typeof dbAll === 'function') {
      const [cos, cons] = await Promise.all([dbAll('companies'), dbAll('contacts')]);
      _homeSetStat('home-stat-contacts',  cons.length);
      _homeSetStat('home-stat-companies', cos.length);
    }
  } catch (_) {}
}

// ── Emails ───────────────────────────────────────────────────
async function _homeLoadEmails(cfg, cache) {
  const el = document.getElementById('home-email-list');
  if (!el || !cfg?.apiKey) return;

  // Use cache if available
  if (cache?.emails) {
    _homeRenderEmails(el, cache.emails);
    return;
  }

  try {
    const token = typeof authToken === 'function' ? await authToken() : null;
    const today = new Date(); today.setHours(0,0,0,0);

    // No uid filter — Firestore needs a composite index for (createdByUid + orderBy createdAt)
    // Dashboard shows the 10 most recent emails from all users, sorted by date
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents:runQuery?key=${cfg.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ structuredQuery: {
          from:    [{ collectionId: 'crm_emails' }],
          orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
          limit:   10,
        }}),
      }
    );
    const rows  = await res.json();
    const today0 = today.toISOString();
    const emails = (Array.isArray(rows) ? rows : [])
      .filter(r => r.document)
      .map(r => {
        const f = r.document.fields || {};
        return {
          dir:     f.direction?.stringValue || 'outbound',
          subject: f.subject?.stringValue || '(Konu yok)',
          name:    (f.direction?.stringValue === 'inbound'
            ? (f.fromRaw?.stringValue || f.from?.stringValue)
            : (f.toRaw?.stringValue  || f.to?.stringValue)) || '',
          at:      f.createdAt?.timestampValue || f.sentAt?.timestampValue || '',
          id:      r.document.name.split('/').pop(),
        };
      });
    _homeSetCache({ emails });
    _homeRenderEmails(el, emails);
  } catch (_) {
    el.innerHTML = `<div class="home-empty">Nicht verfügbar</div>`;
  }
}

function _homeRenderEmails(el, emails) {
  const today0 = new Date(); today0.setHours(0,0,0,0);
  const today0iso = today0.toISOString();
  const todayCount = emails.filter(e => e.at >= today0iso).length;
  _homeSetStat('home-stat-emails-today', todayCount);

  if (!emails.length) {
    el.innerHTML = `<div class="home-empty">Keine E-Mails</div>`;
    return;
  }
  el.innerHTML = emails.slice(0, 5).map(e => {
    const isOut = e.dir === 'outbound';
    const nm    = (e.name.match(/^([^<]+?)\s*</) || [,''])[1].trim() || e.name.replace(/<[^>]+>/g,'').trim() || '—';
    const dt    = e.at ? new Date(e.at).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
    return `<div class="home-list-item" onclick="showPage('emails')">
      <div class="home-list-icon ${isOut ? 'out' : 'in'}">${isOut ? '↑' : '↓'}</div>
      <div class="home-list-body">
        <div class="home-list-title">${_hesc(e.subject)}</div>
        <div class="home-list-sub">${_hesc(nm)}</div>
      </div>
      <div class="home-list-time">${dt}</div>
    </div>`;
  }).join('');
}

// ── Tasks ────────────────────────────────────────────────────
async function _homeLoadTasks(cfg, cache) {
  const el = document.getElementById('home-task-list');
  if (!el || !cfg?.apiKey) return;

  if (cache?.tasks) { _homeRenderTasks(el, cache.tasks); return; }

  try {
    const token = typeof authToken === 'function' ? await authToken() : null;
    const res   = await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents:runQuery?key=${cfg.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ structuredQuery: {
          from:  [{ collectionId: 'crm_tasks' }],
          where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'NOT_EQUAL', value: { stringValue: 'done' } } },
          orderBy: [
            { field: { fieldPath: 'status' } },
            { field: { fieldPath: 'dueDate' }, direction: 'ASCENDING' },
          ],
          limit: 10,
        }}),
      }
    );
    const rows  = await res.json();
    const tasks = (Array.isArray(rows) ? rows : [])
      .filter(r => r.document)
      .map(r => {
        const f = r.document.fields || {};
        return {
          title:   f.title?.stringValue || f.text?.stringValue || '(Aufgabe)',
          due:     f.dueDate?.stringValue || f.dueAt?.timestampValue || '',
          status:  f.status?.stringValue || 'open',
          prio:    f.priority?.stringValue || 'normal',
        };
      });

    _homeSetCache({ tasks });
    _homeRenderTasks(el, tasks);
  } catch (_) {
    el.innerHTML = `<div class="home-empty">Nicht verfügbar</div>`;
  }
}

function _homeRenderTasks(el, tasks) {
  _homeSetStat('home-stat-tasks', tasks.length);
  if (!tasks.length) {
    el.innerHTML = `<div class="home-empty">✅ Keine offenen Aufgaben</div>`;
    return;
  }
  el.innerHTML = tasks.slice(0, 5).map(t => {
    const overdue = t.due && new Date(t.due) < new Date();
    const dt      = t.due ? new Date(t.due).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' }) : '';
    const prioCol = t.prio === 'high' ? '#ef4444' : t.prio === 'low' ? '#94a3b8' : '#f59e0b';
    return `<div class="home-list-item">
      <div class="home-list-icon task" style="background:${prioCol}20; color:${prioCol};">●</div>
      <div class="home-list-body">
        <div class="home-list-title">${_hesc(t.title)}</div>
        ${dt ? `<div class="home-list-sub ${overdue ? 'overdue' : ''}">${overdue ? '⚠ ' : ''}Fällig: ${dt}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── Revenue ──────────────────────────────────────────────────
async function _homeLoadRevenue(cfg, cache) {
  const el     = document.getElementById('home-revenue-area');
  const role   = typeof _userCrmRole !== 'undefined' ? _userCrmRole : 'sales';
  if (!el || !cfg?.apiKey) return;

  if (role !== 'admin') { el.style.display = 'none'; return; }
  el.style.display = '';

  if (cache?.quotes) { _homeRenderRevenue(cache.quotes); return; }

  try {
    const token    = typeof authToken === 'function' ? await authToken() : null;
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const cutoff = sixMonthsAgo.toISOString();

    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents:runQuery?key=${cfg.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ structuredQuery: {
          from:  [{ collectionId: 'crm_quotes' }],
          where: { compositeFilter: { op: 'AND', filters: [
            { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'sent' } } },
            { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: cutoff } } },
          ]}},
          limit: 500,
        }}),
      }
    );
    const rows   = await res.json();
    const quotes = (Array.isArray(rows) ? rows : []).filter(r => r.document).map(r => {
      const f = r.document.fields || {};
      return {
        amount:    parseFloat(f.totalNet?.doubleValue || f.totalNet?.integerValue || 0),
        currency:  f.currency?.stringValue || 'EUR',
        createdAt: f.createdAt?.timestampValue || f.createdAt?.stringValue || '',
        createdBy: f.createdBy?.stringValue || '',
      };
    });
    _homeSetCache({ quotes });
    _homeRenderRevenue(quotes);
  } catch (_) {
    document.getElementById('home-rev-total').textContent = '—';
  }
}

function _homeRenderRevenue(quotes) {
  const fmt = n => n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const total = quotes.reduce((s, q) => s + q.amount, 0);
  const thisMonth0 = new Date(); thisMonth0.setDate(1); thisMonth0.setHours(0,0,0,0);
  const monthRev   = quotes.filter(q => q.createdAt >= thisMonth0.toISOString()).reduce((s,q) => s+q.amount, 0);
  document.getElementById('home-rev-total').textContent  = '€ ' + fmt(total);
  document.getElementById('home-rev-month').textContent  = '€ ' + fmt(monthRev);
  document.getElementById('home-rev-count').textContent  = quotes.length + ' Angebote';
}

// ── Revenue Chart (6 months) ─────────────────────────────────
async function _homeLoadRevenueChart(cfg, cache) {
  const canvas = document.getElementById('home-rev-chart');
  const role   = typeof _userCrmRole !== 'undefined' ? _userCrmRole : 'sales';
  if (!canvas || !cfg?.apiKey || role !== 'admin') return;

  // Use cached quotes if available
  if (cache?.quotes) { _homeRenderRevenueChart(canvas, cache.quotes); return; }

  try {
    const token = typeof authToken === 'function' ? await authToken() : null;
    const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const cutoff = sixMonthsAgo.toISOString();

    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents:runQuery?key=${cfg.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ structuredQuery: {
          from:  [{ collectionId: 'crm_quotes' }],
          where: { compositeFilter: { op: 'AND', filters: [
            { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'sent' } } },
            { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: cutoff } } },
          ]}},
          limit: 500,
        }}),
      }
    );
    const rows   = await res.json();
    const quotes = (Array.isArray(rows) ? rows : []).filter(r => r.document).map(r => {
      const f = r.document.fields || {};
      return {
        amount:    parseFloat(f.totalNet?.doubleValue || f.totalNet?.integerValue || 0),
        createdAt: f.createdAt?.timestampValue || f.createdAt?.stringValue || '',
      };
    });
    // Don't overwrite the full quotes cache — just render from this subset
    _homeRenderRevenueChart(canvas, quotes);
  } catch (_) {}
}

function _homeRenderRevenueChart(canvas, quotes) {
  try {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      months.push({ label: d.toLocaleDateString('de-DE', { month:'short', year:'2-digit' }), total: 0, key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` });
    }
    quotes.forEach(q => {
      const key = q.createdAt.slice(0, 7);
      const m   = months.find(x => x.key === key);
      if (m) m.total += q.amount;
    });

    if (_homeChart) _homeChart.destroy();
    _homeChart = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: months.map(m => m.label),
        datasets: [{
          label: 'Umsatz (€)',
          data:  months.map(m => m.total),
          backgroundColor: months.map((_, i) => i === 5 ? '#2B5597' : 'rgba(43,85,151,0.35)'),
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: v => '€ ' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v), font: { size: 11 } },
            grid: { color: 'rgba(0,0,0,.06)' },
          },
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        },
      },
    });
  } catch(_) {}
}

// ── Production ───────────────────────────────────────────────
async function _homeLoadProduction(cfg, cache) {
  const el   = document.getElementById('home-prod-list');
  if (!el || !cfg?.apiKey) return;

  if (cache?.production) { _homeRenderProduction(el, cache.production); return; }

  try {
    const token = typeof authToken === 'function' ? await authToken() : null;

    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents:runQuery?key=${cfg.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ structuredQuery: {
          from:    [{ collectionId: 'production_entries' }],
          orderBy: [{ field: { fieldPath: 'date' }, direction: 'DESCENDING' }],
          limit:   50,
        }}),
      }
    );
    const rows    = await res.json();
    const production = (Array.isArray(rows) ? rows : []).filter(r => r.document).map(r => {
      const f = r.document.fields || {};
      return {
        product:  f.productName?.stringValue || f.product?.stringValue || '—',
        qty:      parseFloat(f.quantity?.doubleValue || f.quantity?.integerValue || 0),
        unit:     f.unit?.stringValue || 'Stk',
        date:     f.date?.stringValue || f.createdAt?.timestampValue || '',
        worker:   f.worker?.stringValue || f.createdBy?.stringValue || '',
      };
    });
    _homeSetCache({ production });
    _homeRenderProduction(el, production);
  } catch (_) {
    el.innerHTML = `<div class="home-empty">Nicht verfügbar</div>`;
  }
}

function _homeRenderProduction(el, entries) {
  const today    = new Date(); today.setHours(0,0,0,0);
  const todayStr = today.toISOString().slice(0,10);
  const todayQty = entries.filter(e => (e.date||'').slice(0,10) === todayStr).reduce((s,e) => s + e.qty, 0);
  _homeSetStat('home-stat-prod', Math.round(todayQty) + ' Stk');

  if (!entries.length) {
    el.innerHTML = `<div class="home-empty">Keine Produktionsdaten</div>`;
    return;
  }
  const groups = {};
  entries.forEach(e => { if (!groups[e.product]) groups[e.product] = 0; groups[e.product] += e.qty; });
  el.innerHTML = Object.entries(groups).slice(0, 5).map(([prod, qty]) => `
    <div class="home-list-item">
      <div class="home-list-icon prod">⚙</div>
      <div class="home-list-body">
        <div class="home-list-title">${_hesc(prod)}</div>
        <div class="home-list-sub">Letzte 50 Einträge gesamt</div>
      </div>
      <div class="home-list-badge">${Math.round(qty)} Stk</div>
    </div>`).join('');
}

// ── Update greeting after profile loaded ─────────────────────
// Called by email.js once the real display name is available
function _homeUpdateGreeting() {
  const el = document.getElementById('home-greeting');
  if (!el) return;

  // Try _userDispName first, then scan localStorage cache
  let name = (typeof _userDispName !== 'undefined' && _userDispName) ? _userDispName : null;
  if (!name) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('_wf_profile_')) {
          const cached = JSON.parse(localStorage.getItem(key) || 'null');
          if (cached?.name) { name = cached.name; break; }
        }
      }
    } catch {}
  }
  if (!name) return; // still nothing — don't overwrite with empty

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
  const nameCap = name.charAt(0).toUpperCase() + name.slice(1);
  el.textContent = `${greeting}, ${nameCap} 👋`;
}

// ── Helpers ──────────────────────────────────────────────────
function _homeSetStat(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function _hesc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
