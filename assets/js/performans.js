'use strict';
// ══════════════════════════════════════════════════════════════
// PERFORMANS.JS — Eleman Performans Sayfası
// ── Optimierungen:
//    1. Server-seitiger Datumsfilter (Firestore where-Klausel)
//    2. In-Memory Cache mit 5-Min TTL pro Zeitraum
//    3. Background Preload nach Login
//    4. Cursor-basierte Pagination statt Offset
// ══════════════════════════════════════════════════════════════

let _perfData    = [];
let _perfSortBy  = 'revenue';
let _perfPeriod  = 90;

// ── Cache: { period -> { data, ts } } ────────────────────────
const _PERF_TTL = 5 * 60 * 1000;   // 5 Minuten
const _perfCache = {};              // keyed by period (days)

// Nach Login aufrufen: lädt Daten im Hintergrund
function performansPreload() {
  const cfg = typeof loadFbConfig === 'function' ? loadFbConfig() : null;
  if (!cfg) return;
  // Leise im Hintergrund laden, kein UI-Update
  setTimeout(() => _perfFetchAll(90, cfg).catch(() => {}), 3000);
}

// ── Helpers ──────────────────────────────────────────────────
const _perfFmt = (n, d = 0) =>
  Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const _perfEur = n => '€\u202f' + _perfFmt(n, 2);
const _pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;

function _perfBar(val, max, color = '#6366f1') {
  const pct = max > 0 ? Math.min(100, Math.round((val / max) * 100)) : 0;
  return `<div style="background:#f1f5f9;border-radius:4px;height:6px;width:100%;min-width:60px;">
    <div style="background:${color};height:6px;border-radius:4px;width:${pct}%;transition:width .6s ease;"></div></div>`;
}
function _rankBadge(i) {
  const m = ['🥇','🥈','🥉'];
  return i < 3
    ? `<span style="font-size:18px;">${m[i]}</span>`
    : `<span class="text-muted fw-semibold" style="font-size:13px;">#${i+1}</span>`;
}

// ── Main load (UI entry point) ────────────────────────────────
async function performansLoad() {
  const periodEl = document.getElementById('perf-period-sel');
  _perfPeriod = parseInt(periodEl?.value ?? 90);

  const wrap   = document.getElementById('perf-table-wrap');
  const kpiRow = document.getElementById('perf-kpi-row');

  // Sofort aus Cache rendern falls vorhanden
  const cached = _perfCache[_perfPeriod];
  if (cached && (Date.now() - cached.ts) < _PERF_TTL) {
    _perfData = cached.data;
    _perfApplySort(_perfSortBy);
    _perfRenderKpis(kpiRow, cached.filtEmails, cached.filtQuotes);
    _perfRenderTable(wrap);
    // Im Hintergrund trotzdem aktualisieren falls Cache > 2 Min alt
    if (Date.now() - cached.ts > 2 * 60 * 1000) {
      _perfRefreshBackground(_perfPeriod);
    }
    return;
  }

  if (wrap)   wrap.innerHTML = '<div class="text-center py-5 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Yükleniyor…</div>';
  if (kpiRow) kpiRow.innerHTML = '';

  try {
    const cfg   = loadFbConfig();
    const token = await authToken();
    if (!cfg || !token) {
      if (wrap) wrap.innerHTML = '<div class="alert alert-warning m-3">Firebase bağlantısı yok.</div>';
      return;
    }
    await _perfFetchAll(_perfPeriod, cfg, token, wrap, kpiRow);
  } catch (e) {
    if (wrap) wrap.innerHTML = `<div class="alert alert-danger m-3">Hata: ${e.message}</div>`;
    console.error('[Performans]', e);
  }
}

async function _perfRefreshBackground(period) {
  try {
    const cfg   = loadFbConfig();
    const token = await authToken();
    if (cfg && token) await _perfFetchAll(period, cfg, token, null, null);
  } catch {}
}

