// ═══════════════════════════════════════════════════════════
// LEADS + PIPELINE + CONFIDENCE SCORE ENGINE — leads.js
// Firestore collection: leads
// ═══════════════════════════════════════════════════════════

const LD_COL = 'leads';

// ── Stage config ──────────────────────────────────────────
const LD_STAGES = [
  { id: 'new',          label: 'Yeni',        color: '#64748b', bg: '#f1f5f9', icon: 'bi-star'              },
  { id: 'qualified',    label: 'Nitelikli',   color: '#2563eb', bg: '#eff6ff', icon: 'bi-check-circle'      },
  { id: 'proposal',     label: 'Teklif',      color: '#d97706', bg: '#fffbeb', icon: 'bi-file-earmark-text' },
  { id: 'negotiation',  label: 'Müzakere',    color: '#7c3aed', bg: '#f5f3ff', icon: 'bi-chat-dots'         },
  { id: 'won',          label: 'Kazanıldı',   color: '#16a34a', bg: '#f0fdf4', icon: 'bi-trophy'            },
  { id: 'lost',         label: 'Kaybedildi',  color: '#dc2626', bg: '#fef2f2', icon: 'bi-x-circle'          },
];
const LD_STAGE_MAP = Object.fromEntries(LD_STAGES.map(s => [s.id, s]));

// ── Source types for confidence scoring ──────────────────
const LD_SOURCE_SCORES = {
  manual: 95, fuarbot: 88, csv_import: 65, web_form: 75,
  email: 60, api: 70, web_research: 45, unknown: 20,
};

let leadsData     = [];
let ldView        = 'kanban';   // 'kanban' | 'table'
let ldStageFilter = 'all';
let ldSearchQ     = '';
let ldDragId      = null;

// ── Load ──────────────────────────────────────────────────
async function loadLeads() {
  const el = document.getElementById('leads-content');
  if (!el) return;
  el.innerHTML = '<div class="text-muted p-3"><i class="bi bi-hourglass-split me-2"></i>Yükleniyor…</div>';
  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId) {
    el.innerHTML = '<div class="alert alert-warning">Firebase yapılandırması eksik. Fuarbot → Ayarlar\'dan bağlantı kurun.</div>';
    return;
  }
  try {
    leadsData = await fsFetch(cfg.apiKey, cfg.projectId, LD_COL);
    leadsData.sort((a, b) => (b.createdAt || '') > (a.createdAt || '') ? 1 : -1);
    renderLeads();
  } catch(e) {
    el.innerHTML = `<div class="alert alert-danger">Leads yüklenemedi: ${e.message}</div>`;
  }
}

