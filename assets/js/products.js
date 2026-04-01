// ══════════════════════════════════════════════════════════════
// ÜRÜNLER  (Products catalog + CSV import)
// ══════════════════════════════════════════════════════════════
const PR_COL       = 'products';
const UR_COL       = 'production_entries';
const PR_PAGE_SIZE = 50;              // rows per page
const PR_SWR_KEY   = '_wf_swr_products';
const PR_SWR_TTL   = 10 * 60 * 1000; // 10 min cache

let prProducts   = [];   // all products
let prFiltered   = [];   // after search/filter
let prPage       = 0;    // current page index
let prCatFilter  = '';
let prSearchQ    = '';
let _csvParsed   = [];   // CSV preview buffer

// ── Simple SWR helpers (localStorage) ───────────────────────
function _prSwrGet() {
  try {
    const raw = localStorage.getItem(PR_SWR_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > PR_SWR_TTL * 3) { localStorage.removeItem(PR_SWR_KEY); return null; }
    return data;
  } catch { return null; }
}
function _prSwrSet(data) {
  try { localStorage.setItem(PR_SWR_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
}
function _prSwrInvalidate() {
  try { localStorage.removeItem(PR_SWR_KEY); } catch {}
}

// ── Load & Render ──────────────────────────────────────────────
async function loadProducts() {
  const cfg = loadFbConfig();
  const el  = document.getElementById('urunler-content');
  if (!cfg?.apiKey || !cfg?.projectId) {
    el.innerHTML = `<div class="alert alert-warning"><i class="bi bi-exclamation-triangle me-2"></i>Önce Fuarbot Sync sayfasında Firebase bağlantısını kurun.</div>`;
    return;
  }

  // Show cached data instantly (SWR)
  const cached = _prSwrGet();
  if (cached) {
    prProducts = cached;
    prProducts.sort((a,b) => (a.sku||'').localeCompare(b.sku||''));
    _prRefreshCategoryDropdown();
    prPage = 0;
    prApplyFilters();
  } else {
    el.innerHTML = '<div class="text-muted p-3"><span class="spinner-border spinner-border-sm me-2"></span>Ürünler yükleniyor…</div>';
  }

  // Always fetch fresh in background
  try {
    const fresh = await fsFetch(cfg.apiKey, cfg.projectId, PR_COL);
    fresh.sort((a,b) => (a.sku||'').localeCompare(b.sku||''));
    _prSwrSet(fresh);
    prProducts = fresh;
    _prRefreshCategoryDropdown();
    prPage = 0;
    prApplyFilters();
  } catch(e) {
    if (!cached) el.innerHTML = `<div class="alert alert-danger">Hata: ${esc(e.message)}</div>`;
  }
}

function _prRefreshCategoryDropdown() {
  const cats = [...new Set(prProducts.map(p => p.category||'').filter(Boolean))].sort();
  const sel  = document.getElementById('pr-cat-filter');
  if (!sel) return;
  const cur  = sel.value;
  sel.innerHTML = '<option value="">Tüm Kategoriler</option>' + cats.map(c => `<option value="${esc(c)}"${c===cur?' selected':''}>${esc(c)}</option>`).join('');
  // Also fill datalist for product modal
  const dl = document.getElementById('pr-cat-list');
  if (dl) dl.innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');
}

function prSetCategory(cat) { prCatFilter = cat; prPage = 0; prApplyFilters(); }
function prSearch(q)        { prSearchQ   = q.toLowerCase().trim(); prPage = 0; prApplyFilters(); }
function prGoPage(n)        { prPage = n; renderProducts(); }

function prApplyFilters() {
  prFiltered = prProducts.filter(p => {
    if (prCatFilter && (p.category||'') !== prCatFilter) return false;
    if (prSearchQ) {
      const h = [p.sku, p.name, p.category].join(' ').toLowerCase();
      if (!h.includes(prSearchQ)) return false;
    }
    return true;
  });
  renderProducts();
}

function renderProducts() {
  const el = document.getElementById('urunler-content');

  const totalVal  = prProducts.reduce((s,p) => s + (Number(p.priceNet||0) * Number(p.stock||0)), 0);
  const lowStock  = prProducts.filter(p => Number(p.stock||0) <= Number(p.minStock||5) && Number(p.stock||0) > 0).length;
  const zeroStock = prProducts.filter(p => Number(p.stock||0) <= 0).length;

  if (!prProducts.length) {
    el.innerHTML = `<div class="alert alert-info"><i class="bi bi-info-circle me-2"></i>Henüz ürün eklenmemiş. <strong>Ürün Ekle</strong> veya <strong>CSV İçe Aktar</strong> butonunu kullanın.</div>`;
    return;
  }

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(prFiltered.length / PR_PAGE_SIZE));
  if (prPage >= totalPages) prPage = totalPages - 1;
  const pageStart  = prPage * PR_PAGE_SIZE;
  const pageRows   = prFiltered.slice(pageStart, pageStart + PR_PAGE_SIZE);

  // Pagination controls
  const paginationHtml = totalPages <= 1 ? '' : `
    <div class="d-flex align-items-center gap-2 px-3 py-2 border-top">
      <button class="btn btn-sm btn-outline-secondary" onclick="prGoPage(${prPage-1})" ${prPage===0?'disabled':''}>‹</button>
      <span class="text-muted small">Seite ${prPage+1} / ${totalPages} · ${prFiltered.length} Ergebnisse</span>
      <button class="btn btn-sm btn-outline-secondary" onclick="prGoPage(${prPage+1})" ${prPage>=totalPages-1?'disabled':''}>›</button>
      ${totalPages > 5 ? `
        <div class="ms-2 d-flex gap-1">
          ${[...Array(Math.min(totalPages,7))].map((_,i) => {
            const pg = totalPages <= 7 ? i : (prPage < 4 ? i : (prPage > totalPages-5 ? totalPages-7+i : prPage-3+i));
            return pg>=0 && pg<totalPages ? `<button class="btn btn-sm ${pg===prPage?'btn-primary':'btn-outline-secondary'}" onclick="prGoPage(${pg})">${pg+1}</button>` : '';
          }).join('')}
        </div>` : ''}
    </div>`;

  el.innerHTML = `
    <div class="d-flex gap-3 mb-3 flex-wrap">
      <div class="fbd-kpi-card fbd-kpi-blue" style="flex:1;min-width:130px;padding:12px 16px;">
        <div class="fbd-kpi-val">${prProducts.length}</div>
        <div class="fbd-kpi-lbl">Toplam Ürün</div>
      </div>
      <div class="fbd-kpi-card fbd-kpi-green" style="flex:1;min-width:130px;padding:12px 16px;">
        <div class="fbd-kpi-val">${totalVal.toLocaleString('de-DE',{maximumFractionDigits:0})} €</div>
        <div class="fbd-kpi-lbl">Stok Değeri (VK)</div>
      </div>
      <div class="fbd-kpi-card fbd-kpi-amber" style="flex:1;min-width:130px;padding:12px 16px;">
        <div class="fbd-kpi-val">${lowStock}</div>
        <div class="fbd-kpi-lbl">Düşük Stok</div>
      </div>
      <div class="fbd-kpi-card fbd-kpi-purple" style="flex:1;min-width:130px;padding:12px 16px;">
        <div class="fbd-kpi-val">${zeroStock}</div>
        <div class="fbd-kpi-lbl">Stok Yok</div>
      </div>
    </div>
    <div class="card">
      <div class="card-header py-2 px-3 d-flex align-items-center justify-content-between">
        <span class="text-muted small">${pageStart+1}–${Math.min(pageStart+PR_PAGE_SIZE, prFiltered.length)} / ${prFiltered.length} ürün (toplam ${prProducts.length})</span>
      </div>
      <div class="table-responsive">
        <table class="table table-hover mb-0" style="font-size:13px;">
          <thead class="table-light">
            <tr>
              <th>SKU</th><th>Modell / Ad</th><th>Kategori</th>
              <th class="text-end">VK (€)</th><th class="text-end">EK (€)</th>
              <th class="text-end">Stok</th><th>Birim</th>
              <th style="width:110px;"></th>
            </tr>
          </thead>
          <tbody>
            ${pageRows.map(p => prRenderRow(p)).join('')}
          </tbody>
        </table>
      </div>
      ${paginationHtml}
    </div>`;
}

function prRenderRow(p) {
  const stock    = Number(p.stock || 0);
  const minStock = Number(p.minStock || 5);
  const stockBadge = stock <= 0
    ? `<span class="badge bg-danger">${stock}</span>`
    : stock <= minStock
      ? `<span class="badge bg-warning text-dark">${stock}</span>`
      : `<span class="badge bg-success-subtle text-success border border-success-subtle">${stock}</span>`;
  return `<tr>
    <td style="font-family:monospace;font-size:12px;" class="fw-semibold">${esc(p.sku||'—')}</td>
    <td>${esc(p.name||'—')}</td>
    <td><span class="badge bg-light text-dark border">${esc(p.category||'—')}</span></td>
    <td class="text-end">${Number(p.priceNet||0).toLocaleString('de-DE',{minimumFractionDigits:2})}</td>
    <td class="text-end text-muted">${Number(p.costPrice||0).toLocaleString('de-DE',{minimumFractionDigits:2})}</td>
    <td class="text-end">${stockBadge}</td>
    <td class="text-muted small">${esc(p.unit||'Stk.')}</td>
    <td>
      <button class="btn btn-sm btn-outline-primary me-1" onclick="editProduct('${esc(p._id)}')" title="Düzenle"><i class="bi bi-pencil-fill"></i></button>
      <button class="btn btn-sm btn-outline-danger" onclick="deleteProduct('${esc(p._id)}')" title="Sil"><i class="bi bi-trash-fill"></i></button>
    </td>
  </tr>`;
}

// ── Add / Edit ──────────────────────────────────────────────────
function openAddProduct() {
  document.getElementById('pr-edit-id').value       = '';
  document.getElementById('pr-edit-sku').value      = '';
  document.getElementById('pr-edit-name').value     = '';
  document.getElementById('pr-edit-category').value = '';
  document.getElementById('pr-edit-price').value    = '';
  document.getElementById('pr-edit-cost').value     = '';
  document.getElementById('pr-edit-unit').value     = 'Stk.';
  document.getElementById('pr-edit-stock').value    = '0';
  document.getElementById('pr-edit-minstock').value = '5';
  document.getElementById('pr-modal-title').textContent = 'Ürün Ekle';
  new bootstrap.Modal(document.getElementById('productEditModal')).show();
}

function editProduct(id) {
  const p = prProducts.find(x => x._id === id);
  if (!p) return;
  document.getElementById('pr-edit-id').value       = id;
  document.getElementById('pr-edit-sku').value      = p.sku || '';
  document.getElementById('pr-edit-name').value     = p.name || '';
  document.getElementById('pr-edit-category').value = p.category || '';
  document.getElementById('pr-edit-price').value    = p.priceNet || '';
  document.getElementById('pr-edit-cost').value     = p.costPrice || '';
  document.getElementById('pr-edit-unit').value     = p.unit || 'Stk.';
  document.getElementById('pr-edit-stock').value    = p.stock ?? 0;
  document.getElementById('pr-edit-minstock').value = p.minStock ?? 5;
  document.getElementById('pr-modal-title').textContent = 'Ürün Düzenle';
  new bootstrap.Modal(document.getElementById('productEditModal')).show();
}

async function saveProduct() {
  const id       = document.getElementById('pr-edit-id').value.trim();
  const cfg      = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId) return;

  const sku      = document.getElementById('pr-edit-sku').value.trim();
  const name     = document.getElementById('pr-edit-name').value.trim();
  const category = document.getElementById('pr-edit-category').value.trim();
  const priceNet = parseFloat(document.getElementById('pr-edit-price').value) || 0;
  const costPrice= parseFloat(document.getElementById('pr-edit-cost').value)  || 0;
  const unit     = document.getElementById('pr-edit-unit').value.trim() || 'Stk.';
  const stock    = parseInt(document.getElementById('pr-edit-stock').value)    || 0;
  const minStock = parseInt(document.getElementById('pr-edit-minstock').value) || 5;

  if (!sku || !name) { toast('SKU ve ürün adı zorunludur.', 'error'); return; }

  const now = new Date().toISOString();
  const fields = {
    sku:       { stringValue: sku },
    name:      { stringValue: name },
    category:  { stringValue: category },
    priceNet:  { doubleValue: priceNet },
    costPrice: { doubleValue: costPrice },
    unit:      { stringValue: unit },
    stock:     { integerValue: String(stock) },
    minStock:  { integerValue: String(minStock) },
    updatedAt: { stringValue: now },
  };

  const base = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${PR_COL}`;
  try {
    let res, docId = id;
    if (!id) {
      fields.createdAt = { stringValue: now };
      res = await fetch(`${base}?key=${cfg.apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
    } else {
      const mask = Object.keys(fields).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
      res = await fetch(`${base}/${id}?key=${cfg.apiKey}&${mask}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
    }
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message||'HTTP '+res.status); }
    const data = await res.json();
    if (!id) docId = data.name?.split('/').pop() || ('pr_'+Date.now());

    const obj = { _id: docId, sku, name, category, priceNet, costPrice, unit, stock, minStock };
    if (!id) { prProducts.push(obj); }
    else { const idx = prProducts.findIndex(x=>x._id===id); if (idx>=0) Object.assign(prProducts[idx], obj); }

    bootstrap.Modal.getInstance(document.getElementById('productEditModal'))?.hide();
    toast(id ? '✓ Ürün güncellendi' : '✓ Ürün eklendi', 'success');
    _prSwrInvalidate(); // cache invalidieren nach Änderung
    _prRefreshCategoryDropdown();
    prApplyFilters();
  } catch(e) { toast('Hata: '+e.message, 'error'); }
}

async function deleteProduct(id) {
  const p = prProducts.find(x => x._id === id);
  if (!confirm(`"${p?.name||id}" ürününü silmek istediğinize emin misiniz?`)) return;
  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId) return;
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${PR_COL}/${id}?key=${cfg.apiKey}`,
      { method: 'DELETE' }
    );
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message||'HTTP '+res.status); }
    prProducts = prProducts.filter(x => x._id !== id);
    _prSwrInvalidate(); // cache invalidieren nach Löschung
    toast('✓ Ürün silindi', 'success');
    prApplyFilters();
  } catch(e) { toast('Hata: '+e.message, 'error'); }
}

