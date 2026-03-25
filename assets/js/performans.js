'use strict';
// ══════════════════════════════════════════════════════════════
// PERFORMANS.JS — Eleman Performans Sayfası
// ══════════════════════════════════════════════════════════════

let _perfData    = [];   // computed per-user stats
let _perfSortBy  = 'revenue';
let _perfPeriod  = 90;   // days

// ── Helpers ──────────────────────────────────────────────────
function _perfFmt(n, decimals = 0) {
  return Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function _perfEur(n) {
  return '€ ' + _perfFmt(n, 2);
}
function _pct(a, b) {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}
function _perfBar(val, max, color = '#6366f1') {
  const pct = max > 0 ? Math.min(100, Math.round((val / max) * 100)) : 0;
  return `<div style="background:#f1f5f9;border-radius:4px;height:6px;width:100%;min-width:60px;">
    <div style="background:${color};height:6px;border-radius:4px;width:${pct}%;transition:width .5s;"></div>
  </div>`;
}
function _rankBadge(i) {
  const medals = ['🥇', '🥈', '🥉'];
  if (i < 3) return `<span style="font-size:18px;">${medals[i]}</span>`;
  return `<span class="text-muted fw-semibold" style="font-size:13px;">#${i + 1}</span>`;
}
function _trendArrow(val) {
  if (val > 0) return '<span class="text-success ms-1" style="font-size:11px;">▲</span>';
  if (val < 0) return '<span class="text-danger ms-1" style="font-size:11px;">▼</span>';
  return '';
}

// ── Main load ─────────────────────────────────────────────────
async function performansLoad() {
  const periodEl = document.getElementById('perf-period-sel');
  _perfPeriod = parseInt(periodEl?.value ?? 90);

  const wrap = document.getElementById('perf-table-wrap');
  const kpiRow = document.getElementById('perf-kpi-row');
  if (wrap)   wrap.innerHTML = '<div class="text-center py-5 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Veriler yükleniyor…</div>';
  if (kpiRow) kpiRow.innerHTML = '';

  try {
    const cfg   = loadFbConfig();
    const token = await authToken();
    if (!cfg || !token) {
      if (wrap) wrap.innerHTML = '<div class="alert alert-warning m-3">Firebase bağlantısı yok. Önce Fuarbot Sync sayfasında bağlantı kurun.</div>';
      return;
    }

    // ── Parallel fetch: employees + emails + quotes ───────────
    const [employees, emails, quotes] = await Promise.all([
      _perfFetchCollection(cfg, token, 'fuarEmployees'),
      _perfFetchCollection(cfg, token, 'crm_emails'),
      _perfFetchCollection(cfg, token, 'crm_quotes'),
    ]);

    // Period cutoff
    const cutoff = _perfPeriod > 0
      ? new Date(Date.now() - _perfPeriod * 86400000)
      : new Date(0);

    // Filter by period
    const filtEmails = emails.filter(e => _perfDate(e) >= cutoff);
    const filtQuotes = quotes.filter(q => _perfDate(q) >= cutoff);

    // ── Build per-user stats ──────────────────────────────────
    _perfData = employees
      .filter(emp => emp.name || emp.email || emp.emailAddress)
      .map(emp => _buildUserStats(emp, filtEmails, filtQuotes, emails, quotes));

    // Sort
    _perfApplySort(_perfSortBy);

    // Render
    _perfRenderKpis(kpiRow, filtEmails, filtQuotes);
    _perfRenderTable(wrap);

  } catch (e) {
    if (wrap) wrap.innerHTML = `<div class="alert alert-danger m-3">Hata: ${e.message}</div>`;
    console.error('[Performans]', e);
  }
}

// ── Fetch entire collection ───────────────────────────────────
async function _perfFetchCollection(cfg, token, collId) {
  let all = [], nextPage = null;
  do {
    const body = { structuredQuery: {
      from: [{ collectionId: collId }],
      limit: 300,
      ...(nextPage ? { offset: all.length } : {}),
    }};
    const res  = await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents:runQuery?key=${cfg.apiKey}`,
      { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`}, body: JSON.stringify(body) }
    );
    const rows = await res.json();
    if (!Array.isArray(rows)) break;
    const docs = rows.filter(r => r.document).map(r => {
      const f = r.document.fields || {};
      const obj = { _id: r.document.name.split('/').pop() };
      for (const [k,v] of Object.entries(f)) {
        obj[k] = v.stringValue ?? v.doubleValue ?? v.integerValue ?? v.booleanValue
               ?? v.timestampValue ?? (v.arrayValue ? v.arrayValue.values : null) ?? null;
      }
      return obj;
    });
    all = all.concat(docs);
    nextPage = rows.length === 300;
  } while (nextPage);
  return all;
}

