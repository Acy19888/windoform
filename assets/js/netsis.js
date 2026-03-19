// ═══════════════════════════════════════════════════════════
// NETSIS NetOpenX REST Integration — netsis.js
// API: api/v2/ItemSlips, api/v2/Items, api/v2/ARPs
// Auth: HTTP Basic Auth (username:password) + Company/Branch headers
// ═══════════════════════════════════════════════════════════

// ── Config storage key ────────────────────────────────────
const NETSIS_CFG_KEY = 'windoform_netsis_cfg';

function loadNetsisConfig() {
  try {
    return JSON.parse(localStorage.getItem(NETSIS_CFG_KEY) || '{}');
  } catch { return {}; }
}

function saveNetsisConfig(cfg) {
  localStorage.setItem(NETSIS_CFG_KEY, JSON.stringify(cfg));
}

function saveNetsisSettings() {
  const g = id => (document.getElementById(id)?.value || '').trim();
  const cfg = {
    baseUrl:   g('ns-base-url'),
    username:  g('ns-username'),
    password:  g('ns-password'),
    company:   g('ns-company'),
    branch:    g('ns-branch'),
  };
  if (!cfg.baseUrl || !cfg.username || !cfg.password) {
    toast('Netsis: URL, kullanıcı adı ve şifre zorunludur.', 'error');
    return;
  }
  // Normalize URL
  if (!cfg.baseUrl.endsWith('/')) cfg.baseUrl += '/';
  saveNetsisConfig(cfg);
  toast('✓ Netsis ayarları kaydedildi', 'success');
}

function loadNetsisSettingsToForm() {
  const cfg = loadNetsisConfig();
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  s('ns-base-url',  cfg.baseUrl  || '');
  s('ns-username',  cfg.username || '');
  s('ns-password',  cfg.password || '');
  s('ns-company',   cfg.company  || '');
  s('ns-branch',    cfg.branch   || '');
}

// ── Auth header builder ───────────────────────────────────
function _netsisHeaders(cfg) {
  const token = btoa(`${cfg.username}:${cfg.password}`);
  const h = {
    'Authorization': `Basic ${token}`,
    'Content-Type':  'application/json',
    'Accept':        'application/json',
  };
  if (cfg.company) h['X-Company']  = cfg.company;
  if (cfg.branch)  h['X-Branch']   = cfg.branch;
  return h;
}

