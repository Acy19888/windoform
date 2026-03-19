/**
 * ═══════════════════════════════════════════════════════════════
 *  WINDOFORM — Netsis ↔ Firebase Sync Service
 *
 *  Was dieser Service macht:
 *   [1] Netsis Stok  → Firebase products   (alle X Minuten)
 *   [2] Netsis ARPs  → Firebase customers  (alle X Minuten, optional)
 *   [3] Firebase offene Rechnungen → Netsis ItemSlips senden
 *
 *  Voraussetzungen:
 *   - Node.js 18+
 *   - npm install node-fetch   (oder node-fetch@2 für CommonJS)
 *   - config.json ausgefüllt (von config.example.json kopieren)
 *
 *  Starten:   node sync-netsis.js
 *  Dauerhaft: pm2 start sync-netsis.js --name windoform-sync
 *             oder Windows Task Scheduler via run-netsis.bat
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Config laden ───────────────────────────────────────────
const configPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
  console.error('❌  config.json nicht gefunden! Kopiere config.example.json → config.json und füll es aus.');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const { netsis: nsCfg, firebase: fbCfg, sync: syncCfg } = cfg;

if (!nsCfg?.baseUrl || !nsCfg?.username || !nsCfg?.password) {
  console.error('❌  Netsis-Konfiguration unvollständig (baseUrl, username, password erforderlich).');
  process.exit(1);
}
if (!fbCfg?.apiKey || !fbCfg?.projectId) {
  console.error('❌  Firebase-Konfiguration unvollständig (apiKey, projectId erforderlich).');
  process.exit(1);
}

// ── node-fetch laden (v2 für CommonJS, v3 für ESM) ────────
let fetch;
try {
  fetch = require('node-fetch');
  if (typeof fetch !== 'function') fetch = fetch.default;
} catch {
  console.error('❌  node-fetch nicht installiert. Bitte ausführen: npm install node-fetch@2');
  process.exit(1);
}

// ── Log-Hilfe ──────────────────────────────────────────────
const logFile = path.join(__dirname, 'sync-netsis.log');
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB — dann rotieren
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    const stat = fs.existsSync(logFile) ? fs.statSync(logFile) : null;
    if (stat && stat.size > MAX_LOG_BYTES) {
      fs.renameSync(logFile, logFile + '.bak');
    }
    fs.appendFileSync(logFile, line + '\n', 'utf-8');
  } catch { /* log fehler ignorieren */ }
}

// ── Netsis Auth-Header ─────────────────────────────────────
function netsisHeaders() {
  const base = nsCfg.baseUrl.endsWith('/') ? nsCfg.baseUrl : nsCfg.baseUrl + '/';
  nsCfg.baseUrl = base; // normalisieren
  const token = Buffer.from(`${nsCfg.username}:${nsCfg.password}`).toString('base64');
  const h = {
    'Authorization': `Basic ${token}`,
    'Content-Type':  'application/json',
    'Accept':        'application/json',
  };
  if (nsCfg.company) h['X-Company'] = nsCfg.company;
  if (nsCfg.branch)  h['X-Branch']  = nsCfg.branch;
  return h;
}

// ── Firestore REST Basis-URL ───────────────────────────────
const FB_BASE = `https://firestore.googleapis.com/v1/projects/${fbCfg.projectId}/databases/(default)/documents`;

// ── Firestore: Dokument lesen ──────────────────────────────
async function fsGet(collection, docId) {
  const url = `${FB_BASE}/${collection}/${docId}?key=${fbCfg.apiKey}`;
  const res  = await fetch(url);
  if (!res.ok) return null;
  return await res.json();
}

// ── Firestore: Collection abrufen (alle Docs) ──────────────
async function fsFetchAll(collection, pageSize = 300) {
  const docs = [];
  let nextPageToken = null;
  do {
    let url = `${FB_BASE}/${collection}?key=${fbCfg.apiKey}&pageSize=${pageSize}`;
    if (nextPageToken) url += `&pageToken=${encodeURIComponent(nextPageToken)}`;
    const res  = await fetch(url);
    if (!res.ok) break;
    const data = await res.json();
    if (data.documents) docs.push(...data.documents);
    nextPageToken = data.nextPageToken || null;
  } while (nextPageToken);
  return docs.map(d => firestoreDocToObj(d));
}