// ── Core fetch + compute + render ────────────────────────────
async function _perfFetchAll(period, cfg, token, wrap, kpiRow) {
  if (!token) token = await authToken();
  if (!token) return;

  const cutoff    = period > 0 ? new Date(Date.now() - period * 86400000) : new Date(0);
  const cutoffISO = cutoff.toISOString();

  // Parallel fetch mit server-seitigem Datumsfilter für emails+quotes
  const [employees, emails, quotes] = await Promise.all([
    _perfFetchSimple(cfg, token, 'fuarEmployees'),          // klein, kein Filter nötig
    _perfFetchFiltered(cfg, token, 'crm_emails',  cutoffISO, 'createdAt'),
    _perfFetchFiltered(cfg, token, 'crm_quotes',  cutoffISO, 'createdAt'),
  ]);

  // Für Reply-Rate: brauchen wir alle inbound (nicht gefiltert nach User)
  // → schon in emails enthalten

  const filtEmails = emails;  // server hat schon gefiltert
  const filtQuotes = quotes;

  _perfData = employees
    .filter(emp => emp.name || emp.email || emp.emailAddress)
    .map(emp => _buildUserStats(emp, filtEmails, filtQuotes));

  // Cache speichern
  _perfCache[period] = { data: [..._perfData], filtEmails, filtQuotes, ts: Date.now() };

  _perfApplySort(_perfSortBy);

  // Nur rendern wenn Tab aktiv (wrap vorhanden)
  if (wrap)   _perfRenderTable(wrap);
  if (kpiRow) _perfRenderKpis(kpiRow, filtEmails, filtQuotes);
}

// ── Fetch ohne Filter (kleine Collections) ───────────────────
async function _perfFetchSimple(cfg, token, collId) {
  const body = { structuredQuery: { from: [{ collectionId: collId }], limit: 500 } };
  const res  = await _perfRunQuery(cfg, token, body);
  return _perfParseRows(await res.json());
}

// ── Fetch mit Server-seitigem Datumsfilter ───────────────────
async function _perfFetchFiltered(cfg, token, collId, cutoffISO, dateField) {
  const all = [];
  let lastDocName = null;

  // Wenn kein Cutoff (Tüm Zamanlar): max 1000 Docs
  const useFilter = cutoffISO > new Date(0).toISOString();

  while (true) {
    const query = {
      from: [{ collectionId: collId }],
      orderBy: [{ field: { fieldPath: dateField }, direction: 'DESCENDING' }],
      limit: 500,
    };

    // Server-seitiger Filter: nur Docs >= cutoff
    if (useFilter) {
      query.where = {
        fieldFilter: {
          field: { fieldPath: dateField },
          op: 'GREATER_THAN_OR_EQUAL',
          value: { timestampValue: cutoffISO },
        }
      };
    }

    // Cursor-basierte Pagination (kein Offset!)
    if (lastDocName) {
      query.startAfter = { before: false, values: [{ referenceValue: lastDocName }] };
    }

    const res  = await _perfRunQuery(cfg, token, { structuredQuery: query });
    const rows = await res.json();
    if (!Array.isArray(rows)) break;

    const docs = _perfParseRows(rows);
    all.push(...docs);

    // Nächste Seite?
    const lastRow = rows[rows.length - 1];
    if (!lastRow?.document || docs.length < 500) break;
    lastDocName = lastRow.document.name;
  }

  return all;
}

function _perfRunQuery(cfg, token, body) {
  return fetch(
    `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents:runQuery?key=${cfg.apiKey}`,
    { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
      body: JSON.stringify(body) }
  );
}

function _perfParseRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter(r => r.document).map(r => {
    const f   = r.document.fields || {};
    const obj = { _id: r.document.name.split('/').pop(), _ref: r.document.name };
    for (const [k, v] of Object.entries(f)) {
      obj[k] = v.stringValue ?? v.doubleValue ?? v.integerValue
             ?? v.booleanValue ?? v.timestampValue
             ?? (v.arrayValue?.values ? v.arrayValue.values : null) ?? null;
    }
    return obj;
  });
}

function _perfDate(doc) {
  const raw = doc.sentAt || doc.createdAt || doc.updatedAt || '';
  if (!raw) return new Date(0);
  try { return new Date(raw); } catch { return new Date(0); }
}

// ── Sort ──────────────────────────────────────────────────────
function perfSort(by, el) {
  _perfSortBy = by;
  document.querySelectorAll('[id^="perf-sort-"]').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  _perfApplySort(by);
  _perfRenderTable(document.getElementById('perf-table-wrap'));
}
function _perfApplySort(by) {
  const m = { revenue:(a,b)=>b.wonVal-a.wonVal, emails:(a,b)=>b.emailsSent-a.emailsSent,
               reply:(a,b)=>b.replyRate-a.replyRate, conv:(a,b)=>b.convRate-a.convRate };
  _perfData.sort(m[by] || m.revenue);
}