// ── Ping / connection test ────────────────────────────────
async function netsisPing() {
  const cfg = loadNetsisConfig();
  if (!cfg.baseUrl) { toast('Netsis yapılandırması eksik.', 'error'); return false; }
  const el = document.getElementById('ns-ping-result');
  if (el) el.innerHTML = '<span class="text-muted"><i class="bi bi-hourglass-split me-1"></i>Test ediliyor…</span>';
  try {
    const res = await fetch(`${cfg.baseUrl}api/v2/public/Ping`, {
      method: 'GET',
      headers: _netsisHeaders(cfg),
    });
    const txt = await res.text().catch(() => '');
    if (res.ok) {
      if (el) el.innerHTML = '<span class="text-success"><i class="bi bi-check-circle-fill me-1"></i>Bağlantı başarılı!</span>';
      toast('✓ Netsis bağlantısı başarılı', 'success');
      return true;
    } else {
      const msg = `HTTP ${res.status}: ${txt.slice(0,120)}`;
      if (el) el.innerHTML = `<span class="text-danger"><i class="bi bi-x-circle-fill me-1"></i>${esc(msg)}</span>`;
      toast('Netsis bağlantı hatası: ' + msg, 'error');
      return false;
    }
  } catch(e) {
    const msg = e.message || 'Bilinmeyen hata';
    if (el) el.innerHTML = `<span class="text-danger"><i class="bi bi-x-circle-fill me-1"></i>${esc(msg)}</span>`;
    toast('Netsis bağlantı hatası: ' + msg, 'error');
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// FATURA → NETSIS  (POST api/v2/ItemSlips)
// docType options:
//   ftSFat = Satış Fatura (Sales Invoice)
//   ftAFat = Alış Fatura  (Purchase Invoice)
// ═══════════════════════════════════════════════════════════
async function netsisSendInvoice(invoiceData) {
  /*
    invoiceData = {
      customerCode:  string  (CARI_KOD)
      customerName:  string
      docDate:       string  (YYYY-MM-DD)
      docType:       string  default 'ftSFat'
      description:   string
      lines: [
        { itemCode, description, qty, unit, unitPrice, vatRate, discountRate }
      ]
    }
  */
  const cfg = loadNetsisConfig();
  if (!cfg.baseUrl || !cfg.username || !cfg.password) {
    toast('Netsis yapılandırması eksik. Fuarbot → Netsis Ayarları.', 'error');
    return null;
  }

  const docType = invoiceData.docType || 'ftSFat';
  const today   = invoiceData.docDate || new Date().toISOString().split('T')[0];

  // Build ItemSlips payload
  // Netsis field names based on ItemSlips model
  const payload = {
    TIPI:        docType,
    TARIH:       today,
    CARI_KOD:    invoiceData.customerCode || '',
    ACIKLAMA:    invoiceData.description  || 'CRM den gonderildi',
    DOVIZ_KOD:   invoiceData.currency     || 'USD',
    DOVIZ_KUR:   invoiceData.exchangeRate || 1,
    ItemSlipDetails: (invoiceData.lines || []).map((l, i) => ({
      STOK_KODU:    l.itemCode     || '',
      ACIKLAMA:     l.description  || '',
      MIKTAR:       Number(l.qty   || 0),
      BIRIM:        l.unit         || 'ADET',
      BIRIM_FIYAT:  Number(l.unitPrice || 0),
      KDV_ORAN:     Number(l.vatRate   || 18),
      ISKONTO_ORAN: Number(l.discountRate || 0),
      SIRA_NO:      i + 1,
    })),
  };

  try {
    const res = await fetch(`${cfg.baseUrl}api/v2/ItemSlips`, {
      method:  'POST',
      headers: _netsisHeaders(cfg),
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => 'Bilinmeyen hata');
      let errMsg = `HTTP ${res.status}`;
      try { const j = JSON.parse(errTxt); errMsg = j.Message || j.message || errMsg; } catch {}
      throw new Error(errMsg);
    }

    const result = await res.json();
    // Netsis returns the created document's number in result
    const docNo = result?.FATIRS_NO || result?.id || result?.DocumentNumber || '—';
    toast(`✓ Netsis Fatura oluşturuldu: ${docNo}`, 'success');
    return { success: true, docNo, raw: result };

  } catch(e) {
    toast('Netsis fatura hatası: ' + e.message, 'error');
    console.error('[Netsis] Invoice error:', e);
    return { success: false, error: e.message };
  }
}

// ── Get new ItemSlip number ───────────────────────────────
async function netsisNewInvoiceNumber(docType) {
  const cfg = loadNetsisConfig();
  if (!cfg.baseUrl) return null;
  try {
    const res = await fetch(`${cfg.baseUrl}api/v2/ItemSlips/NewNumber`, {
      method:  'POST',
      headers: _netsisHeaders(cfg),
      body:    JSON.stringify({ TIPI: docType || 'ftSFat' }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.NewNumber || data?.number || null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════
// STOK SYNC  (GET api/v2/Items)
// Pulls Netsis stock items and syncs to Firestore
// ═══════════════════════════════════════════════════════════
async function netsisStockSync() {
  const cfg = loadNetsisConfig();
  if (!cfg.baseUrl || !cfg.username || !cfg.password) {
    toast('Netsis yapılandırması eksik. Fuarbot → Netsis Ayarları.', 'error');
    return;
  }

  const fbCfg = loadFbConfig();
  if (!fbCfg?.apiKey || !fbCfg?.projectId) {
    toast('Firebase yapılandırması eksik.', 'error');
    return;
  }

  const btnEl  = document.getElementById('ns-sync-btn');
  const statEl = document.getElementById('ns-sync-status');
  if (btnEl)  { btnEl.disabled = true; btnEl.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>Senkronize ediliyor…'; }
  if (statEl) statEl.innerHTML = '<span class="text-muted small">Netsis\'ten stok verileri alınıyor…</span>';

  try {
    // Fetch all items from Netsis (paginated)
    const allItems = await _netsisFetchAllItems(cfg);
    if (!allItems.length) {
      if (statEl) statEl.innerHTML = '<span class="text-warning small">Netsis\'ten hiç ürün alınamadı.</span>';
      toast('Netsis\'ten hiç ürün alınamadı.', 'error');
      return;
    }

    // Map Netsis items to our Firestore products schema
    const fbBase = `https://firestore.googleapis.com/v1/projects/${fbCfg.projectId}/databases/(default)/documents`;
    let synced = 0, errors = 0;

    for (const item of allItems) {
      try {
        const fields = _netsisItemToFirestore(item);
        const code   = item.STOK_KODU || item.id;
        if (!code) continue;

        // Try to find existing product in Firestore by STOK_KODU
        // Use PATCH with document name = STOK_KODU as doc ID
        const docUrl = `${fbBase}/products/${encodeURIComponent(code)}?key=${fbCfg.apiKey}`;
        await fetch(docUrl, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fields }),
        });
        synced++;
      } catch { errors++; }
    }

    const msg = `✓ ${synced} ürün senkronize edildi${errors ? `, ${errors} hata` : ''}.`;
    if (statEl) statEl.innerHTML = `<span class="${errors?'text-warning':'text-success'} small">${msg}</span>`;
    toast(msg, errors ? 'warning' : 'success');

    // Refresh products view if open
    if (typeof loadProducts === 'function') loadProducts().catch(()=>{});

  } catch(e) {
    const msg = 'Netsis stok sync hatası: ' + e.message;
    if (statEl) statEl.innerHTML = `<span class="text-danger small">${esc(msg)}</span>`;
    toast(msg, 'error');
  } finally {
    if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i>Netsis\'ten Stok Senkronize Et'; }
  }
}

async function _netsisFetchAllItems(cfg) {
  const allItems = [];
  const limit    = 100;
  let   offset   = 0;
  let   hasMore  = true;

  while (hasMore) {
    const url = `${cfg.baseUrl}api/v2/Items?limit=${limit}&offset=${offset}&fields=STOK_KODU,STOK_ADI,STOK_BIRIM,DEPO_MIKTARI,SATIS_FIYAT1,ALIS_FIYAT,STOK_TURU`;
    const res = await fetch(url, { headers: _netsisHeaders(cfg) });
    if (!res.ok) break;
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.value || data.items || data.data || []);
    allItems.push(...items);
    if (items.length < limit) hasMore = false;
    else offset += limit;
  }
  return allItems;
}

function _netsisItemToFirestore(item) {
  const toStr = v => ({ stringValue: String(v ?? '') });
  const toNum = v => ({ doubleValue: Number(v  ?? 0) });
  return {
    code:         toStr(item.STOK_KODU  || ''),
    name:         toStr(item.STOK_ADI   || ''),
    unit:         toStr(item.STOK_BIRIM || 'ADET'),
    qty:          toNum(item.DEPO_MIKTARI   || 0),
    price:        toNum(item.SATIS_FIYAT1   || 0),
    purchasePrice:toNum(item.ALIS_FIYAT     || 0),
    type:         toStr(item.STOK_TURU  || ''),
    netsisCode:   toStr(item.STOK_KODU  || ''),
    updatedAt:    toStr(new Date().toISOString()),
    source:       toStr('netsis'),
  };
}

// ═══════════════════════════════════════════════════════════
// ARP (Cari) lookup — find Netsis customer by code
// ═══════════════════════════════════════════════════════════
async function netsisGetCustomer(customerCode) {
  const cfg = loadNetsisConfig();
  if (!cfg.baseUrl || !customerCode) return null;
  try {
    const res = await fetch(
      `${cfg.baseUrl}api/v2/ARPs/${encodeURIComponent(customerCode)}`,
      { headers: _netsisHeaders(cfg) }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Helper: build invoice data from current Fatura form ───
function buildNetsisInvoiceFromFatura(quote) {
  /*
    Reads the live Fatura form and builds a netsisSendInvoice-compatible object.
    Called from faturaNetsisSend() in products.js
  */
  if (!quote) return null;

  const lines = [];
  document.querySelectorAll('.ft-line-row').forEach(row => {
    const code  = row.querySelector('.ft-line-code')?.value?.trim()  || '';
    const desc  = row.querySelector('.ft-line-desc')?.value?.trim()  || '';
    const qty   = parseFloat(row.querySelector('.ft-line-qty')?.value  || 0);
    const price = parseFloat(row.querySelector('.ft-line-price')?.value || 0);
    const unit  = row.querySelector('.ft-line-unit')?.value?.trim()  || 'ADET';
    if ((code || desc) && qty > 0) {
      lines.push({ itemCode: code, description: desc, qty, unit, unitPrice: price, vatRate: 18 });
    }
  });

  // Fallback: use quote.lines if DOM rows not found
  if (!lines.length && quote.lines?.length) {
    quote.lines.forEach(l => {
      if (l.product && (l.qty || 0) > 0) {
        lines.push({
          itemCode:    l.product,
          description: l.description || l.product,
          qty:         Number(l.qty)       || 0,
          unit:        l.unit              || 'ADET',
          unitPrice:   Number(l.unitPrice) || 0,
          vatRate:     18,
        });
      }
    });
  }

  return {
    customerCode:  quote.customerCode  || quote.customer || '',
    customerName:  quote.customerName  || quote.customer || '',
    docDate:       new Date().toISOString().split('T')[0],
    docType:       'ftSFat',
    description:   `CRM Fatura - ${quote.id || quote.quoteNo || ''}`,
    currency:      quote.currency      || 'USD',
    exchangeRate:  1,
    lines,
  };
}