// ── Stock adjust (internal) ────────────────────────────────────
async function stockAdjust(productId, delta) {
  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId) return false;
  const p = prProducts.find(x => x._id === productId);
  if (!p) return false;
  const newStock = Math.max(0, Number(p.stock||0) + delta);
  const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${PR_COL}/${productId}?key=${cfg.apiKey}&updateMask.fieldPaths=stock&updateMask.fieldPaths=updatedAt`;
  try {
    const res = await fetch(url, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: {
        stock:     { integerValue: String(newStock) },
        updatedAt: { stringValue: new Date().toISOString() },
      }}),
    });
    if (!res.ok) return false;
    p.stock = newStock;
    return true;
  } catch(_) { return false; }
}

// Find product by SKU or name (for Fatura deduction)
function prFindBySku(sku) { return prProducts.find(p => (p.sku||'').toLowerCase() === (sku||'').toLowerCase()); }
function prFindByName(name) {
  const n = (name||'').toLowerCase().trim();
  return prProducts.find(p => (p.name||'').toLowerCase().trim() === n || (p.sku||'').toLowerCase().trim() === n);
}

// ══════════════════════════════════════════════════════════════
// CSV IMPORT
// ══════════════════════════════════════════════════════════════
const CSV_FIELD_MAP = {
  sku:       ['sku','artikelnummer','artnr','art.nr','article','artno','kod'],
  name:      ['name','modell','model','bezeichnung','produktname','product','ürün','ad'],
  category:  ['category','kategorie','kategori','typ','type','gruppe'],
  priceNet:  ['pricenet','vkpreis','vk','verkaufspreis','price','fiyat','netprice'],
  costPrice: ['costprice','ekpreis','ek','einkaufspreis','cost','maliyet'],
  stock:     ['stock','bestand','lager','stok','qty','menge','quantity'],
  unit:      ['unit','einheit','birim'],
  minStock:  ['minstock','mindestbestand','minbestand','alarm','minstok'],
};

function openCsvImport() {
  document.getElementById('csv-step-upload').style.display = '';
  document.getElementById('csv-step-preview').style.display = 'none';
  document.getElementById('csv-modal-footer').style.display = 'none';
  const inp = document.getElementById('csv-file-input');
  if (inp) inp.value = '';
  _csvParsed = [];
  new bootstrap.Modal(document.getElementById('csvImportModal')).show();
}

function handleCsvFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => _parseCsvText(e.target.result);
  reader.readAsText(file, 'UTF-8');
}

function _parseCsvText(text) {
  // Detect separator
  const firstLine = text.split('\n')[0] || '';
  const sep = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) { toast('CSV dosyası boş veya geçersiz.', 'error'); return; }

  const headers = lines[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g,'').toLowerCase());

  // Map headers to our fields
  const colMap = {};
  for (const [field, aliases] of Object.entries(CSV_FIELD_MAP)) {
    const idx = headers.findIndex(h => aliases.includes(h));
    colMap[field] = idx; // -1 = not found
  }

  // Parse rows
  _csvParsed = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = _splitCsvLine(lines[i], sep);
    const get   = field => colMap[field] >= 0 ? (cells[colMap[field]] || '').trim() : '';
    const row   = {
      sku:       get('sku'),
      name:      get('name'),
      category:  get('category'),
      priceNet:  parseFloat(get('priceNet').replace(',','.')) || 0,
      costPrice: parseFloat(get('costPrice').replace(',','.')) || 0,
      stock:     parseInt(get('stock')) || 0,
      unit:      get('unit') || 'Stk.',
      minStock:  parseInt(get('minStock')) || 5,
    };
    if (!row.sku && !row.name) continue; // skip empty rows
    _csvParsed.push(row);
  }

  if (!_csvParsed.length) { toast('CSV\'de geçerli satır bulunamadı.', 'error'); return; }

  // Build mapping display
  const mappingHtml = Object.entries(CSV_FIELD_MAP).map(([field, _]) => {
    const idx   = colMap[field];
    const found = idx >= 0;
    const origH = found ? headers[idx] : '—';
    return `<span class="me-3 ${found ? 'text-success' : 'text-muted'}">
      ${found ? '✓' : '○'} <strong>${field}</strong>${found ? ` ← <code>${origH}</code>` : ' (bulunamadı)'}
    </span>`;
  }).join('');

  // Preview table (first 10 rows)
  const previewRows = _csvParsed.slice(0,10).map(r =>
    `<tr><td>${esc(r.sku)}</td><td>${esc(r.name)}</td><td>${esc(r.category)}</td>
     <td class="text-end">${r.priceNet.toFixed(2)}</td><td class="text-end">${r.costPrice.toFixed(2)}</td>
     <td class="text-end">${r.stock}</td><td>${esc(r.unit)}</td></tr>`
  ).join('');

  document.getElementById('csv-preview-info').textContent = `${_csvParsed.length} ürün bulundu (ayırıcı: "${sep}")`;
  document.getElementById('csv-mapping').innerHTML = mappingHtml;
  document.getElementById('csv-preview-table').innerHTML = `
    <thead class="table-light"><tr><th>SKU</th><th>Ad</th><th>Kategori</th><th class="text-end">VK</th><th class="text-end">EK</th><th class="text-end">Stok</th><th>Birim</th></tr></thead>
    <tbody>${previewRows}</tbody>
    ${_csvParsed.length > 10 ? `<tfoot><tr><td colspan="7" class="text-muted text-center small">… ve ${_csvParsed.length-10} ürün daha</td></tr></tfoot>` : ''}`;

  document.getElementById('csv-step-upload').style.display  = 'none';
  document.getElementById('csv-step-preview').style.display = '';
  document.getElementById('csv-modal-footer').style.display = '';
}

function _splitCsvLine(line, sep) {
  const cells = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === sep && !inQ) { cells.push(cur.trim()); cur = ''; }
    else { cur += c; }
  }
  cells.push(cur.trim());
  return cells;
}

async function importCsvProducts() {
  if (!_csvParsed.length) return;
  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId) return;

  const btn = document.getElementById('csv-import-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Aktarılıyor…';

  const base = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${PR_COL}`;
  const now  = new Date().toISOString();
  let added  = 0, updated = 0, errors = 0;

  for (const row of _csvParsed) {
    // Check if SKU already exists → update, else create
    const existing = prProducts.find(p => p.sku && p.sku === row.sku);
    const fields = {
      sku:       { stringValue: row.sku },
      name:      { stringValue: row.name },
      category:  { stringValue: row.category },
      priceNet:  { doubleValue: row.priceNet },
      costPrice: { doubleValue: row.costPrice },
      stock:     { integerValue: String(row.stock) },
      unit:      { stringValue: row.unit },
      minStock:  { integerValue: String(row.minStock) },
      updatedAt: { stringValue: now },
    };
    try {
      let res, docId;
      if (existing) {
        // PATCH existing
        const mask = Object.keys(fields).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
        res = await fetch(`${base}/${existing._id}?key=${cfg.apiKey}&${mask}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields }),
        });
        if (res.ok) { Object.assign(existing, row); updated++; }
        else errors++;
      } else {
        // POST new
        fields.createdAt = { stringValue: now };
        res = await fetch(`${base}?key=${cfg.apiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields }),
        });
        if (res.ok) {
          const data = await res.json();
          docId = data.name?.split('/').pop() || ('pr_'+Date.now()+added);
          prProducts.push({ _id: docId, ...row });
          added++;
        } else errors++;
      }
    } catch(_) { errors++; }
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="bi bi-cloud-download-fill me-1"></i>İçe Aktar';
  bootstrap.Modal.getInstance(document.getElementById('csvImportModal'))?.hide();
  toast(`✓ ${added} yeni, ${updated} güncellendi${errors ? `, ${errors} hata` : ''}`, added+updated ? 'success' : 'error');
  _prRefreshCategoryDropdown();
  prApplyFilters();
}

