/**
 * ═══════════════════════════════════════════════════════════════
 *  WINDOFORM — Üretim Sync Script
 *  MSSQL → Firebase Firestore (production_entries)
 *
 *  Çalıştırma:  node sync-production.js
 *  Zamanlama:   Windows Task Scheduler ile her gün 20:00'de
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

// ── 1. YAPILANDIRMA (config.json dosyasından okunur) ───────────
const fs   = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
  console.error('❌  config.json bulunamadı! Lütfen config.example.json dosyasını kopyalayıp doldurun.');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const { mssql: sqlCfg, firebase: fbCfg } = cfg;

// ── 2. BAĞIMLILIKLAR ───────────────────────────────────────────
// npm install mssql node-fetch  (bkz. README)
let sql, fetch;
try {
  sql   = require('mssql');
  fetch = require('node-fetch');
} catch (e) {
  console.error('❌  Eksik paket:', e.message);
  console.error('    Lütfen çalıştırın: npm install mssql node-fetch');
  process.exit(1);
}

// ── 3. LOG YARDIMCISI ──────────────────────────────────────────
const logFile = path.join(__dirname, 'sync.log');
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n', 'utf-8');
}

// ── 4. ANA MANTIK ──────────────────────────────────────────────
async function main() {
  log('═══════════════ SYNC BAŞLADI ═══════════════');

  // 4a. MSSQL Bağlantısı
  log(`MSSQL'e bağlanılıyor → ${sqlCfg.server}\\${sqlCfg.database}`);
  let pool;
  try {
    pool = await sql.connect({
      server:   sqlCfg.server,
      database: sqlCfg.database,
      user:     sqlCfg.user,
      password: sqlCfg.password,
      port:     sqlCfg.port || 1433,
      options: {
        encrypt:              sqlCfg.encrypt              ?? false,
        trustServerCertificate: sqlCfg.trustServerCertificate ?? true,
      },
      connectionTimeout: 30000,
      requestTimeout:    60000,
    });
    log('✓ MSSQL bağlantısı kuruldu');
  } catch (e) {
    log(`❌ MSSQL bağlantı hatası: ${e.message}`);
    process.exit(1);
  }

  // 4b. SQL Sorgu — Bugünkü Üretim
  //
  //  Aşağıdaki sorguyu kendi tablo/sütun adlarınıza göre düzenleyin.
  //  Sorgu şu sütunları DÖNDÜRMEK ZORUNDADIR:
  //
  //    productSku   — ürün kodu (TEXT)
  //    productName  — ürün adı  (TEXT)
  //    qty          — üretilen adet (INTEGER)
  //    date         — üretim tarihi YYYY-MM-DD formatında (DATE/VARCHAR)
  //
  //  Örnek tablo yapısı (Netsis benzeri):
  //    [dbo].[UretimHareketleri] sütunlar: STOK_KODU, STOK_ADI, MIKTAR, TARIH
  //
  const todayStr = new Date().toISOString().slice(0, 10); // "2026-03-18"

  const query = sqlCfg.query
    // Eğer config.json'da özel sorgu varsa onu kullan
    ? sqlCfg.query.replace(/:today/g, `'${todayStr}'`)
    : `
      -- ⚠️  Bu sorguyu kendi tablo/sütun adlarınıza göre düzenleyin!
      SELECT
          STOK_KODU       AS productSku,
          STOK_ADI        AS productName,
          SUM(MIKTAR)     AS qty,
          CONVERT(VARCHAR(10), TARIH, 120) AS date
      FROM  dbo.UretimHareketleri
      WHERE CONVERT(DATE, TARIH) = '${todayStr}'
        AND MIKTAR > 0
      GROUP BY STOK_KODU, STOK_ADI, CONVERT(VARCHAR(10), TARIH, 120)
      ORDER BY STOK_KODU
    `;

  log(`SQL sorgusu çalıştırılıyor (tarih: ${todayStr})…`);
  let rows;
  try {
    const result = await pool.request().query(query);
    rows = result.recordset;
    log(`✓ ${rows.length} üretim satırı alındı`);
  } catch (e) {
    log(`❌ SQL sorgu hatası: ${e.message}`);
    await pool.close();
    process.exit(1);
  }

  await pool.close();
  log('MSSQL bağlantısı kapatıldı');

  if (!rows.length) {
    log('ℹ️  Bugün için üretim verisi yok — Firestore güncellenmedi');
    log('═══════════════ SYNC BİTTİ ═══════════════');
    return;
  }

  // 4c. Firestore REST API — Yaz
  const base = `https://firestore.googleapis.com/v1/projects/${fbCfg.projectId}/databases/(default)/documents/production_entries`;
  const now  = new Date().toISOString();

  let written = 0, errors = 0;

  for (const row of rows) {
    // Doküman ID: productSku + date (aynı gün ikinci kez çalışırsa üzerine yazar)
    const docId = `${(row.productSku || 'UNK').replace(/[^a-zA-Z0-9_-]/g, '_')}_${todayStr}`;
    const url   = `${base}/${docId}?key=${fbCfg.apiKey}` +
                  `&updateMask.fieldPaths=productSku` +
                  `&updateMask.fieldPaths=productName` +
                  `&updateMask.fieldPaths=qty` +
                  `&updateMask.fieldPaths=date` +
                  `&updateMask.fieldPaths=source` +
                  `&updateMask.fieldPaths=updatedAt`;

    const body = {
      fields: {
        productSku:  { stringValue:  String(row.productSku  || '') },
        productName: { stringValue:  String(row.productName || '') },
        qty:         { integerValue: String(Math.round(Number(row.qty) || 0)) },
        date:        { stringValue:  String(row.date || todayStr) },
        source:      { stringValue:  'mssql-sync' },
        updatedAt:   { stringValue:  now },
      },
    };

    try {
      const res = await fetch(url, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (res.ok) {
        log(`  ✓ ${row.productSku} — ${row.productName}: ${row.qty} adet`);
        written++;
      } else {
        const err = await res.json().catch(() => ({}));
        log(`  ✗ ${row.productSku}: ${err.error?.message || 'HTTP ' + res.status}`);
        errors++;
      }
    } catch (e) {
      log(`  ✗ ${row.productSku}: ${e.message}`);
      errors++;
    }
  }

  log(`\n📊 Özet: ${written} yazıldı, ${errors} hata`);
  log('═══════════════ SYNC BİTTİ ═══════════════\n');

  // Hata varsa process exit code 1 (Task Scheduler bu durumu görebilir)
  if (errors > 0 && written === 0) process.exit(1);
}

main().catch(e => {
  log(`❌ Beklenmedik hata: ${e.message}`);
  process.exit(1);
});