// ── Build stats for one user ──────────────────────────────────
function _buildUserStats(emp, filtEmails, filtQuotes) {
  const uid   = emp._id || '';
  const name  = emp.name || emp.displayName || '';
  const email = emp.emailAddress || emp.email || '';
  const fn    = name.toLowerCase().split(' ')[0];

  const matchEmail = e =>
    (e.createdByUid && e.createdByUid === uid) ||
    (e.createdBy && (e.createdBy === name || e.createdBy === email ||
      (fn && e.createdBy.toLowerCase().includes(fn))));

  const matchQuote = q =>
    (name && q.createdBy && (q.createdBy === name || q.createdBy === email ||
      (fn && q.createdBy.toLowerCase().includes(fn)))) ||
    (email && q.createdBy === email);

  const myEmails = filtEmails.filter(matchEmail);
  const sent     = myEmails.filter(e => e.direction === 'outbound');
  const inbound  = filtEmails.filter(e => e.direction === 'inbound');

  // Reply rate: Kontakte die auf unsere Mail geantwortet haben
  const sentByContact = {};
  sent.forEach(e => {
    if (e.contactId) {
      const d = _perfDate(e);
      if (!sentByContact[e.contactId] || d < sentByContact[e.contactId]) {
        sentByContact[e.contactId] = d;
      }
    }
  });
  const contactsEmailed  = Object.keys(sentByContact).length;
  const contactsReplied  = Object.keys(sentByContact).filter(cid =>
    inbound.some(e => e.contactId === cid && _perfDate(e) > sentByContact[cid])
  ).length;

  const myQuotes   = filtQuotes.filter(matchQuote);
  const wonQuotes  = myQuotes.filter(q => q.status==='won'||q.status==='kazanıldı');
  const wonVal     = wonQuotes.reduce((s,q)=>s+Number(q.totalNet||0),0);
  const totalQVal  = myQuotes.reduce((s,q)=>s+Number(q.totalNet||0),0);

  return {
    uid, name: name||email||uid, role: emp.crmRole||'sales', email,
    emailsSent: sent.length,
    contactsEmailed, contactsReplied,
    replyRate: _pct(contactsReplied, contactsEmailed),
    quotesTotal: myQuotes.length,
    quotesWon:   wonQuotes.length,
    quotesLost:  myQuotes.filter(q=>q.status==='lost'||q.status==='kaybedildi').length,
    totalQuoteVal: totalQVal,
    wonVal,
    convRate: _pct(wonQuotes.length, myQuotes.length),
    avgDeal: wonQuotes.length>0 ? wonVal/wonQuotes.length : 0,
    _emails: myEmails,
    _quotes: myQuotes,
  };
}

// ── Render KPI row ────────────────────────────────────────────
function _perfRenderKpis(row, emails, quotes) {
  if (!row) return;
  const totalSent   = emails.filter(e=>e.direction==='outbound').length;
  const wonVal      = quotes.filter(q=>q.status==='won'||q.status==='kazanıldı').reduce((s,q)=>s+Number(q.totalNet||0),0);
  const totalQVal   = quotes.reduce((s,q)=>s+Number(q.totalNet||0),0);
  const wonCt       = quotes.filter(q=>q.status==='won'||q.status==='kazanıldı').length;
  const teamConv    = _pct(wonCt, quotes.length);
  const avgReply    = _perfData.length ? Math.round(_perfData.reduce((s,u)=>s+u.replyRate,0)/_perfData.length) : 0;

  const kpis = [
    { icon:'bi-send-fill',        color:'#6366f1', label:'Toplam Gönderilen E-posta', val:_perfFmt(totalSent),    sub:`${_perfData.length} satıcı` },
    { icon:'bi-reply-fill',        color:'#10b981', label:'Ort. Yanıt Oranı',          val:avgReply+'%',           sub:'gönderilen e-postalara' },
    { icon:'bi-file-earmark-text', color:'#f59e0b', label:'Toplam Teklif Tutarı',      val:_perfEur(totalQVal),    sub:`${quotes.length} teklif` },
    { icon:'bi-trophy-fill',       color:'#ef4444', label:'Kazanılan Ciro',             val:_perfEur(wonVal),       sub:`Dönüşüm: ${teamConv}%` },
  ];

  row.innerHTML = kpis.map(k=>`
    <div class="col-6 col-md-3">
      <div class="card border-0 shadow-sm h-100" style="border-radius:12px;">
        <div class="card-body d-flex gap-3 align-items-center p-3">
          <div style="width:42px;height:42px;border-radius:10px;background:${k.color}18;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i class="bi ${k.icon}" style="font-size:18px;color:${k.color};"></i>
          </div>
          <div class="min-w-0">
            <div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">${k.label}</div>
            <div style="font-size:20px;font-weight:800;color:#1e293b;line-height:1.2;">${k.val}</div>
            <div style="font-size:11px;color:#94a3b8;">${k.sub}</div>
          </div>
        </div>
      </div>
    </div>`).join('');
}