function _perfDate(doc) {
  const raw = doc.sentAt || doc.createdAt || doc.updatedAt || '';
  if (!raw) return new Date(0);
  try { return new Date(raw); } catch { return new Date(0); }
}

// ── Build stats for one user ──────────────────────────────────
function _buildUserStats(emp, filtEmails, filtQuotes, allEmails, allQuotes) {
  const uid   = emp._id || '';
  const name  = emp.name || emp.displayName || '';
  const email = emp.emailAddress || emp.email || '';

  // Match emails: by createdByUid OR by createdBy name/email
  const myEmails = filtEmails.filter(e =>
    (e.createdByUid && e.createdByUid === uid) ||
    (e.createdBy && (
      e.createdBy === name ||
      e.createdBy === email ||
      (name && e.createdBy.toLowerCase().includes(name.toLowerCase().split(' ')[0]))
    ))
  );

  const sent     = myEmails.filter(e => e.direction === 'outbound');
  const received = filtEmails.filter(e => e.direction === 'inbound'); // all inbound

  // Reply rate: unique contacts with inbound reply after our outbound
  const sentByContact = {};
  sent.forEach(e => {
    if (e.contactId) {
      if (!sentByContact[e.contactId] || new Date(e.sentAt||e.createdAt) < new Date(sentByContact[e.contactId])) {
        sentByContact[e.contactId] = e.sentAt || e.createdAt || '';
      }
    }
  });
  const contactsEmailed = Object.keys(sentByContact).length;
  const contactsReplied = Object.keys(sentByContact).filter(cid => {
    const sentDate = sentByContact[cid];
    return received.some(e =>
      e.contactId === cid &&
      new Date(e.sentAt || e.createdAt) > new Date(sentDate)
    );
  }).length;
  const replyRate = _pct(contactsReplied, contactsEmailed);

  // Quotes: match by name OR email (createdBy field)
  const matchQuote = (q) =>
    (name && q.createdBy && (
      q.createdBy === name ||
      q.createdBy === email ||
      (name.split(' ')[0] && q.createdBy.toLowerCase().includes(name.toLowerCase().split(' ')[0]))
    )) ||
    (email && q.createdBy === email);

  const myQuotes   = filtQuotes.filter(matchQuote);
  const wonQuotes  = myQuotes.filter(q => q.status === 'won' || q.status === 'kazanıldı');
  const lostQuotes = myQuotes.filter(q => q.status === 'lost' || q.status === 'kaybedildi');
  const sentQs     = myQuotes.filter(q => q.status === 'sent' || q.status === 'gönderildi');

  const totalQuoteVal = myQuotes.reduce((s,q) => s + Number(q.totalNet||0), 0);
  const wonVal        = wonQuotes.reduce((s,q) => s + Number(q.totalNet||0), 0);
  const convRate      = _pct(wonQuotes.length, myQuotes.length);
  const avgDeal       = wonQuotes.length > 0 ? wonVal / wonQuotes.length : 0;

  // All-time for trend (compare with prev period)
  const allMyQuotes = allQuotes.filter(matchQuote);
  const allMyEmails = allEmails.filter(e =>
    (e.createdByUid && e.createdByUid === uid) ||
    (e.createdBy && (
      e.createdBy === name || e.createdBy === email ||
      (name && e.createdBy.toLowerCase().includes(name.toLowerCase().split(' ')[0]))
    ))
  );

  return {
    uid, name: name || email || uid,
    role: emp.crmRole || 'sales',
    email: email,
    // Email metrics
    emailsSent: sent.length,
    emailsReceived: myEmails.filter(e => e.direction === 'inbound').length,
    contactsEmailed,
    contactsReplied,
    replyRate,
    // Quote metrics
    quotesTotal: myQuotes.length,
    quotesWon: wonQuotes.length,
    quotesLost: lostQuotes.length,
    quotesSent: sentQs.length,
    totalQuoteVal,
    wonVal,
    convRate,
    avgDeal,
    // All-time totals
    allEmailsSent: allMyEmails.filter(e=>e.direction==='outbound').length,
    allWonVal: allMyQuotes.filter(q=>q.status==='won'||q.status==='kazanıldı').reduce((s,q)=>s+Number(q.totalNet||0),0),
    // Raw data for detail view
    _emails: myEmails,
    _quotes: myQuotes,
  };
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
  const sortMap = {
    revenue: (a, b) => b.wonVal - a.wonVal,
    emails:  (a, b) => b.emailsSent - a.emailsSent,
    reply:   (a, b) => b.replyRate - a.replyRate,
    conv:    (a, b) => b.convRate - a.convRate,
  };
  _perfData.sort(sortMap[by] || sortMap.revenue);
}