// ══════════════════════════════════════════════════════════════
// ÜRETİM  (Production entries)
// ══════════════════════════════════════════════════════════════
let urEntries   = [];
let urFilter    = 'today';

async function loadUretim() {
  const cfg = loadFbConfig();
  const el  = document.getElementById('uretim-content');
  if (!cfg?.apiKey || !cfg?.projectId) {
    el.innerHTML = `<div class="alert alert-warning"><i class="bi bi-exclamation-triangle me-2"></i>Önce Fuarbot Sync sayfasında Firebase bağlantısını kurun.</div>`;
    return;
  }
  el.innerHTML = '<div class="text-muted p-3"><span class="spinner-border spinner-border-sm me-2"></span>Üretim verileri yükleniyor…</div>';
  try {
    urEntries = await fsFetch(cfg.apiKey, cfg.projectId, UR_COL);
    urEntries.sort((a,b) => (b.date||b.createdAt||'') > (a.date||a.createdAt||'') ? 1 : -1);
    // Also ensure products are loaded for the dropdown
    if (!prProducts.length) {
      try { prProducts = await fsFetch(cfg.apiKey, cfg.projectId, PR_COL); } catch(_) {}
    }
    renderUretim();
  } catch(e) {
    el.innerHTML = `<div class="alert alert-danger">Hata: ${esc(e.message)}</div>`;
  }
}