function renderLeads() {
  const el = document.getElementById('leads-content');
  if (!el) return;
  const filtered = ldFiltered();

  // KPI cards
  const byStage = s => leadsData.filter(l => l.stage === s).length;
  const won  = byStage('won');
  const total = leadsData.length;
  const totalVal = leadsData.filter(l => l.stage !== 'lost')
    .reduce((s, l) => s + Number(l.expectedValue || 0), 0);
  const winRate = total ? Math.round((won / total) * 100) : 0;
  const avgConf = leadsData.length
    ? Math.round(leadsData.reduce((s, l) => s + (l._conf?.score || 0), 0) / leadsData.length)
    : 0;

  el.innerHTML = `
    <!-- KPIs -->
    <div class="d-flex gap-3 mb-3 flex-wrap">
      <div class="fbd-kpi-card fbd-kpi-blue" style="flex:1;min-width:130px;padding:12px 16px;">
        <div class="fbd-kpi-val">${leadsData.length}</div>
        <div class="fbd-kpi-lbl">Toplam Lead</div>
      </div>
      <div class="fbd-kpi-card fbd-kpi-green" style="flex:1;min-width:130px;padding:12px 16px;">
        <div class="fbd-kpi-val">${won}</div>
        <div class="fbd-kpi-lbl">Kazanılan</div>
      </div>
      <div class="fbd-kpi-card fbd-kpi-amber" style="flex:1;min-width:130px;padding:12px 16px;">
        <div class="fbd-kpi-val">${totalVal.toLocaleString('de-DE',{maximumFractionDigits:0})} €</div>
        <div class="fbd-kpi-lbl">Pipeline Değeri</div>
      </div>
      <div class="fbd-kpi-card fbd-kpi-blue" style="flex:1;min-width:130px;padding:12px 16px;">
        <div class="fbd-kpi-val">${winRate}%</div>
        <div class="fbd-kpi-lbl">Kazanma Oranı</div>
      </div>
      <div class="fbd-kpi-card" style="flex:1;min-width:130px;padding:12px 16px;background:${avgConf>=75?'#f0fdf4':avgConf>=45?'#fffbeb':'#fef2f2'};">
        <div class="fbd-kpi-val" style="color:${avgConf>=75?'#16a34a':avgConf>=45?'#d97706':'#dc2626'}">${avgConf}</div>
        <div class="fbd-kpi-lbl">Ort. Güven Skoru</div>
      </div>
    </div>

    <!-- View toggle + filters -->
    <div class="d-flex align-items-center gap-2 mb-3 flex-wrap">
      <div class="btn-group btn-group-sm me-2">
        <button class="btn ${ldView==='kanban'?'btn-primary':'btn-outline-secondary'}" onclick="ldSwitchView('kanban')">
          <i class="bi bi-kanban me-1"></i>Kanban
        </button>
        <button class="btn ${ldView==='table'?'btn-primary':'btn-outline-secondary'}" onclick="ldSwitchView('table')">
          <i class="bi bi-table me-1"></i>Liste
        </button>
      </div>
      <div class="fbd-filter-bar" style="flex-wrap:wrap;gap:4px;">
        <button class="fbd-filter-btn ${ldStageFilter==='all'?'active':''}" onclick="ldSetFilter('all')">Tümü (${leadsData.length})</button>
        ${LD_STAGES.map(s => `<button class="fbd-filter-btn ${ldStageFilter===s.id?'active':''}" onclick="ldSetFilter('${s.id}')" style="${ldStageFilter===s.id?`background:${s.color};border-color:${s.color};color:#fff;`:''}"><i class="bi ${s.icon} me-1"></i>${s.label} (${byStage(s.id)})</button>`).join('')}
      </div>
      <div class="ms-auto">
        <input type="text" class="form-control form-control-sm" style="width:220px;" placeholder="Lead ara…" value="${esc(ldSearchQ)}" oninput="ldSearch(this.value)">
      </div>
    </div>

    <div id="ld-view-area"></div>
  `;

  if (ldView === 'kanban') _renderKanban(filtered);
  else                     _renderTable(filtered);
}