// ── Firestore Doc → plain object ──────────────────────────
function firestoreDocToObj(doc) {
  const obj = { _id: doc.name?.split('/').pop() };
  for (const [k, v] of Object.entries(doc.fields || {})) {
    obj[k] = v.stringValue ?? v.integerValue ?? v.doubleValue ?? v.booleanValue ?? v.nullValue ?? null;
  }
  return obj;
}

// ── Firestore: PATCH (upsert) ──────────────────────────────
async function fsPatch(collection, docId, fields) {
  const masks = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const url   = `${FB_BASE}/${collection}/${encodeURIComponent(docId)}?key=${fbCfg.apiKey}&${masks}`;
  const res   = await fetch(url, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  return await res.json();
}

// ── Firestore: POST (neues Dokument) ──────────────────────
async function fsPost(collection, fields) {
  const url = `${FB_BASE}/${collection}?key=${fbCfg.apiKey}`;
  const res  = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  return await res.json();
}

// Firestore Wert-Helfer
const toStr  = v => ({ stringValue:  String(v  ?? '') });
const toNum  = v => ({ doubleValue:  Number(v  ?? 0)  });
const toBool = v => ({ booleanValue: Boolean(v)       });

// ═══════════════════════════════════════════════════════════
//  [1]  NETSIS STOK → FIREBASE PRODUCTS
// ═══════════════════════════════════════════════════════════
async function syncStok() {
  log('── [1] Netsis Stok Sync başladı ──');
  const headers = netsisHeaders();
  const allItems = [];
  const limit = 200;
  let offset  = 0;
  let hasMore = true;

  while (hasMore) {
    const fields = 'STOK_KODU,STOK_ADI,STOK_BIRIM,DEPO_MIKTARI,SATIS_FIYAT1,ALIS_FIYAT,STOK_TURU,GRUP_KODU';
    const url = `${nsCfg.baseUrl}api/v2/Items?limit=${limit}&offset=${offset}&fields=${fields}`;
    try {
      const res  = await fetch(url, { headers, timeout: 30000 });
      if (!res.ok) { log(`  ✗ Netsis Items HTTP ${res.status}`); break; }
      const data = await res.json();
      const items = Array.isArray(data) ? data : (data.value || data.items || data.Items || []);
      allItems.push(...items);
      log(`  ← ${offset + items.length} ürün alındı…`);
      if (items.length < limit) hasMore = false;
      else offset += limit;
    } catch(e) { log(`  ✗ Netsis bağlantı hatası: ${e.message}`); break; }
  }

  if (!allItems.length) { log('  ℹ️  Hiç ürün alınamadı.'); return; }

  const now = new Date().toISOString();
  let ok = 0, err = 0;

  for (const item of allItems) {
    const code = (item.STOK_KODU || item.id || '').toString().trim();
    if (!code) continue;
    const docId = code.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    try {
      await fsPatch('products', docId, {
        code:          toStr(code),
        name:          toStr(item.STOK_ADI   || ''),
        unit:          toStr(item.STOK_BIRIM || 'ADET'),
        qty:           toNum(item.DEPO_MIKTARI  || 0),
        price:         toNum(item.SATIS_FIYAT1  || 0),
        purchasePrice: toNum(item.ALIS_FIYAT    || 0),
        type:          toStr(item.STOK_TURU  || ''),
        group:         toStr(item.GRUP_KODU  || ''),
        netsisCode:    toStr(code),
        source:        toStr('netsis'),
        updatedAt:     toStr(now),
      });
      ok++;
    } catch(e) { log(`  ✗ ${code}: ${e.message}`); err++; }
  }
  log(`  ✓ Stok Sync bitti — ${ok} güncellendi, ${err} hata`);
}

// ═══════════════════════════════════════════════════════════
//  [2]  NETSIS ARPs (CARİ) → FIREBASE CUSTOMERS  (optional)
// ═══════════════════════════════════════════════════════════
async function syncCariler() {
  if (!syncCfg?.syncCariler) { log('── [2] Cari Sync devre dışı (config: sync.syncCariler = false)'); return; }
  log('── [2] Netsis Cari Sync başladı ──');
  const headers = netsisHeaders();
  const allArps = [];
  const limit   = 200;
  let offset    = 0;
  let hasMore   = true;

  while (hasMore) {
    const fields = 'CARI_KOD,CARI_ISIM,CARI_ISIM2,CARI_TEL1,CARI_TEL2,CARI_EMAIL,CARI_ADR1,CARI_ULKE,CARI_SEHIR,CARI_VERGI_NO,CARI_TIP';
    const url = `${nsCfg.baseUrl}api/v2/ARPs?limit=${limit}&offset=${offset}&fields=${fields}`;
    try {
      const res  = await fetch(url, { headers, timeout: 30000 });
      if (!res.ok) { log(`  ✗ Netsis ARPs HTTP ${res.status}`); break; }
      const data = await res.json();
      const arps = Array.isArray(data) ? data : (data.value || data.ARPs || []);
      allArps.push(...arps);
      log(`  ← ${offset + arps.length} cari alındı…`);
      if (arps.length < limit) hasMore = false;
      else offset += limit;
    } catch(e) { log(`  ✗ Netsis bağlantı hatası: ${e.message}`); break; }
  }

  if (!allArps.length) { log('  ℹ️  Hiç cari alınamadı.'); return; }

  const now = new Date().toISOString();
  let ok = 0, err = 0;

  for (const arp of allArps) {
    const code = (arp.CARI_KOD || '').toString().trim();
    if (!code) continue;
    const docId = 'arp_' + code.replace(/[^a-zA-Z0-9_\-]/g, '_');
    try {
      await fsPatch('netsis_customers', docId, {
        cariKod:    toStr(code),
        name:       toStr(arp.CARI_ISIM  || ''),
        name2:      toStr(arp.CARI_ISIM2 || ''),
        phone:      toStr(arp.CARI_TEL1  || ''),
        phone2:     toStr(arp.CARI_TEL2  || ''),
        email:      toStr(arp.CARI_EMAIL || ''),
        address:    toStr(arp.CARI_ADR1  || ''),
        country:    toStr(arp.CARI_ULKE  || ''),
        city:       toStr(arp.CARI_SEHIR || ''),
        taxNo:      toStr(arp.CARI_VERGI_NO || ''),
        type:       toStr(arp.CARI_TIP   || ''),
        source:     toStr('netsis'),
        updatedAt:  toStr(now),
      });
      ok++;
    } catch(e) { log(`  ✗ ${code}: ${e.message}`); err++; }
  }
  log(`  ✓ Cari Sync bitti — ${ok} güncellendi, ${err} hata`);
}

// ═══════════════════════════════════════════════════════════
//  [3]  FIREBASE FATURALAR → NETSIS ItemSlips
//       Schaut in `invoices` Collection nach Einträgen mit
//       sentToNetsis=true aber netsisDocNo leer
// ═══════════════════════════════════════════════════════════
async function pushInvoicesToNetsis() {
  log('── [3] Firebase → Netsis Fatura Push başladı ──');

  let invoices;
  try {
    invoices = await fsFetchAll('invoices');
  } catch(e) { log(`  ✗ Firebase invoices okunamadı: ${e.message}`); return; }

  // Sadece gönderilmemiş faturaları işle
  const pending = invoices.filter(inv =>
    inv.sentToNetsis &&
    !inv.netsisDocNo &&
    inv.status === 'confirmed'
  );

  if (!pending.length) { log('  ℹ️  Bekleyen fatura yok.'); return; }
  log(`  → ${pending.length} fatura gönderilecek`);

  const headers = netsisHeaders();
  let ok = 0, err = 0;

  for (const inv of pending) {
    try {
      // Satır verilerini JSON'dan ayrıştır
      let lines = [];
      try { lines = JSON.parse(inv.linesJson || '[]'); } catch { lines = []; }

      const payload = {
        TIPI:   'ftSFat',
        TARIH:  inv.date || new Date().toISOString().slice(0, 10),
        CARI_KOD:   inv.customerCode || inv.contactCompany || '',
        ACIKLAMA:   `CRM - ${inv.faturaNo || inv.quoteNumber || inv._id}`,
        DOVIZ_KOD:  inv.currency || 'USD',
        DOVIZ_KUR:  1,
        ItemSlipDetails: lines.map((l, i) => ({
          STOK_KODU:    l.product     || l.itemCode || '',
          ACIKLAMA:     l.description || l.product  || '',
          MIKTAR:       Number(l.qty)       || 0,
          BIRIM:        l.unit              || 'ADET',
          BIRIM_FIYAT:  Number(l.unitPrice) || 0,
          KDV_ORAN:     18,
          ISKONTO_ORAN: 0,
          SIRA_NO:      i + 1,
        })),
      };

      const url = `${nsCfg.baseUrl}api/v2/ItemSlips`;
      const res  = await fetch(url, {
        method:  'POST',
        headers,
        body:    JSON.stringify(payload),
        timeout: 30000,
      });

      if (!res.ok) {
        const errTxt = await res.text().catch(() => '');
        let msg = `HTTP ${res.status}`;
        try { msg = JSON.parse(errTxt).Message || msg; } catch {}
        throw new Error(msg);
      }

      const result   = await res.json();
      const docNo    = result?.FATIRS_NO || result?.id || result?.DocumentNumber || '—';
      const now      = new Date().toISOString();

      // Firebase aktualisieren
      await fsPatch('invoices', inv._id, {
        netsisDocNo:   toStr(docNo),
        netsisStatus:  toStr('sent'),
        netsisSentAt:  toStr(now),
      });

      log(`  ✓ Fatura ${inv.faturaNo || inv._id} → Netsis: ${docNo}`);
      ok++;

    } catch(e) {
      log(`  ✗ Fatura ${inv._id}: ${e.message}`);
      // Hata durumunu Firebase'e yaz
      try {
        await fsPatch('invoices', inv._id, {
          netsisStatus:     toStr('error'),
          netsisLastError:  toStr(e.message),
        });
      } catch { /* ignore */ }
      err++;
    }
  }
  log(`  ✓ Fatura Push bitti — ${ok} gönderildi, ${err} hata`);
}

// ═══════════════════════════════════════════════════════════
//  HAUPTSCHLEIFE
// ═══════════════════════════════════════════════════════════
const STOK_INTERVAL_MIN    = syncCfg?.stokIntervalMinutes   ?? 30;
const CARI_INTERVAL_MIN    = syncCfg?.cariIntervalMinutes   ?? 60;
const INVOICE_INTERVAL_MIN = syncCfg?.invoiceIntervalMinutes ?? 5;

log('╔══════════════════════════════════════════════╗');
log('║   WINDOFORM Netsis ↔ Firebase Sync Service   ║');
log('╚══════════════════════════════════════════════╝');
log(`Netsis URL:   ${nsCfg.baseUrl}`);
log(`Firebase:     ${fbCfg.projectId}`);
log(`Stok Sync:    alle ${STOK_INTERVAL_MIN} Minuten`);
log(`Cari Sync:    alle ${CARI_INTERVAL_MIN} Minuten`);
log(`Fatura Push:  alle ${INVOICE_INTERVAL_MIN} Minuten`);
log('');

// Sofort beim Start alle Jobs ausführen
async function runAll() {
  try { await syncStok();            } catch(e) { log(`❌ syncStok Fehler: ${e.message}`);    }
  try { await syncCariler();         } catch(e) { log(`❌ syncCariler Fehler: ${e.message}`); }
  try { await pushInvoicesToNetsis();} catch(e) { log(`❌ pushInvoices Fehler: ${e.message}`);}
  log('');
}

runAll();

// Intervalle einrichten
setInterval(() => syncStok().catch(e => log(`❌ syncStok: ${e.message}`)),
  STOK_INTERVAL_MIN * 60 * 1000);

setInterval(() => syncCariler().catch(e => log(`❌ syncCariler: ${e.message}`)),
  CARI_INTERVAL_MIN * 60 * 1000);

setInterval(() => pushInvoicesToNetsis().catch(e => log(`❌ pushInvoices: ${e.message}`)),
  INVOICE_INTERVAL_MIN * 60 * 1000);

log('✓ Sync Service aktif. Ctrl+C ile durdurabilirsiniz.');