// ── Render ranking table ──────────────────────────────────────
function _perfRenderTable(wrap) {
  if (!wrap) return;
  if (!_perfData.length) {
    wrap.innerHTML = '<div class="text-center py-5 text-muted"><i class="bi bi-people" style="font-size:2.5rem;opacity:.3;"></i><div class="mt-2">Çalışan verisi bulunamadı</div></div>';
    return;
  }
  const maxRev   = Math.max(..._perfData.map(u=>u.wonVal),1);
  const maxEmail = Math.max(..._perfData.map(u=>u.emailsSent),1);
  const colors   = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6'];

  wrap.innerHTML = `
  <div class="table-responsive">
  <table class="table table-hover mb-0" style="font-size:13px;">
    <thead style="background:#f8fafc;">
      <tr>
        <th style="width:50px;padding:10px 16px;" class="text-center">#</th>
        <th style="padding:10px 8px;">Satıcı</th>
        <th style="padding:10px 8px;" class="text-end">E-posta<br><span class="fw-normal text-muted" style="font-size:10px;">Gönderildi</span></th>
        <th style="padding:10px 8px;" class="text-center">Yanıt<br><span class="fw-normal text-muted" style="font-size:10px;">Oranı</span></th>
        <th style="padding:10px 8px;" class="text-center">Teklifler<br><span class="fw-normal text-muted" style="font-size:10px;">Toplam / Kazanılan</span></th>
        <th style="padding:10px 8px;" class="text-center">Dönüşüm</th>
        <th style="padding:10px 8px;min-width:160px;">Kazanılan Ciro</th>
        <th style="padding:10px 8px;" class="text-end">Ort. Anlaşma</th>
        <th style="width:70px;padding:10px 8px;"></th>
      </tr>
    </thead>
    <tbody>
    ${_perfData.map((u,i) => {
      const rc = u.replyRate>=50?'#10b981':u.replyRate>=25?'#f59e0b':'#94a3b8';
      const cc = u.convRate>=50?'#10b981':u.convRate>=25?'#f59e0b':'#94a3b8';
      const initials = u.name.split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2)||'?';
      return `<tr style="cursor:pointer;" onclick="perfShowDetail('${_esc(u.uid||u.name)}')">
        <td class="text-center align-middle" style="padding:12px 16px;">${_rankBadge(i)}</td>
        <td class="align-middle" style="padding:12px 8px;">
          <div class="d-flex align-items-center gap-2">
            <div style="width:34px;height:34px;border-radius:50%;background:${colors[i%6]};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">${initials}</div>
            <div>
              <div class="fw-semibold" style="color:#1e293b;">${_esc(u.name)}</div>
              <div style="font-size:10px;">${u.role==='admin'?'<span class="badge" style="background:#6366f1;font-size:9px;">Admin</span>':'<span class="badge bg-secondary" style="font-size:9px;">Verkäufer</span>'}</div>
            </div>
          </div>
        </td>
        <td class="text-end align-middle" style="padding:12px 8px;">
          <span class="fw-semibold" style="font-size:15px;">${_perfFmt(u.emailsSent)}</span>
          ${_perfBar(u.emailsSent,maxEmail,'#6366f1')}
        </td>
        <td class="text-center align-middle" style="padding:12px 8px;">
          <span class="fw-bold" style="font-size:15px;color:${rc};">${u.replyRate}%</span>
          <div class="text-muted" style="font-size:10px;">${u.contactsReplied}/${u.contactsEmailed}</div>
        </td>
        <td class="text-center align-middle" style="padding:12px 8px;">
          <span class="fw-semibold">${u.quotesTotal}</span> <span class="text-muted">/</span> <span class="text-success fw-semibold">${u.quotesWon}</span>
        </td>
        <td class="text-center align-middle" style="padding:12px 8px;">
          <span class="fw-bold" style="font-size:15px;color:${cc};">${u.convRate}%</span>
        </td>
        <td class="align-middle" style="padding:12px 8px;">
          <div class="fw-bold" style="color:#1e293b;">${_perfEur(u.wonVal)}</div>
          ${_perfBar(u.wonVal,maxRev,'#10b981')}
        </td>
        <td class="text-end align-middle" style="padding:12px 8px;">
          <span class="text-muted">${u.avgDeal>0?_perfEur(u.avgDeal):'—'}</span>
        </td>
        <td class="align-middle text-center" style="padding:12px 8px;">
          <button class="btn btn-sm btn-outline-secondary py-0 px-2" style="font-size:11px;"
            onclick="event.stopPropagation();perfShowDetail('${_esc(u.uid||u.name)}')">Detail</button>
        </td>
      </tr>`;
    }).join('')}
    </tbody>
  </table></div>`;
}