function _renderKanban(filtered) {
  const area = document.getElementById('ld-view-area');
  if (!area) return;

  const stagesToShow = ldStageFilter === 'all'
    ? LD_STAGES
    : LD_STAGES.filter(s => s.id === ldStageFilter);

  area.innerHTML = `
    <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:12px;align-items:flex-start;">
      ${stagesToShow.map(s => {
        const cards = filtered.filter(l => l.stage === s.id);
        return `
          <div class="ld-col" data-stage="${s.id}"
            ondragover="event.preventDefault();this.classList.add('ld-col-over')"
            ondragleave="this.classList.remove('ld-col-over')"
            ondrop="ldDrop(event,'${s.id}')"
            style="min-width:230px;max-width:260px;flex-shrink:0;">
            <div class="ld-col-header" style="background:${s.bg};border-left:3px solid ${s.color};padding:8px 10px;border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:13px;font-weight:600;color:${s.color};"><i class="bi ${s.icon} me-1"></i>${s.label}</span>
              <span class="badge" style="background:${s.color};color:#fff;font-size:10px;">${cards.length}</span>
            </div>
            <div class="ld-col-body" style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;min-height:80px;padding:8px;display:flex;flex-direction:column;gap:6px;"
              id="ld-col-${s.id}">
              ${cards.map(l => ldCard(l)).join('')}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function ldCard(l) {
  const conf   = l._conf || ldCalcConf(l);
  const confColor = conf.score >= 75 ? '#16a34a' : conf.score >= 45 ? '#d97706' : '#dc2626';
  const confBg    = conf.score >= 75 ? '#f0fdf4'  : conf.score >= 45 ? '#fffbeb'  : '#fef2f2';
  const name   = [l.firstName, l.lastName].filter(Boolean).join(' ') || l.company || '—';
  const val    = l.expectedValue ? `<span class="badge bg-light text-dark border" style="font-size:10px;">${Number(l.expectedValue).toLocaleString('de-DE')} ${l.currency||'€'}</span>` : '';
  const src    = l.sourceType ? `<span class="badge bg-secondary-subtle text-secondary border" style="font-size:9px;">${ldSourceLabel(l.sourceType)}</span>` : '';
  return `
    <div class="ld-card" draggable="true"
      ondragstart="ldDragStart(event,'${esc(l._id)}')"
      ondragend="document.querySelectorAll('.ld-col-over').forEach(c=>c.classList.remove('ld-col-over'))"
      onclick="ldOpenDetail('${esc(l._id)}')"
      style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px 11px;cursor:pointer;transition:box-shadow 0.15s;"
      onmouseover="this.style.boxShadow='0 2px 10px rgba(0,0,0,0.1)'" onmouseout="this.style.boxShadow=''">
      <div class="d-flex justify-content-between align-items-start mb-1">
        <div class="fw-semibold" style="font-size:13px;line-height:1.3;">${esc(name)}</div>
        <div class="d-flex align-items-center gap-1">
          <span style="font-size:11px;font-weight:700;color:${confColor};background:${confBg};padding:1px 5px;border-radius:4px;">${conf.score}</span>
          <button class="btn btn-link p-0" style="font-size:12px;line-height:1;" onclick="event.stopPropagation();ldEdit('${esc(l._id)}')"><i class="bi bi-pencil text-muted"></i></button>
        </div>
      </div>
      ${l.company ? `<div class="text-muted" style="font-size:11px;"><i class="bi bi-building me-1"></i>${esc(l.company)}</div>` : ''}
      ${l.email   ? `<div class="text-muted" style="font-size:11px;"><i class="bi bi-envelope me-1"></i>${esc(l.email)}</div>` : ''}
      <div class="d-flex align-items-center gap-1 mt-2 flex-wrap">${val}${src}</div>
    </div>`;
}

function _renderTable(filtered) {
  const area = document.getElementById('ld-view-area');
  if (!area) return;
  if (!filtered.length) {
    area.innerHTML = '<div class="text-muted p-3 text-center">Lead bulunamadı.</div>';
    return;
  }
  area.innerHTML = `
    <div class="card">
      <div class="table-responsive">
        <table class="table table-hover mb-0" style="font-size:13px;">
          <thead class="table-light">
            <tr>
              <th>Ad / Firma</th><th>E-posta</th><th>Aşama</th>
              <th>Kaynak</th><th>Güven</th><th>Beklenen</th><th>Tarih</th><th style="width:80px;"></th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(l => {
              const conf = l._conf || ldCalcConf(l);
              const s    = LD_STAGE_MAP[l.stage] || LD_STAGES[0];
              const name = [l.firstName, l.lastName].filter(Boolean).join(' ') || '—';
              const d    = l.createdAt ? new Date(l.createdAt).toLocaleDateString('tr-TR') : '—';
              return `<tr>
                <td><div class="fw-semibold">${esc(name)}</div><div class="text-muted" style="font-size:11px;">${esc(l.company||'')}</div></td>
                <td>${esc(l.email||'—')}</td>
                <td><span class="badge" style="background:${s.bg};color:${s.color};border:1px solid ${s.color}40;">${s.label}</span></td>
                <td><span class="badge bg-secondary-subtle text-secondary border" style="font-size:10px;">${ldSourceLabel(l.sourceType)}</span></td>
                <td>${ldConfBadge(conf)}</td>
                <td class="fw-semibold">${l.expectedValue ? Number(l.expectedValue).toLocaleString('de-DE') + ' ' + (l.currency||'€') : '—'}</td>
                <td class="text-muted">${d}</td>
                <td>
                  <button class="btn btn-sm btn-outline-primary me-1" onclick="ldOpenDetail('${esc(l._id)}')"><i class="bi bi-eye-fill"></i></button>
                  <button class="btn btn-sm btn-outline-warning" onclick="ldEdit('${esc(l._id)}')"><i class="bi bi-pencil-fill"></i></button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function ldConfBadge(conf) {
  const color = conf.score >= 75 ? '#16a34a' : conf.score >= 45 ? '#d97706' : '#dc2626';
  const bg    = conf.score >= 75 ? '#f0fdf4'  : conf.score >= 45 ? '#fffbeb'  : '#fef2f2';
  const label = conf.score >= 75 ? 'Yüksek' : conf.score >= 45 ? 'Orta' : 'Düşük';
  return `<span style="font-size:11px;font-weight:700;color:${color};background:${bg};padding:2px 7px;border-radius:4px;" title="${ldConfTooltip(conf)}">${conf.score} ${label}</span>`;
}
function ldConfTooltip(conf) {
  const b = conf.breakdown || {};
  return `Tamamlık:${b.completeness||0} | Kaynak:${b.source||0} | Tazelik:${b.recency||0} | Aktivite:${b.activity||0}`;
}

// ── Confidence Score Engine ───────────────────────────────
function ldCalcConf(record) {
  // 1. Field completeness (max 40 pts)
  const importantFields = ['firstName','lastName','email','phone','company','country','city'];
  const filled = importantFields.filter(f => record[f] && String(record[f]).trim()).length;
  const completeness = Math.round((filled / importantFields.length) * 40);

  // 2. Source quality (max 30 pts)
  const srcScore = LD_SOURCE_SCORES[record.sourceType] || 20;
  const source   = Math.round((srcScore / 100) * 30);

  // 3. Recency (max 20 pts)
  let recency = 10;
  if (record.createdAt || record.updatedAt) {
    const dt = new Date(record.updatedAt || record.createdAt);
    const days = (Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24);
    recency = days < 7 ? 20 : days < 30 ? 16 : days < 90 ? 12 : days < 180 ? 8 : 4;
  }

  // 4. Activity / engagement (max 10 pts)
  const activity = (record.notes && record.notes.trim()) ? 8 : 0;

  const score = Math.min(100, completeness + source + recency + activity);
  return { score, breakdown: { completeness, source, recency, activity } };
}

// Attach confidence to every lead in-memory
function ldEnrichConf(leads) {
  return leads.map(l => ({ ...l, _conf: ldCalcConf(l) }));
}

// ── Filters ───────────────────────────────────────────────
function ldFiltered() {
  return ldEnrichConf(leadsData).filter(l => {
    if (ldStageFilter !== 'all' && l.stage !== ldStageFilter) return false;
    if (ldSearchQ) {
      const hay = [l.firstName,l.lastName,l.company,l.email,l.phone].join(' ').toLowerCase();
      if (!hay.includes(ldSearchQ.toLowerCase())) return false;
    }
    return true;
  });
}
function ldSetFilter(f) { ldStageFilter = f; renderLeads(); }
function ldSearch(q)    { ldSearchQ = q;      renderLeads(); }
function ldSwitchView(v){ ldView = v;          renderLeads(); }

// ── Source label ──────────────────────────────────────────
function ldSourceLabel(s) {
  const map = { manual:'Manuel', fuarbot:'Fuarbot', csv_import:'CSV Import',
    web_form:'Web Form', email:'E-posta', api:'API', web_research:'Web Araştırma', unknown:'Bilinmiyor' };
  return map[s] || s || 'Bilinmiyor';
}

// ── Drag & Drop ───────────────────────────────────────────
function ldDragStart(e, id) {
  ldDragId = id;
  e.dataTransfer.effectAllowed = 'move';
}
async function ldDrop(e, stage) {
  e.preventDefault();
  e.currentTarget.classList.remove('ld-col-over');
  if (!ldDragId) return;
  const lead = leadsData.find(l => l._id === ldDragId);
  if (!lead || lead.stage === stage) { ldDragId = null; return; }
  await ldUpdateStage(ldDragId, stage);
  ldDragId = null;
}
async function ldUpdateStage(id, stage) {
  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId) return;
  const now = new Date().toISOString();
  try {
    await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${LD_COL}/${id}?key=${cfg.apiKey}&updateMask.fieldPaths=stage&updateMask.fieldPaths=updatedAt`,
      { method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ fields: { stage:{stringValue:stage}, updatedAt:{stringValue:now} } }) }
    );
    const idx = leadsData.findIndex(l => l._id === id);
    if (idx >= 0) { leadsData[idx].stage = stage; leadsData[idx].updatedAt = now; }
    renderLeads();
    toast(`✓ Aşama güncellendi: ${LD_STAGE_MAP[stage]?.label || stage}`, 'success');
  } catch(e) { toast('Hata: ' + e.message, 'error'); }
}

// ── Detail modal ──────────────────────────────────────────
function ldOpenDetail(id) {
  const l = leadsData.find(x => x._id === id);
  if (!l) return;
  const conf = ldCalcConf(l);
  const s    = LD_STAGE_MAP[l.stage] || LD_STAGES[0];
  const name = [l.firstName, l.lastName].filter(Boolean).join(' ') || l.company || '—';
  const d    = l.createdAt ? new Date(l.createdAt).toLocaleDateString('tr-TR') : '—';

  document.getElementById('ld-detail-title').textContent = name;
  document.getElementById('ld-detail-body').innerHTML = `
    <div class="row g-3 mb-3">
      <div class="col-md-6">
        <div class="card bg-light border-0 p-3">
          <div class="fw-semibold small text-muted text-uppercase mb-2">İletişim</div>
          <div class="fw-bold fs-6">${esc(name)}</div>
          ${l.company   ? `<div><i class="bi bi-building me-1 text-muted"></i>${esc(l.company)}</div>` : ''}
          ${l.email     ? `<div><i class="bi bi-envelope me-1 text-muted"></i><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></div>` : ''}
          ${l.phone     ? `<div><i class="bi bi-telephone me-1 text-muted"></i>${esc(l.phone)}</div>` : ''}
          ${l.country   ? `<div><i class="bi bi-globe me-1 text-muted"></i>${esc(l.country)}${l.city ? ', ' + esc(l.city) : ''}</div>` : ''}
          ${l.website   ? `<div><i class="bi bi-link-45deg me-1 text-muted"></i><a href="${esc(l.website)}" target="_blank" rel="noopener">${esc(l.website)}</a></div>` : ''}
        </div>
      </div>
      <div class="col-md-6">
        <div class="card bg-light border-0 p-3">
          <div class="fw-semibold small text-muted text-uppercase mb-2">Pipeline</div>
          <div><span class="badge fs-6" style="background:${s.bg};color:${s.color};border:1px solid ${s.color}40;font-size:12px!important;"><i class="bi ${s.icon} me-1"></i>${s.label}</span></div>
          <div class="mt-2"><span class="text-muted small">Kaynak:</span> <strong>${ldSourceLabel(l.sourceType)}</strong></div>
          ${l.expectedValue ? `<div><span class="text-muted small">Beklenen:</span> <strong>${Number(l.expectedValue).toLocaleString('de-DE')} ${l.currency||'EUR'}</strong></div>` : ''}
          ${l.expectedCloseDate ? `<div><span class="text-muted small">Tahmini Kapanış:</span> <strong>${l.expectedCloseDate}</strong></div>` : ''}
          <div><span class="text-muted small">Oluşturulma:</span> ${d}</div>
          <div><span class="text-muted small">Atanan:</span> ${esc(l.assignedTo || '—')}</div>
        </div>
      </div>
    </div>

    <!-- Confidence Score -->
    <div class="card border-0 mb-3 p-3" style="background:${conf.score>=75?'#f0fdf4':conf.score>=45?'#fffbeb':'#fef2f2'};">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <div class="fw-semibold small text-muted text-uppercase">Güven Skoru</div>
        <span style="font-size:22px;font-weight:800;color:${conf.score>=75?'#16a34a':conf.score>=45?'#d97706':'#dc2626'};">${conf.score}<span style="font-size:13px;font-weight:400;">/100</span></span>
      </div>
      ${ldConfBar('Tamamlık',  conf.breakdown.completeness, 40, '#2563eb')}
      ${ldConfBar('Kaynak',    conf.breakdown.source,       30, '#7c3aed')}
      ${ldConfBar('Tazelik',   conf.breakdown.recency,      20, '#0891b2')}
      ${ldConfBar('Aktivite',  conf.breakdown.activity,     10, '#16a34a')}
      <div class="text-muted mt-2" style="font-size:11px;">Skor = Tamamlık(40) + Kaynak(30) + Tazelik(20) + Aktivite(10)</div>
    </div>

    ${l.productInterest ? `<div class="mb-3"><span class="text-muted small">Ürün İlgisi:</span> <strong>${esc(l.productInterest)}</strong></div>` : ''}
    ${l.notes ? `<div class="card border-0 bg-light p-3"><div class="fw-semibold small text-muted text-uppercase mb-1">Notlar</div><div style="white-space:pre-wrap;font-size:13px;">${esc(l.notes)}</div></div>` : ''}

    <!-- Stage change -->
    <div class="mt-3">
      <label class="form-label small text-muted fw-semibold text-uppercase">Aşama Değiştir</label>
      <div class="d-flex gap-2 flex-wrap">
        ${LD_STAGES.map(st => `<button class="btn btn-sm ${l.stage===st.id?'btn-primary':'btn-outline-secondary'}"
          onclick="ldUpdateStageFromDetail('${id}','${st.id}')" style="${l.stage===st.id?`background:${st.color};border-color:${st.color};`:''}">${st.label}</button>`).join('')}
      </div>
    </div>
  `;

  document.getElementById('ld-detail-footer').innerHTML = `
    <button class="btn btn-outline-warning btn-sm" onclick="ldEdit('${id}');bootstrap.Modal.getInstance(document.getElementById('leadDetailModal'))?.hide()"><i class="bi bi-pencil me-1"></i>Düzenle</button>
    <button class="btn btn-success btn-sm" onclick="ldConvertToContact('${id}');bootstrap.Modal.getInstance(document.getElementById('leadDetailModal'))?.hide()"><i class="bi bi-person-check me-1"></i>Kişiye Dönüştür</button>
    <button class="btn btn-outline-danger btn-sm" onclick="ldDelete('${id}');bootstrap.Modal.getInstance(document.getElementById('leadDetailModal'))?.hide()"><i class="bi bi-trash me-1"></i>Sil</button>
    <button class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Kapat</button>
  `;

  new bootstrap.Modal(document.getElementById('leadDetailModal')).show();
}

function ldConfBar(label, val, max, color) {
  const pct = Math.round((val / max) * 100);
  return `<div class="mb-1">
    <div class="d-flex justify-content-between" style="font-size:11px;">
      <span class="text-muted">${label}</span>
      <span class="fw-semibold">${val}/${max}</span>
    </div>
    <div style="height:5px;background:#e2e8f0;border-radius:3px;overflow:hidden;">
      <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width 0.3s;"></div>
    </div>
  </div>`;
}

async function ldUpdateStageFromDetail(id, stage) {
  await ldUpdateStage(id, stage);
  ldOpenDetail(id); // refresh modal
}

// ── Create / Edit ─────────────────────────────────────────
function ldNew() {
  _ldOpenModal(null);
}
function ldEdit(id) {
  _ldOpenModal(leadsData.find(l => l._id === id));
}
function _ldOpenModal(lead) {
  const isEdit = !!lead;
  document.getElementById('ld-modal-title').textContent = isEdit ? 'Lead Düzenle' : 'Yeni Lead';

  const f = id => document.getElementById(id);
  f('ld-f-fname').value        = lead?.firstName       || '';
  f('ld-f-lname').value        = lead?.lastName        || '';
  f('ld-f-company').value      = lead?.company         || '';
  f('ld-f-email').value        = lead?.email           || '';
  f('ld-f-phone').value        = lead?.phone           || '';
  f('ld-f-country').value      = lead?.country         || '';
  f('ld-f-city').value         = lead?.city            || '';
  f('ld-f-website').value      = lead?.website         || '';
  f('ld-f-stage').value        = lead?.stage           || 'new';
  f('ld-f-source').value       = lead?.sourceType      || 'manual';
  f('ld-f-value').value        = lead?.expectedValue   || '';
  f('ld-f-currency').value     = lead?.currency        || 'EUR';
  f('ld-f-close-date').value   = lead?.expectedCloseDate || '';
  f('ld-f-assigned').value     = lead?.assignedTo      || '';
  f('ld-f-product').value      = lead?.productInterest || '';
  f('ld-f-sector').value       = lead?.sector          || '';
  f('ld-f-notes').value        = lead?.notes           || '';
  f('ld-f-id').value           = lead?._id             || '';

  // Show live confidence preview
  _ldConfPreview();

  new bootstrap.Modal(document.getElementById('leadEditModal')).show();
}

function _ldConfPreview() {
  const get = id => (document.getElementById(id)?.value || '').trim();
  const fake = {
    firstName: get('ld-f-fname'), lastName: get('ld-f-lname'),
    email: get('ld-f-email'), phone: get('ld-f-phone'),
    company: get('ld-f-company'), country: get('ld-f-country'), city: get('ld-f-city'),
    sourceType: get('ld-f-source'), notes: get('ld-f-notes'),
    createdAt: new Date().toISOString(),
  };
  const conf = ldCalcConf(fake);
  const el   = document.getElementById('ld-conf-preview');
  if (!el) return;
  const color = conf.score >= 75 ? '#16a34a' : conf.score >= 45 ? '#d97706' : '#dc2626';
  const bg    = conf.score >= 75 ? '#f0fdf4'  : conf.score >= 45 ? '#fffbeb'  : '#fef2f2';
  el.innerHTML = `<span style="font-weight:700;color:${color};background:${bg};padding:3px 10px;border-radius:6px;font-size:13px;">Güven Skoru: ${conf.score}/100</span>
    <span class="text-muted ms-2" style="font-size:11px;">Tamamlık ${conf.breakdown.completeness}/40 · Kaynak ${conf.breakdown.source}/30 · Tazelik ${conf.breakdown.recency}/20</span>`;
}

async function ldSave() {
  const get = id => (document.getElementById(id)?.value || '').trim();
  const id  = get('ld-f-id');
  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId) { toast('Firebase yapılandırması eksik.', 'error'); return; }

  const now = new Date().toISOString();
  const data = {
    firstName: get('ld-f-fname'), lastName: get('ld-f-lname'),
    company: get('ld-f-company'), email: get('ld-f-email'),
    phone: get('ld-f-phone'), country: get('ld-f-country'),
    city: get('ld-f-city'), website: get('ld-f-website'),
    stage: get('ld-f-stage') || 'new',
    sourceType: get('ld-f-source') || 'manual',
    expectedValue: parseFloat(get('ld-f-value')) || 0,
    currency: get('ld-f-currency') || 'EUR',
    expectedCloseDate: get('ld-f-close-date'),
    assignedTo: get('ld-f-assigned'),
    productInterest: get('ld-f-product'),
    sector: get('ld-f-sector'),
    notes: get('ld-f-notes'),
    updatedAt: now,
  };

  const toStr = v => ({ stringValue: String(v ?? '') });
  const toNum = v => ({ doubleValue: Number(v  ?? 0) });
  const fields = {
    firstName:         toStr(data.firstName),
    lastName:          toStr(data.lastName),
    company:           toStr(data.company),
    email:             toStr(data.email),
    phone:             toStr(data.phone),
    country:           toStr(data.country),
    city:              toStr(data.city),
    website:           toStr(data.website),
    stage:             toStr(data.stage),
    sourceType:        toStr(data.sourceType),
    expectedValue:     toNum(data.expectedValue),
    currency:          toStr(data.currency),
    expectedCloseDate: toStr(data.expectedCloseDate),
    assignedTo:        toStr(data.assignedTo),
    productInterest:   toStr(data.productInterest),
    sector:            toStr(data.sector),
    notes:             toStr(data.notes),
    updatedAt:         toStr(now),
  };

  const base = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${LD_COL}`;

  try {
    if (id) {
      // PATCH
      await fetch(`${base}/${id}?key=${cfg.apiKey}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ fields }),
      });
      const idx = leadsData.findIndex(l => l._id === id);
      if (idx >= 0) leadsData[idx] = { _id: id, ...data };
      toast('✓ Lead güncellendi', 'success');
    } else {
      // POST
      fields.createdAt = toStr(now);
      const res  = await fetch(`${base}?key=${cfg.apiKey}`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message||'HTTP '+res.status); }
      const doc  = await res.json();
      const docId = doc.name?.split('/').pop() || ('ld_'+Date.now());
      leadsData.unshift({ _id: docId, ...data, createdAt: now });
      toast('✓ Yeni lead eklendi', 'success');
    }
    bootstrap.Modal.getInstance(document.getElementById('leadEditModal'))?.hide();
    renderLeads();
  } catch(e) { toast('Hata: ' + e.message, 'error'); }
}

async function ldDelete(id) {
  const l = leadsData.find(x => x._id === id);
  if (!confirm(`"${[l?.firstName, l?.lastName].filter(Boolean).join(' ') || l?.company || id}" leadini silmek istediğinize emin misiniz?`)) return;
  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId) return;
  try {
    await fetch(`https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${LD_COL}/${id}?key=${cfg.apiKey}`, { method:'DELETE' });
    leadsData = leadsData.filter(x => x._id !== id);
    toast('✓ Lead silindi', 'success');
    renderLeads();
  } catch(e) { toast('Hata: ' + e.message, 'error'); }
}

// ── Convert Lead → Contact ────────────────────────────────
async function ldConvertToContact(id) {
  const l = leadsData.find(x => x._id === id);
  if (!l) return;
  const name = [l.firstName, l.lastName].filter(Boolean).join(' ') || l.company || 'Lead';
  if (!confirm(`"${name}" kişiye dönüştürülsün mu? Lead aşaması "Kazanıldı" olarak güncellenecek.`)) return;

  // Update lead stage to won
  await ldUpdateStage(id, 'won');

  // Pre-fill the add-contact form if it exists (app.js integration)
  if (typeof showPage === 'function') {
    try {
      showPage('add-contact');
      setTimeout(() => {
        const sf = (fid, v) => { const el = document.getElementById(fid); if (el && v) el.value = v; };
        sf('contact-first-name', l.firstName);
        sf('contact-last-name',  l.lastName);
        sf('contact-email',      l.email);
        sf('contact-phone',      l.phone);
        sf('contact-company',    l.company);
        sf('contact-country',    l.country);
        sf('contact-city',       l.city);
        sf('contact-notes',      `Lead'den dönüştürüldü: ${l.notes || ''}`);
        toast('✓ Kişi formu lead bilgileriyle dolduruldu', 'success');
      }, 300);
    } catch { /* ignore */ }
  }
}

// ── CSS injection for kanban ──────────────────────────────
(function injectLeadCSS() {
  if (document.getElementById('ld-css')) return;
  const s = document.createElement('style');
  s.id = 'ld-css';
  s.textContent = `
    .ld-col-over { outline: 2px dashed #1a56db !important; outline-offset: -2px; }
    .ld-card:active { opacity: 0.7; }
    .ld-card[draggable=true] { user-select: none; }
  `;
  document.head.appendChild(s);
})();