function urSetFilter(f) {
  urFilter = f;
  document.querySelectorAll('#ur-filter-bar .fbd-filter-btn').forEach(b => b.classList.remove('active'));
  const btns = document.querySelectorAll('#ur-filter-bar .fbd-filter-btn');
  const idx  = ['today','week','month','all'].indexOf(f);
  if (btns[idx]) btns[idx].classList.add('active');
  renderUretim();
}

function _urFilterEntries() {
  const now = new Date();
  const yy = now.getFullYear(), mm = now.getMonth(), dd = now.getDate();
  let from = null;
  if (urFilter === 'today') from = new Date(yy, mm, dd);
  else if (urFilter === 'week') { from = new Date(now); from.setDate(dd - now.getDay() + 1); from.setHours(0,0,0,0); }
  else if (urFilter === 'month') from = new Date(yy, mm, 1);
  return urEntries.filter(e => {
    if (!from) return true;
    const d = e.date ? new Date(e.date) : (e.createdAt ? new Date(e.createdAt) : null);
    return d && d >= from;
  });
}

function renderUretim() {
  const el      = document.getElementById('uretim-content');
  const entries = _urFilterEntries();

  // KPI totals
  const totalQty = entries.reduce((s,e) => s + Number(e.qty||0), 0);

  // Model breakdown
  const byModel = {};
  for (const e of entries) {
    const k = e.productName || e.productSku || '—';
    byModel[k] = (byModel[k]||0) + Number(e.qty||0);
  }
  const topModels = Object.entries(byModel).sort((a,b) => b[1]-a[1]).slice(0,8);

  // Bar chart (CSS-based)
  const maxQty = topModels[0]?.[1] || 1;
  const barsHtml = topModels.map(([name, qty]) => `
    <div class="d-flex align-items-center gap-2 mb-1" style="font-size:12px;">
      <div style="width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${esc(name)}">${esc(name)}</div>
      <div style="flex:1;background:#e9ecef;border-radius:4px;height:18px;position:relative;">
        <div style="width:${Math.round(qty/maxQty*100)}%;background:#0d6efd;border-radius:4px;height:100%;transition:width .3s;"></div>
      </div>
      <div style="width:50px;text-align:right;font-weight:600;">${qty}</div>
    </div>`).join('');

  const rowsHtml = entries.length
    ? entries.map(e => {
        const date = e.date || (e.createdAt ? e.createdAt.slice(0,10) : '—');
        return `<tr>
          <td>${date}</td>
          <td class="fw-semibold">${esc(e.productName||'—')}</td>
          <td style="font-family:monospace;font-size:12px;">${esc(e.productSku||'—')}</td>
          <td class="fw-bold text-success">${Number(e.qty||0)}</td>
          <td class="text-muted small">${esc(e.notes||'—')}</td>
          <td><button class="btn btn-sm btn-outline-danger" onclick="deleteProductionEntry('${esc(e._id)}')" title="Sil"><i class="bi bi-trash-fill"></i></button></td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="6" class="text-muted text-center p-3">Bu dönemde üretim girişi yok.</td></tr>`;

  el.innerHTML = `
    <div class="d-flex gap-3 mb-3 flex-wrap">
      <div class="fbd-kpi-card fbd-kpi-green" style="flex:1;min-width:130px;padding:12px 16px;">
        <div class="fbd-kpi-val">${totalQty.toLocaleString('de-DE')}</div>
        <div class="fbd-kpi-lbl">Üretilen Adet</div>
      </div>
      <div class="fbd-kpi-card fbd-kpi-blue" style="flex:1;min-width:130px;padding:12px 16px;">
        <div class="fbd-kpi-val">${entries.length}</div>
        <div class="fbd-kpi-lbl">Üretim Girişi</div>
      </div>
      <div class="fbd-kpi-card fbd-kpi-amber" style="flex:1;min-width:130px;padding:12px 16px;">
        <div class="fbd-kpi-val">${topModels.length}</div>
        <div class="fbd-kpi-lbl">Farklı Model</div>
      </div>
    </div>

    ${topModels.length ? `
    <div class="card mb-3">
      <div class="card-header py-2 px-3 fw-semibold small text-uppercase text-muted">Model Dağılımı</div>
      <div class="card-body py-3 px-4">${barsHtml}</div>
    </div>` : ''}

    <div class="card">
      <div class="card-header py-2 px-3 d-flex justify-content-between align-items-center">
        <span class="fw-semibold small">${entries.length} üretim girişi</span>
      </div>
      <div class="table-responsive">
        <table class="table table-hover mb-0" style="font-size:13px;">
          <thead class="table-light">
            <tr><th>Tarih</th><th>Ürün</th><th>SKU</th><th>Adet</th><th>Notlar</th><th style="width:60px;"></th></tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Add Production Entry ────────────────────────────────────────
function openAddProduction() {
  document.getElementById('ur-edit-id').value    = '';
  document.getElementById('ur-edit-date').value  = new Date().toISOString().slice(0,10);
  document.getElementById('ur-edit-qty').value   = '';
  document.getElementById('ur-edit-notes').value = '';

  // Fill product dropdown
  const sel = document.getElementById('ur-edit-product');
  sel.innerHTML = '<option value="">Ürün seçin…</option>';
  prProducts
    .sort((a,b) => (a.name||'').localeCompare(b.name||''))
    .forEach(p => {
      const opt = document.createElement('option');
      opt.value       = p._id;
      opt.textContent = `${p.sku ? '['+p.sku+'] ' : ''}${p.name}`;
      opt.dataset.sku  = p.sku || '';
      opt.dataset.name = p.name || '';
      sel.appendChild(opt);
    });

  if (!prProducts.length) {
    sel.innerHTML = '<option value="">Önce Ürünler sayfasına ürün ekleyin</option>';
  }

  new bootstrap.Modal(document.getElementById('productionModal')).show();
}

async function saveProduction() {
  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId) return;

  const date      = document.getElementById('ur-edit-date').value;
  const productId = document.getElementById('ur-edit-product').value;
  const qty       = parseInt(document.getElementById('ur-edit-qty').value) || 0;
  const notes     = document.getElementById('ur-edit-notes').value.trim();

  if (!date || !productId || qty < 1) { toast('Tarih, ürün ve adet zorunludur.', 'error'); return; }

  const selEl     = document.getElementById('ur-edit-product');
  const selOpt    = selEl.options[selEl.selectedIndex];
  const productName = selOpt?.dataset.name || '';
  const productSku  = selOpt?.dataset.sku  || '';

  const now    = new Date().toISOString();
  const fields = {
    date:        { stringValue: date },
    productId:   { stringValue: productId },
    productName: { stringValue: productName },
    productSku:  { stringValue: productSku },
    qty:         { integerValue: String(qty) },
    notes:       { stringValue: notes },
    createdAt:   { stringValue: now },
  };

  const base = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${UR_COL}`;
  try {
    const res = await fetch(`${base}?key=${cfg.apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message||'HTTP '+res.status); }
    const data = await res.json();
    const docId = data.name?.split('/').pop() || ('ur_'+Date.now());

    // Add to local list
    urEntries.unshift({ _id: docId, date, productId, productName, productSku, qty, notes, createdAt: now });

    // ★ Increase stock automatically
    const ok = await stockAdjust(productId, qty);
    bootstrap.Modal.getInstance(document.getElementById('productionModal'))?.hide();
    toast(`✓ ${qty} adet "${productName}" üretildi${ok ? ' — stok güncellendi' : ''}`, 'success');
    renderUretim();
  } catch(e) { toast('Hata: '+e.message, 'error'); }
}

async function deleteProductionEntry(id) {
  const e = urEntries.find(x => x._id === id);
  if (!confirm(`${e?.date||''} tarihli "${e?.productName||''}" (${e?.qty||0} adet) girişini silmek istediğinize emin misiniz?\n\nNot: Bu işlem stoğu GERİ ALMAZ.`)) return;
  const cfg = loadFbConfig();
  if (!cfg?.apiKey || !cfg?.projectId) return;
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${UR_COL}/${id}?key=${cfg.apiKey}`,
      { method: 'DELETE' }
    );
    if (!res.ok) { const e2 = await res.json().catch(()=>({})); throw new Error(e2.error?.message||'HTTP '+res.status); }
    urEntries = urEntries.filter(x => x._id !== id);
    toast('✓ Üretim girişi silindi', 'success');
    renderUretim();
  } catch(e) { toast('Hata: '+e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// FATURA — Stock deduction button
// ══════════════════════════════════════════════════════════════
async function faturaStockDeduct() {
  if (!ftCurrentQuote) return;
  const lines = ftCurrentQuote.lines || [];
  if (!lines.length) { toast('Bu teklif/faturada kalem yok.', 'error'); return; }

  // Make sure products are loaded
  const cfg = loadFbConfig();
  if (!prProducts.length && cfg?.apiKey && cfg?.projectId) {
    try { prProducts = await fsFetch(cfg.apiKey, cfg.projectId, PR_COL); } catch(_) {}
  }

  let deducted = 0, notFound = 0;
  for (const line of lines) {
    const qty = parseFloat(document.querySelector(`.ft-line-qty[data-i="${lines.indexOf(line)}"]`)?.value || line.qty || 0);
    if (!qty) continue;
    const product = prFindBySku(line.product) || prFindByName(line.product);
    if (product) {
      await stockAdjust(product._id, -Math.abs(qty));
      deducted++;
    } else { notFound++; }
  }
  if (deducted > 0) toast(`✓ ${deducted} üründen stok düşüldü${notFound ? ` (${notFound} ürün kataloğda bulunamadı)` : ''}`, 'success');
  else toast(`Stok düşülemedi — ürünler katalogda bulunamadı (${notFound} kalem). Ürünlerin SKU'su teklif kalemleriyle eşleşmeli.`, 'error');
}

// ── Netsis'e Gönder — faturayı onayla + stoktan otomatik düş ───
async function faturaNetsisSend() {
  if (!ftCurrentQuote) return;

  const btn = document.getElementById('ft-netsis-btn');
  if (btn && btn.disabled) return; // already sent

  // Read current line qtys from editable form fields
  const lines = ftCurrentQuote.lines || [];
  if (!lines.length) { toast('Bu faturada kalem yok.', 'error'); return; }

  // Confirm action
  if (!confirm('Faturayı onayla ve stok düşümünü gerçekleştir?\n\nBu işlem geri alınamaz.')) return;

  // Make sure products are loaded
  const cfg = loadFbConfig();
  if (!prProducts.length && cfg?.apiKey && cfg?.projectId) {
    try { prProducts = await fsFetch(cfg.apiKey, cfg.projectId, PR_COL); } catch(_) {}
  }

  // Read live qtys from form
  const qtyInputs = document.querySelectorAll('.ft-line-qty');
  const priceInputs = document.querySelectorAll('.ft-line-price');

  let deducted = 0, notFound = 0;
  const confirmedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const qty   = parseFloat(qtyInputs[i]?.value || lines[i].qty || 0);
    const price = parseFloat(priceInputs[i]?.value || lines[i].unitPrice || 0);
    confirmedLines.push({ ...lines[i], qty, unitPrice: price, total: qty * price });

    if (!qty) continue;
    const product = prFindBySku(lines[i].product) || prFindByName(lines[i].product);
    if (product) {
      await stockAdjust(product._id, -Math.abs(qty));
      deducted++;
    } else { notFound++; }
  }

  // Save confirmed invoice to Firestore invoices collection
  const faturaNo   = document.getElementById('ft-no')?.value   || ftCurrentQuote.quoteNumber || '';
  const faturaDate = document.getElementById('ft-date')?.value || new Date().toISOString().slice(0,10);
  const faturaVade = document.getElementById('ft-due')?.value  || '';
  const custName   = document.getElementById('ft-cust-name')?.value    || ftCurrentQuote.contactName    || '';
  const custCompany= document.getElementById('ft-cust-company')?.value || ftCurrentQuote.contactCompany || '';
  const custEmail  = document.getElementById('ft-cust-email')?.value   || ftCurrentQuote.contactEmail   || '';
  const custPhone  = document.getElementById('ft-cust-phone')?.value   || ftCurrentQuote.contactPhone   || '';
  const custAddr   = document.getElementById('ft-cust-addr')?.value    || '';
  const notes      = document.getElementById('ft-notes')?.value        || '';

  // Compute totals
  const subtotal = confirmedLines.reduce((s, l) => s + (l.total || 0), 0);
  const vatRate  = ftCurrentQuote.vatRate || 19;
  const vatAmt   = subtotal * (vatRate / 100);
  const total    = subtotal + vatAmt;

  if (cfg?.apiKey && cfg?.projectId) {
    try {
      const now = new Date().toISOString();
      // Build Firestore fields map
      const toStr  = v => ({ stringValue:  String(v ?? '') });
      const toNum  = v => ({ doubleValue:  Number(v  ?? 0) });
      const fields = {
        faturaNo:        toStr(faturaNo),
        date:            toStr(faturaDate),
        dueDate:         toStr(faturaVade),
        quoteId:         toStr(ftCurrentQuote._id || ''),
        quoteNumber:     toStr(ftCurrentQuote.quoteNumber || ''),
        contactName:     toStr(custName),
        contactCompany:  toStr(custCompany),
        contactEmail:    toStr(custEmail),
        contactPhone:    toStr(custPhone),
        contactAddress:  toStr(custAddr),
        notes:           toStr(notes),
        currency:        toStr(ftCurrentQuote.currency || 'EUR'),
        vatRate:         toNum(vatRate),
        subtotal:        toNum(subtotal),
        vatAmount:       toNum(vatAmt),
        totalAmount:     toNum(total),
        linesJson:       toStr(JSON.stringify(confirmedLines)),
        status:          toStr('confirmed'),
        sentToNetsis:    { booleanValue: true },
        createdAt:       toStr(now),
        confirmedAt:     toStr(now),
        createdBy:       toStr(window._currentUserName || 'system'),
      };
      const invUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/invoices?key=${cfg.apiKey}`;
      const res = await fetch(invUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) { const e2 = await res.json().catch(()=>({})); console.warn('Fatura kayıt hatası:', e2.error?.message); }
    } catch(e) { console.warn('Fatura kayıt hatası:', e); }
  }

  // ── Try real Netsis API if configured ────────────────────
  let netsisDocNo = null;
  try {
    if (typeof buildNetsisInvoiceFromFatura === 'function' && typeof netsisSendInvoice === 'function') {
      const netsisInvData = buildNetsisInvoiceFromFatura(ftCurrentQuote);
      if (netsisInvData && netsisInvData.lines.length) {
        const nCfg = (typeof loadNetsisConfig === 'function') ? loadNetsisConfig() : {};
        if (nCfg.baseUrl && nCfg.username && nCfg.password) {
          // Override lines with confirmed (live-edited) values
          netsisInvData.lines = confirmedLines.map(l => ({
            itemCode:    l.product     || '',
            description: l.description || l.product || '',
            qty:         Number(l.qty)       || 0,
            unit:        l.unit              || 'ADET',
            unitPrice:   Number(l.unitPrice) || 0,
            vatRate:     18,
          }));
          const nRes = await netsisSendInvoice(netsisInvData);
          if (nRes?.success) netsisDocNo = nRes.docNo;
        }
      }
    }
  } catch(ne) { console.warn('[Netsis] send error (non-blocking):', ne); }

  // Update UI
  if (btn) { btn.disabled = true; btn.classList.remove('btn-success'); btn.classList.add('btn-secondary'); btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Gönderildi'; }
  const badge = document.querySelector('#fatura-content .badge.bg-warning');
  if (badge) { badge.className = 'badge bg-success me-2'; badge.textContent = 'Onaylandı'; }

  const stockMsg = deducted > 0
    ? `${deducted} üründen stok düşüldü${notFound ? `, ${notFound} kalem katalogda bulunamadı` : ''}`
    : `Dikkat: ${notFound} kalem katalogda bulunamadı — stok güncellenemedi`;
  const netsisMsg = netsisDocNo ? ` | Netsis Fatura No: ${netsisDocNo}` : '';
  toast(`✓ Fatura onaylandı ve kaydedildi. ${stockMsg}${netsisMsg}.`, 'success');
}