// ── Detail Modal ──────────────────────────────────────────────
function perfShowDetail(uidOrName) {
  const u = _perfData.find(x => x.uid===uidOrName || x.name===uidOrName);
  if (!u) return;

  document.getElementById('perf-detail-name').textContent = u.name;
  document.getElementById('perf-detail-role').textContent =
    (u.role==='admin'?'Admin':'Verkäufer') + (u.email?' · '+u.email:'');

  const body = document.getElementById('perf-detail-body');

  // Monthly bar chart (last 6 months)
  const months = {};
  u._emails.filter(e=>e.direction==='outbound').forEach(e=>{
    const d = _perfDate(e); if(isNaN(d)) return;
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    months[k]=(months[k]||0)+1;
  });
  const mKeys  = Object.keys(months).sort().slice(-6);
  const maxM   = Math.max(...Object.values(months),1);
  const chartHtml = mKeys.length ? `
    <div class="text-muted mb-1" style="font-size:11px;font-weight:600;">E-POSTA AKTİVİTESİ (SON 6 AY)</div>
    <div class="d-flex align-items-end gap-2" style="height:64px;">
      ${mKeys.map(k=>{
        const pct=Math.round((months[k]/maxM)*52); const lbl=k.slice(5);
        return `<div class="d-flex flex-column align-items-center flex-grow-1" style="gap:2px;">
          <div style="font-size:9px;color:#6366f1;font-weight:600;">${months[k]}</div>
          <div style="background:#6366f1;border-radius:3px 3px 0 0;width:100%;height:${Math.max(pct,3)}px;"></div>
          <div style="font-size:9px;color:#94a3b8;">${lbl}</div></div>`;
      }).join('')}
    </div>` : '<div class="text-muted" style="font-size:12px;">Bu dönemde e-posta aktivitesi yok</div>';

  // Recent quotes table
  const rq = [...u._quotes].sort((a,b)=>_perfDate(b)-_perfDate(a)).slice(0,5);
  const statusBadge = s => ({
    won:'<span class="badge bg-success" style="font-size:10px;">Kazanıldı</span>',
    lost:'<span class="badge bg-danger" style="font-size:10px;">Kaybedildi</span>',
    sent:'<span class="badge bg-primary" style="font-size:10px;">Gönderildi</span>',
    draft:'<span class="badge bg-secondary" style="font-size:10px;">Taslak</span>',
  }[s] || `<span class="badge bg-light text-dark" style="font-size:10px;">${s||'?'}</span>`);

  const quotesHtml = rq.length ? `
    <table class="table table-sm mb-0" style="font-size:12px;">
      <thead><tr><th>Teklif No</th><th>Müşteri</th><th class="text-end">Tutar</th><th>Durum</th><th>Tarih</th></tr></thead>
      <tbody>${rq.map(q=>`<tr>
        <td class="fw-semibold">${_esc(q.quoteNumber||'—')}</td>
        <td>${_esc(q.contactName||q.contactCompany||'—')}</td>
        <td class="text-end">${_perfEur(q.totalNet||0)}</td>
        <td>${statusBadge(q.status)}</td>
        <td class="text-muted">${q.createdAt?new Date(q.createdAt).toLocaleDateString('tr-TR'):'—'}</td>
      </tr>`).join('')}</tbody>
    </table>`
    : '<div class="text-muted text-center py-3" style="font-size:13px;">Bu dönemde teklif yok</div>';

  // Recent emails table
  const re = [...u._emails].sort((a,b)=>_perfDate(b)-_perfDate(a)).slice(0,5);
  const emailsHtml = re.length ? `
    <table class="table table-sm mb-0" style="font-size:12px;">
      <thead><tr><th>Yön</th><th>Konu</th><th>Kişi</th><th>Tarih</th></tr></thead>
      <tbody>${re.map(e=>{
        const dir = e.direction==='outbound'
          ? '<span class="badge" style="background:#e0e7ff;color:#6366f1;font-size:9px;">↑ Giden</span>'
          : '<span class="badge" style="background:#d1fae5;color:#059669;font-size:9px;">↓ Gelen</span>';
        const who = e.direction==='outbound'?(e.to||'—'):(e.from||'—');
        return `<tr>
          <td>${dir}</td>
          <td class="text-truncate" style="max-width:180px;">${_esc(e.subject||'(Konu yok)')}</td>
          <td class="text-muted text-truncate" style="max-width:130px;">${_esc(who)}</td>
          <td class="text-muted">${_perfDate(e).toLocaleDateString('tr-TR')}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`
    : '<div class="text-muted text-center py-3" style="font-size:13px;">Bu dönemde e-posta yok</div>';

  body.innerHTML = `
    <div class="row g-3 mb-4">
      ${[
        {icon:'bi-send',       color:'#6366f1',label:'E-posta Gönderildi',  val:_perfFmt(u.emailsSent)},
        {icon:'bi-reply',      color:'#10b981',label:'Yanıt Oranı',          val:u.replyRate+'%'},
        {icon:'bi-file-text',  color:'#f59e0b',label:'Toplam Teklifler',     val:_perfFmt(u.quotesTotal)},
        {icon:'bi-check-circle',color:'#10b981',label:'Kazanılan',           val:_perfFmt(u.quotesWon)},
        {icon:'bi-percent',    color:'#3b82f6',label:'Dönüşüm Oranı',        val:u.convRate+'%'},
        {icon:'bi-trophy',     color:'#f59e0b',label:'Kazanılan Ciro',        val:_perfEur(u.wonVal)},
      ].map(k=>`<div class="col-6 col-md-2">
        <div class="text-center p-2 rounded" style="background:#f8fafc;">
          <i class="bi ${k.icon}" style="font-size:20px;color:${k.color};"></i>
          <div class="fw-bold mt-1" style="font-size:15px;">${k.val}</div>
          <div class="text-muted" style="font-size:10px;">${k.label}</div>
        </div></div>`).join('')}
    </div>
    <div class="mb-4 p-3 rounded" style="background:#f8fafc;">${chartHtml}</div>
    <div class="row g-3">
      <div class="col-md-6">
        <div class="fw-semibold mb-2" style="font-size:13px;"><i class="bi bi-file-earmark-text text-warning me-1"></i>Son Teklifler</div>
        <div class="border rounded overflow-hidden">${quotesHtml}</div>
      </div>
      <div class="col-md-6">
        <div class="fw-semibold mb-2" style="font-size:13px;"><i class="bi bi-envelope text-primary me-1"></i>Son E-postalar</div>
        <div class="border rounded overflow-hidden">${emailsHtml}</div>
      </div>
    </div>`;

  bootstrap.Modal.getOrCreateInstance(document.getElementById('perfDetailModal')).show();
}

// ── Cache löschen (bei Zeitraum-Wechsel) ─────────────────────
function perfClearCache() { Object.keys(_perfCache).forEach(k=>delete _perfCache[k]); }

// ── Utility ───────────────────────────────────────────────────
function _esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