// ── Render KPI row ────────────────────────────────────────────
function _perfRenderKpis(row, emails, quotes) {
  if (!row) return;
  const totalSent    = emails.filter(e => e.direction === 'outbound').length;
  const totalWonVal  = quotes.filter(q=>q.status==='won'||q.status==='kazanıldı').reduce((s,q)=>s+Number(q.totalNet||0),0);
  const totalQVal    = quotes.reduce((s,q)=>s+Number(q.totalNet||0),0);
  const wonCt        = quotes.filter(q=>q.status==='won'||q.status==='kazanıldı').length;
  const teamConv     = _pct(wonCt, quotes.length);

  const allReplies   = _perfData.length > 0
    ? Math.round(_perfData.reduce((s,u)=>s+u.replyRate,0) / _perfData.length)
    : 0;

  const kpis = [
    { icon:'bi-send-fill',        color:'#6366f1', label:'Toplam Gönderilen E-posta', val: _perfFmt(totalSent), sub: `${_perfData.length} aktif satıcı` },
    { icon:'bi-reply-fill',       color:'#10b981', label:'Ort. Yanıt Oranı',          val: allReplies + '%',    sub: 'Gönderilen e-postalara yanıt' },
    { icon:'bi-file-earmark-text',color:'#f59e0b', label:'Toplam Teklif Tutarı',      val: _perfEur(totalQVal), sub: `${quotes.length} teklif` },
    { icon:'bi-trophy-fill',      color:'#ef4444', label:'Kazanılan Ciro',            val: _perfEur(totalWonVal), sub: `Dönüşüm: ${teamConv}%` },
  ];

  row.innerHTML = kpis.map(k => `
    <div class="col-6 col-md-3">
      <div class="card border-0 shadow-sm h-100" style="border-radius:12px;">
        <div class="card-body d-flex gap-3 align-items-center p-3">
          <div style="width:42px;height:42px;border-radius:10px;background:${k.color}18;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i class="bi ${k.icon}" style="font-size:18px;color:${k.color};"></i>
          </div>
          <div class="min-w-0">
            <div style="font-size:11px;color:#94a3b8;font-weight:500;text-transform:uppercase;letter-spacing:.5px;">${k.label}</div>
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

  const maxRev   = Math.max(..._perfData.map(u=>u.wonVal), 1);
  const maxEmail = Math.max(..._perfData.map(u=>u.emailsSent), 1);

  wrap.innerHTML = `
  <div class="table-responsive">
  <table class="table table-hover mb-0" style="font-size:13px;">
    <thead style="background:#f8fafc;">
      <tr>
        <th style="width:50px;padding:10px 16px;" class="text-center">#</th>
        <th style="padding:10px 8px;">Satıcı</th>
        <th style="padding:10px 8px;" class="text-center">E-posta<br><span class="fw-normal text-muted" style="font-size:10px;">Gönderildi</span></th>
        <th style="padding:10px 8px;" class="text-center">Yanıt<br><span class="fw-normal text-muted" style="font-size:10px;">Oranı</span></th>
        <th style="padding:10px 8px;" class="text-center">Teklifler<br><span class="fw-normal text-muted" style="font-size:10px;">Toplam/Kazanılan</span></th>
        <th style="padding:10px 8px;" class="text-center">Dönüşüm<br><span class="fw-normal text-muted" style="font-size:10px;">Oranı</span></th>
        <th style="padding:10px 8px;min-width:160px;">Kazanılan Ciro</th>
        <th style="padding:10px 8px;" class="text-center">Ort. Anlaşma</th>
        <th style="width:50px;padding:10px 8px;"></th>
      </tr>
    </thead>
    <tbody>
    ${_perfData.map((u, i) => {
      const replyColor = u.replyRate >= 50 ? '#10b981' : u.replyRate >= 25 ? '#f59e0b' : '#94a3b8';
      const convColor  = u.convRate  >= 50 ? '#10b981' : u.convRate  >= 25 ? '#f59e0b' : '#94a3b8';
      const initials   = u.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
      const avatarCol  = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6'][i % 6];
      return `
      <tr style="cursor:pointer;" onclick="perfShowDetail('${u.uid||u.name}')">
        <td class="text-center align-middle" style="padding:12px 16px;">${_rankBadge(i)}</td>
        <td class="align-middle" style="padding:12px 8px;">
          <div class="d-flex align-items-center gap-2">
            <div style="width:34px;height:34px;border-radius:50%;background:${avatarCol};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">${initials}</div>
            <div>
              <div class="fw-semibold" style="color:#1e293b;">${_esc(u.name)}</div>
              <div class="text-muted" style="font-size:11px;">${u.role === 'admin' ? '<span class="badge bg-purple" style="background:#6366f1;font-size:9px;">Admin</span>' : '<span class="badge bg-secondary" style="font-size:9px;">Verkäufer</span>'}</div>
            </div>
          </div>
        </td>
        <td class="text-center align-middle" style="padding:12px 8px;">
          <span class="fw-semibold" style="font-size:15px;">${_perfFmt(u.emailsSent)}</span>
          ${_perfBar(u.emailsSent, maxEmail, '#6366f1')}
        </td>
        <td class="text-center align-middle" style="padding:12px 8px;">
          <span class="fw-bold" style="font-size:15px;color:${replyColor};">${u.replyRate}%</span>
          <div class="text-muted" style="font-size:10px;">${u.contactsReplied}/${u.contactsEmailed} müşteri</div>
        </td>
        <td class="text-center align-middle" style="padding:12px 8px;">
          <span class="fw-semibold">${u.quotesTotal}</span>
          <span class="text-muted">/</span>
          <span class="text-success fw-semibold">${u.quotesWon}</span>
        </td>
        <td class="text-center align-middle" style="padding:12px 8px;">
          <span class="fw-bold" style="font-size:15px;color:${convColor};">${u.convRate}%</span>
        </td>
        <td class="align-middle" style="padding:12px 8px;">
          <div class="fw-bold" style="color:#1e293b;">${_perfEur(u.wonVal)}</div>
          ${_perfBar(u.wonVal, maxRev, '#10b981')}
        </td>
        <td class="text-center align-middle" style="padding:12px 8px;">
          <span class="text-muted">${u.avgDeal > 0 ? _perfEur(u.avgDeal) : '—'}</span>
        </td>
        <td class="align-middle text-center" style="padding:12px 8px;">
          <button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="event.stopPropagation();perfShowDetail('${u.uid||u.name}')" style="font-size:11px;">Detail</button>
        </td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>
  </div>`;
}

// ── Detail Modal ──────────────────────────────────────────────
function perfShowDetail(uidOrName) {
  const u = _perfData.find(x => x.uid === uidOrName || x.name === uidOrName);
  if (!u) return;

  const nameEl = document.getElementById('perf-detail-name');
  const roleEl = document.getElementById('perf-detail-role');
  const body   = document.getElementById('perf-detail-body');
  if (nameEl) nameEl.textContent = u.name;
  if (roleEl) roleEl.textContent = (u.role === 'admin' ? 'Admin' : 'Verkäufer') + (u.email ? ' · ' + u.email : '');

  // Monthly activity chart
  const months = {};
  u._emails.filter(e=>e.direction==='outbound').forEach(e => {
    const d = new Date(_perfDate(e));
    if (isNaN(d)) return;
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    months[key] = (months[key]||0) + 1;
  });
  const monthKeys = Object.keys(months).sort().slice(-6);
  const maxM = Math.max(...Object.values(months), 1);

  const chartHtml = monthKeys.length ? `
    <div class="mb-1 text-muted" style="font-size:11px;">E-posta Aktivitesi (son 6 ay)</div>
    <div class="d-flex align-items-end gap-2" style="height:60px;">
      ${monthKeys.map(k => {
        const pct = Math.round((months[k]/maxM)*100);
        const label = k.slice(5); // MM
        return `<div class="d-flex flex-column align-items-center flex-grow-1">
          <div style="font-size:9px;color:#6366f1;font-weight:600;">${months[k]}</div>
          <div style="background:#6366f1;border-radius:3px 3px 0 0;width:100%;height:${Math.max(pct*0.5,2)}px;"></div>
          <div style="font-size:9px;color:#94a3b8;">${label}</div>
        </div>`;
      }).join('')}
    </div>` : '<div class="text-muted" style="font-size:12px;">Bu dönemde e-posta aktivitesi yok</div>';

  // Recent quotes
  const recentQuotes = [...u._quotes].sort((a,b)=>new Date(_perfDate(b))-new Date(_perfDate(a))).slice(0,5);
  const quotesHtml = recentQuotes.length ? `
    <table class="table table-sm mb-0" style="font-size:12px;">
      <thead><tr><th>Teklif No</th><th>Müşteri</th><th>Tutar</th><th>Durum</th><th>Tarih</th></tr></thead>
      <tbody>
        ${recentQuotes.map(q => {
          const statusMap = { won:'<span class="badge bg-success">Kazanıldı</span>', lost:'<span class="badge bg-danger">Kaybedildi</span>', sent:'<span class="badge bg-primary">Gönderildi</span>', draft:'<span class="badge bg-secondary">Taslak</span>' };
          const st = statusMap[q.status] || `<span class="badge bg-light text-dark">${q.status||'?'}</span>`;
          const dt = q.createdAt ? new Date(q.createdAt).toLocaleDateString('tr-TR') : '—';
          return `<tr>
            <td class="fw-semibold">${_esc(q.quoteNumber||'—')}</td>
            <td>${_esc(q.contactName||q.contactCompany||'—')}</td>
            <td>${_perfEur(q.totalNet||0)}</td>
            <td>${st}</td>
            <td class="text-muted">${dt}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : '<div class="text-muted text-center py-3" style="font-size:13px;">Bu dönemde teklif yok</div>';

  // Recent emails
  const recentEmails = [...u._emails].sort((a,b)=>new Date(_perfDate(b))-new Date(_perfDate(a))).slice(0,5);
  const emailsHtml = recentEmails.length ? `
    <table class="table table-sm mb-0" style="font-size:12px;">
      <thead><tr><th>Yön</th><th>Konu</th><th>Alıcı/Gönderici</th><th>Tarih</th></tr></thead>
      <tbody>
        ${recentEmails.map(e => {
          const dir = e.direction === 'outbound'
            ? '<span class="badge" style="background:#e0e7ff;color:#6366f1;font-size:10px;">↑ Giden</span>'
            : '<span class="badge" style="background:#d1fae5;color:#059669;font-size:10px;">↓ Gelen</span>';
          const who = e.direction === 'outbound' ? (e.to||'—') : (e.from||'—');
          const dt  = _perfDate(e) ? _perfDate(e).toLocaleDateString('tr-TR') : '—';
          return `<tr>
            <td>${dir}</td>
            <td class="text-truncate" style="max-width:200px;">${_esc(e.subject||'(Konu yok)')}</td>
            <td class="text-muted text-truncate" style="max-width:150px;">${_esc(who)}</td>
            <td class="text-muted">${dt}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : '<div class="text-muted text-center py-3" style="font-size:13px;">Bu dönemde e-posta yok</div>';

  if (body) body.innerHTML = `
    <!-- Stats row -->
    <div class="row g-3 mb-4">
      ${[
        { icon:'bi-send',       color:'#6366f1', label:'E-posta Gönderildi',   val: _perfFmt(u.emailsSent) },
        { icon:'bi-reply',      color:'#10b981', label:'Yanıt Oranı',           val: u.replyRate + '%' },
        { icon:'bi-file-text',  color:'#f59e0b', label:'Toplam Teklifler',      val: _perfFmt(u.quotesTotal) },
        { icon:'bi-check-circle',color:'#10b981',label:'Kazanılan Teklifler',   val: _perfFmt(u.quotesWon) },
        { icon:'bi-percent',    color:'#3b82f6', label:'Dönüşüm Oranı',         val: u.convRate + '%' },
        { icon:'bi-trophy',     color:'#f59e0b', label:'Kazanılan Ciro',         val: _perfEur(u.wonVal) },
      ].map(k=>`
        <div class="col-6 col-md-2">
          <div class="text-center p-2 rounded" style="background:#f8fafc;">
            <i class="bi ${k.icon}" style="font-size:20px;color:${k.color};"></i>
            <div class="fw-bold mt-1" style="font-size:16px;">${k.val}</div>
            <div class="text-muted" style="font-size:10px;">${k.label}</div>
          </div>
        </div>`).join('')}
    </div>

    <!-- Activity chart -->
    <div class="mb-4 p-3 rounded" style="background:#f8fafc;">
      ${chartHtml}
    </div>

    <!-- Quotes + Emails side by side -->
    <div class="row g-3">
      <div class="col-md-6">
        <div class="fw-semibold mb-2" style="font-size:13px;"><i class="bi bi-file-earmark-text text-warning me-1"></i>Son Teklifler</div>
        <div class="border rounded">${quotesHtml}</div>
      </div>
      <div class="col-md-6">
        <div class="fw-semibold mb-2" style="font-size:13px;"><i class="bi bi-envelope text-primary me-1"></i>Son E-postalar</div>
        <div class="border rounded">${emailsHtml}</div>
      </div>
    </div>`;

  bootstrap.Modal.getOrCreateInstance(document.getElementById('perfDetailModal')).show();
}

// ── Utility ───────────────────────────────────────────────────
function _esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
