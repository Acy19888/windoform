// Split from app.js — Excel import and duplicate handling

function handleDragOver(e) { e.preventDefault(); document.getElementById('upload-zone').classList.add('drag-over'); }
function handleDragLeave()  { document.getElementById('upload-zone').classList.remove('drag-over'); }
function handleDrop(e) { e.preventDefault(); document.getElementById('upload-zone').classList.remove('drag-over'); if (e.dataTransfer.files.length) handleFileSelect({target:{files:e.dataTransfer.files}}); }

function handleFileSelect(e) {
  const f = e.target.files[0];
  if (!f) return;
  showLoading('Excel okunuyor…');
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      // cellDates:false + raw:false → en hızlı parse
      const wb = XLSX.read(ev.target.result, {
        type: 'array',
        cellDates: false,
        cellNF: false,
        cellStyles: false,
        sheetRows: 0   // tüm satırlar
      });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // header:1 sonra object dönüşümü — daha hızlı
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '', blankrows: false });
      importFileData = raw;
      hideLoading();
      const prev = document.getElementById('import-preview');
      document.getElementById('import-preview-msg').textContent =
        `✓ "${f.name}" yüklendi — ${raw.length.toLocaleString('tr-TR')} satır, ${wb.SheetNames.length} sayfa`;
      prev.style.display = 'block';
      if (raw.length > 0) showSmartPreview(Object.keys(raw[0]));
    } catch(err) {
      hideLoading();
      toast('Dosya okunamadı: ' + err.message, 'error');
    }
  };
  reader.onerror = () => { hideLoading(); toast('Dosya okunamadı', 'error'); };
  reader.readAsArrayBuffer(f);
}

const FIELD_TYPES = [
  'Firma','Adı','Soyadı','Unvan','Kişi E-posta',
  'Telefon','E-posta','Website','Faks',
  'Sektör','Açıklama','Çalışan','Ciro','SIC','NAICS',
  'Adres','Şehir','İlçe','State','Posta Kodu','Ülke',
  'Vergi No','Vergi Dairesi',
  'LinkedIn','Facebook','Instagram','Twitter','YouTube',
  'Enlem','Boylam','Notlar','Durum','Atla'
];

function detectColType(col) {
  const l = trLow(col);
  // Uzun/spesifik eşleşmeler önce
  if (l.includes('vergi dairesi') || l.includes('v. dairesi') || l.includes('v dairesi'))        return 'Vergi Dairesi';
  if (l.includes('contact first') || l.includes('first name'))                                    return 'Adı';
  if (l.includes('contact last')  || l.includes('last name'))                                     return 'Soyadı';
  if (l.includes('contact role')  || l === 'role')                                                return 'Unvan';
  if (l.includes('contact email') || l.includes('yetkili e-posta') || l.includes('iletişim e'))  return 'Kişi E-posta';
  if (l.includes('posta kodu') || l.includes('postcode') || l.includes('postal') ||
      l.includes('zip'))                                                                            return 'Posta Kodu';
  if (l.includes('naics'))                                                                         return 'NAICS';
  if (l === 'sic' || l.includes('sic kod') || l.includes('sic code'))                            return 'SIC';
  if (l.includes('linkedin'))                                                                      return 'LinkedIn';
  if (l.includes('facebook') || l === 'fb')                                                       return 'Facebook';
  if (l.includes('nstagram') || l === 'ig')                                                       return 'Instagram';
  if (l === 'x' || l.includes('twitter'))                                                         return 'Twitter';
  if (l.includes('youtube'))                                                                       return 'YouTube';
  if (l.includes('faks') || l.includes('fax'))                                                    return 'Faks';
  if (l.includes('firma') || l.includes('cari') || l.includes('sirket') ||
      l.includes('şirket') || l.includes('company') || l.includes('business') ||
      l.includes('kurum'))                                                                          return 'Firma';
  if (l.includes('calisan') || l.includes('çalışan') || l.includes('employees') ||
      l.includes('personel'))                                                                       return 'Çalışan';
  if (l.includes('ciro') || l.includes('revenue') || l.includes('gelir') ||
      l.includes('turnover'))                                                                       return 'Ciro';
  if (l.includes('description') || l.includes('açıklama') || l.includes('aciklama') ||
      l.includes('about') || l.includes('hakkında'))                                               return 'Açıklama';
  if (l.includes('ulke') || l.includes('ülke') || l.includes('country'))                         return 'Ülke';
  if ((l.includes('state') || l.includes('province') || l.includes('eyalet') ||
       l.includes('region')) && !l.includes('status'))                                             return 'State';
  if (l.includes('yetkili') || l.includes('isim') || l === 'name')                               return 'Adı';
  if (l.includes('pozisyon') || l.includes('gorev') || l.includes('görev') || l === 'title')     return 'Unvan';
  if (l.includes('telefon') || l.includes('phone') || (l.startsWith('tel') && l.length <= 8) ||
      l.includes('gsm') || l.includes('cep'))                                                     return 'Telefon';
  if (l.includes('email') || l.includes('e mail') || l.includes('e-mail') ||
      l.includes('mail') || l === 'e-posta')                                                      return 'E-posta';
  if (l.includes('sektor') || l.includes('sektör') || l.includes('sector') ||
      l.includes('categor') || l.includes('kategori'))                                            return 'Sektör';
  if (l.includes('adres') || l.includes('address') || l.includes('street') ||
      l.includes('sokak') || l.includes('cadde'))                                                 return 'Adres';
  if ((l.includes('sehir') || l.includes('şehir') || l.includes('city') || l === 'il') &&
      !l.includes('ilce') && !l.includes('ilçe'))                                                 return 'Şehir';
  if (l.includes('ilce') || l.includes('ilçe') || l.includes('district'))                        return 'İlçe';
  if (l.includes('enlem') || l === 'lat' || l === 'latitude')                                     return 'Enlem';
  if (l.includes('boylam') || l === 'lon' || l === 'lng' || l === 'longitude')                   return 'Boylam';
  if ((l.includes('vergi') || l.includes('vkn') || l.includes('tckn') || l.includes('tax')) &&
      !l.includes('dairesi'))                                                                      return 'Vergi No';
  if (l.includes('website') || l.includes('web') || l.includes('url') || l.includes('site'))     return 'Website';
  if (l.includes('durum') || l.includes('status'))                                                return 'Durum';
  if (l.includes('not') || l.includes('notes'))                                                   return 'Notlar';
  return 'Atla';
}

function showSmartPreview(cols) {
  // ── 1. Auto-detect initial mapping ────────────────────────────────────────
  const { fieldToCol } = buildStandardFieldAccessor(cols);

  // Invert fieldToCol → colToField (col → CRM field)
  const colToField = {};
  Object.entries(fieldToCol).forEach(function(e) { colToField[e[1]] = e[0]; });

  // Store column order globally (for dropdown onchange index lookup)
  importCols = cols.slice();

  // Build importMapping: col → field (auto-detected or 'Atla')
  importMapping = {};
  cols.forEach(function(col) {
    importMapping[col] = colToField[col] || detectColType(col);
  });

  // ── 2. Build editable mapping table ──────────────────────────────────────
  const sampleRow = importFileData[0] || {};
  const fieldOptions = FIELD_TYPES.map(function(ft) { return { val: ft, label: ft }; });

  const rowsHtml = cols.map(function(col, idx) {
    const cur = importMapping[col];
    const sample = String(sampleRow[col] || '').substring(0, 50);
    const rowClass = cur === 'Firma' ? 'table-success' : (cur === 'Atla' ? '' : '');
    const badge = cur === 'Firma'
      ? '<span class="badge bg-success ms-1" style="font-size:10px;">★ Zorunlu</span>'
      : '';
    const opts = fieldOptions.map(function(o) {
      return '<option value="' + o.val + '"' + (o.val === cur ? ' selected' : '') + '>' + o.label + '</option>';
    }).join('');
    return '<tr class="' + rowClass + '" id="mrow-' + idx + '">' +
      '<td style="font-weight:600;white-space:nowrap;">' + esc(col) + badge + '</td>' +
      '<td class="text-muted" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(sample) + '">' +
        (sample ? esc(sample) : '<em style="color:#94a3b8;">—</em>') +
      '</td>' +
      '<td><select class="form-select form-select-sm" style="min-width:150px;" ' +
        'data-ci="' + idx + '" onchange="updateImportMapping(+this.dataset.ci, this.value)">' +
        opts + '</select></td>' +
      '</tr>';
  }).join('');

  document.getElementById('smart-mapping-list').innerHTML = rowsHtml;

  // ── 3. Data preview ──────────────────────────────────────────────────────
  const previewFields = ['Firma','Telefon','E-posta','Şehir','İlçe','Sektör','Vergi No']
    .filter(function(f) { return fieldToCol[f]; }).slice(0, 6);
  let tbl = '<table class="table table-sm mb-0"><thead><tr>';
  previewFields.forEach(function(f) { tbl += '<th style="white-space:nowrap;">' + esc(f) + '</th>'; });
  tbl += '</tr></thead><tbody>';
  importFileData.slice(0, 5).forEach(function(row) {
    tbl += '<tr>';
    previewFields.forEach(function(f) {
      const v = String(fieldToCol[f] ? (row[fieldToCol[f]] || '') : '');
      tbl += '<td title="' + esc(v) + '" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(v.substring(0,34)) + '</td>';
    });
    tbl += '</tr>';
  });
  tbl += '</tbody></table>';
  if (importFileData.length > 5) {
    tbl += '<p class="text-muted mt-1 mb-0" style="font-size:11px;">… ve ' + (importFileData.length - 5).toLocaleString('tr-TR') + ' satır daha</p>';
  }
  document.getElementById('smart-data-preview').innerHTML = tbl;

  // ── 4. Row count badge ───────────────────────────────────────────────────
  const rcEl = document.getElementById('import-row-count');
  if (rcEl) rcEl.textContent = importFileData.length.toLocaleString('tr-TR') + ' satır';

  document.getElementById('smart-preview-ui').style.display = 'block';
  document.getElementById('duplicate-review-ui').style.display = 'none';
  updateImportButtonState();
}

function updateImportMapping(colIdx, field) {
  const col = importCols[colIdx];
  if (col === undefined) return;
  importMapping[col] = field;
  // Update row styling
  const row = document.getElementById('mrow-' + colIdx);
  if (row) {
    row.className = field === 'Firma' ? 'table-success' : '';
    // Update/remove the "★ Zorunlu" badge in that row
    const td = row.querySelector('td:first-child');
    if (td) {
      // Remove old badge
      const oldBadge = td.querySelector('.badge');
      if (oldBadge) oldBadge.remove();
      if (field === 'Firma') {
        const b = document.createElement('span');
        b.className = 'badge bg-success ms-1';
        b.style.fontSize = '10px';
        b.textContent = '★ Zorunlu';
        td.appendChild(b);
      }
    }
  }
  updateImportButtonState();
}

function updateImportButtonState() {
  const firmaMapped = Object.values(importMapping).includes('Firma');
  const btn  = document.getElementById('btn-import');
  const warn = document.getElementById('import-firma-warning');
  if (btn)  btn.disabled = !firmaMapped;
  if (warn) warn.style.display = firmaMapped ? 'none' : '';
}

function cancelImport() {
  importFileData = [];
  importMapping = {};
  importCols    = [];
  importDuplicates = [];
  importPendingNonDupes = [];
  importPendingContacts = [];
  document.getElementById('smart-preview-ui').style.display = 'none';
  document.getElementById('duplicate-review-ui').style.display = 'none';
  document.getElementById('import-preview').style.display = 'none';
  document.getElementById('file-input').value = '';
}

// ─── Helper: build company object from Excel row ───────────────────────────
function buildCompanyFromRow(row, getField, firmAdi, now) {
  const addrVal = getField(row, 'Adres');
  const loc     = parseAddressForLocation(addrVal || '');
  const rawCity = getField(row, 'Şehir');
  const rawDist = getField(row, 'İlçe');
  const rawPh   = getField(row, 'Telefon');
  const pd      = rawPh ? normalizePhone(rawPh) : {valid:false,normalized:null,type:null};

  // Sektör: Excel'den al ya da isimden tespit et
  const rawSector = getField(row, 'Sektör');
  const sectorVal = rawSector || detectSector(firmAdi, getField(row, 'Açıklama') || getField(row, 'Notlar'));

  // Revenue: sayısal değer parse et
  const rawRevenue  = getField(row, 'Ciro');
  const rawEmployees = getField(row, 'Çalışan');

  const co = {
    name:            firmAdi,
    sector:          sectorVal,
    address:         addrVal || null,
    city:            rawCity ? normalizeCity(rawCity) : (loc.city || null),
    district:        rawDist || loc.district || null,
    state:           getField(row, 'State') || null,
    postcode:        getField(row, 'Posta Kodu') || null,
    country:         getField(row, 'Ülke') || 'Türkiye',
    phone:           rawPh || null,
    phoneNormalized: pd.normalized || null,
    phoneValid:      pd.valid,
    phoneType:       pd.type || null,
    email:           getField(row, 'E-posta') || null,
    website:         getField(row, 'Website') || null,
    fax:             getField(row, 'Faks') || null,
    taxNumber:       getField(row, 'Vergi No') || null,
    taxOffice:       getField(row, 'Vergi Dairesi') || null,
    description:     getField(row, 'Açıklama') || null,
    revenue:         rawRevenue || null,
    employees:       rawEmployees ? parseInt(rawEmployees, 10) || rawEmployees : null,
    sic:             getField(row, 'SIC') || null,
    naics:           getField(row, 'NAICS') || null,
    linkedin:        getField(row, 'LinkedIn') || null,
    facebook:        getField(row, 'Facebook') || null,
    instagram:       getField(row, 'Instagram') || null,
    twitter:         getField(row, 'Twitter') || null,
    youtube:         getField(row, 'YouTube') || null,
    lat:             getField(row, 'Enlem')  ? parseFloat(getField(row, 'Enlem'))  : null,
    lon:             getField(row, 'Boylam') ? parseFloat(getField(row, 'Boylam')) : null,
    notes:           getField(row, 'Notlar') || null,
    marketingStatus: 'Aranacak',
    priority:        'Normal',
    companyType:     'Normal',
    parentCompanyId: null,
    qualityScore:    0,
    errors:          [],
    createdAt:       now,
    updatedAt:       now,
    sourceFile:      'Excel İçe Aktarım'
  };
  co.qualityScore = calculateCompanyQuality(co);
  return co;
}

// ─── Step 1: Pre-check — find duplicates ───────────────────────────────────
async function doImportPreCheck() {
  if (!importFileData.length) { toast('\u00d6nce dosya se\u00e7in', 'error'); return; }

  // ── Build fieldToCol from the user's current importMapping (col → field) ──
  const fieldToCol = {};
  Object.entries(importMapping).forEach(function(e) {
    const col = e[0], field = e[1];
    if (field && field !== 'Atla' && !fieldToCol[field]) fieldToCol[field] = col;
  });
  if (!fieldToCol['Firma']) {
    toast('"Firma Adı" alanını eşleştirmeniz gerekiyor. Listede doğru sütunu seçin.', 'error');
    updateImportButtonState();
    return;
  }
  const getField = function(row, field) {
    const col = fieldToCol[field];
    if (!col) return null;
    const v = row[col];
    return (v !== undefined && v !== null && v !== '') ? String(v).trim() : null;
  };

  const totalRows = importFileData.length;
  showLoading('Veriler kontrol ediliyor\u2026');
  await yieldToUI();

  try {

    const nameCache = await dbBuildNameIdMap('companies'); // sadece cari adı üzerinden benzer kayıt kontrolü
    const now = new Date().toISOString();

    const nonDupes   = [];   // new companies (no duplicate)
    const newByKey   = {};   // trLow(name) → nonDupes index
    const duplicates = [];   // {existingId, existingName, newCompData, compKey}
    const dupByKey   = {};   // existingId → duplicates index
    const contactsBuf = [];  // {compKey, isDup, obj}

    for (let i = 0; i < totalRows; i++) {
      if (i > 0 && i % 1000 === 0) {
        const el = document.getElementById('loading-text');
        if (el) el.textContent = i.toLocaleString('tr-TR') + ' / ' + totalRows.toLocaleString('tr-TR') + ' sat\u0131r\u2026';
        await yieldToUI();
      }

      const row     = importFileData[i];
      const firmAdi = getField(row, 'Firma');
      let   compKey = null;

      if (firmAdi) {
        compKey = trLow(firmAdi);
        const dk = companyDupKeyFromRow(row, getField);
        const existingId = (dk.name && nameCache[dk.name]) ? nameCache[dk.name] : null;
        if (existingId) {
          // DUPLICATE — firm already exists in DB
          const grpKey = String(existingId);
          if (!(grpKey in dupByKey)) {
            dupByKey[grpKey] = duplicates.length;
            duplicates.push({
              existingId:   existingId,
              existingName: firmAdi,
              newCompData:  buildCompanyFromRow(row, getField, firmAdi, now),
              compKey,
              match: 'name'
            });
          }
        } else if (!(compKey in newByKey)) {
          newByKey[compKey] = nonDupes.length;
          nonDupes.push(buildCompanyFromRow(row, getField, firmAdi, now));
        }
      }

      const kisiAd     = getField(row, 'Adı');
      const kisiSoyad  = getField(row, 'Soyadı');
      const kisiAdi    = kisiAd && kisiSoyad ? kisiAd + ' ' + kisiSoyad : (kisiAd || kisiSoyad);
      if (kisiAdi) {
        const kisiTel = getField(row, 'Telefon');
        const pd2 = kisiTel ? normalizePhone(kisiTel) : {valid:false,normalized:null,type:null};
        contactsBuf.push({
          compKey,
          isDup: false,
          obj: {
            companyId:       null,
            name:            kisiAdi || '(İsimsiz)',
            title:           getField(row, 'Unvan') || null,
            phone:           kisiTel || null,
            phoneNormalized: pd2.normalized || null,
            phoneValid:      pd2.valid,
            phoneType:       pd2.type || null,
            email:           getField(row, 'Kişi E-posta') || getField(row, 'E-posta') || null,
            notes:           getField(row, 'Notlar') || null,
            status:          getField(row, 'Durum') || 'Aktif',
            qualityScore:    0,
            errors:          [],
            createdAt:       now,
            updatedAt:       now,
            createdBy:       (typeof authEmail === 'function' ? authEmail() : '') || '',
            sourceFile:      'Excel İçe Aktarım'
          }
        });
      }
    }

    hideLoading();
    importDuplicates      = duplicates;
    importPendingNonDupes = nonDupes;
    importPendingContacts = contactsBuf;

    if (duplicates.length > 0) {
      showDuplicateReview(duplicates, nonDupes.length, contactsBuf.length);
    } else {
      await executeImport(nonDupes, [], contactsBuf);
    }
  } catch (err) {
    hideLoading();
    console.error('Import \u00f6n kontrol hatas\u0131:', err);
    toast('Hata: ' + (err.message || String(err)), 'error');
  }
}

// ─── Step 2: Show duplicate review screen ──────────────────────────────────
function showDuplicateReview(duplicates, nonDupeCount, contactCount) {
  let html = '<div class="table-responsive">';
  html += '<table class="table" style="font-size:13px;">';
  html += '<thead><tr>';
  html += '<th>Yeni Kay\u0131t</th>';
  html += '<th>Mevcut Kay\u0131t</th>';
  html += '<th style="min-width:320px;">Yap\u0131lacak \u0130\u015flem</th>';
  html += '</tr></thead><tbody>';

  duplicates.forEach(function(dup, i) {
    const d = dup.newCompData;
    const info = [d.city, d.phone].filter(Boolean).join(' \u2022 ');
    html += '<tr>';
    html += '<td><strong>' + esc(dup.existingName) + '</strong>';
    if (info) html += '<br><small class="text-muted">' + esc(info) + '</small>';
    html += '</td>';
    html += '<td><span class="badge-company" style="cursor:pointer;" onclick="showCompanyModal(' + dup.existingId + ')">' + esc(dup.existingName) + '</span>';
    html += '<br><small class="text-muted">ID #' + dup.existingId + '</small></td>';
    html += '<td><div class="d-flex flex-wrap gap-1">';
    const opts = [
      {v:'sub',    cls:'primary',   lbl:'Alt Bayi Kaydet'},
      {v:'parent', cls:'purple',    lbl:'Ana Firma/\u00dcretici'},
      {v:'update', cls:'success',   lbl:'Bilgileri G\u00fcncelle'},
      {v:'new',    cls:'secondary', lbl:'Yeni Kay\u0131t'},
      {v:'skip',   cls:'warning',   lbl:'Atla'}
    ];
    opts.forEach(function(o) {
      const chk = (o.v === 'sub') ? ' checked' : '';
      const style = o.cls === 'purple' ? ' style="background:#7c3aed!important;"' : '';
      html += '<label style="cursor:pointer;"><input type="radio" name="dup_' + i + '" value="' + o.v + '"' + chk + '> ';
      html += '<span class="badge bg-' + o.cls + '"' + style + '>' + o.lbl + '</span></label>';
    });
    html += '</div></td></tr>';
  });

  html += '</tbody></table></div>';

  const summary = '<div class="alert alert-info py-2 mb-3" style="font-size:13px;">' +
    '<i class="bi bi-info-circle me-1"></i>' +
    '<strong>' + duplicates.length + '</strong> benzer firma \u2022 ' +
    '<strong>' + nonDupeCount + '</strong> yeni firma \u2022 ' +
    '<strong>' + contactCount + '</strong> ki\u015fi aktar\u0131lacak' +
    '</div>';

  document.getElementById('duplicate-review-table').innerHTML = summary + html;
  document.getElementById('smart-preview-ui').style.display = 'none';
  document.getElementById('duplicate-review-ui').style.display = 'block';
}

function setBulkDupAction(action) {
  document.querySelectorAll('#duplicate-review-table input[type="radio"]').forEach(function(r) {
    if (r.value === action) r.checked = true;
  });
}

async function finalizeDuplicatesAndImport() {
  const resolvedDupes = importDuplicates.map(function(dup, i) {
    const checked = document.querySelector('input[name="dup_' + i + '"]:checked');
    return Object.assign({}, dup, { action: checked ? checked.value : 'skip' });
  });
  await executeImport(importPendingNonDupes, resolvedDupes, importPendingContacts);
}

// ─── Step 3: Execute actual DB writes ──────────────────────────────────────
async function executeImport(nonDupeCompanies, resolvedDupes, contactsBuf) {
  showLoading('\u0130\u00e7eri al\u0131n\u0131yor\u2026');
  await yieldToUI();
  const setStatus = txt => { const el = document.getElementById('loading-text'); if (el) el.textContent = txt; };

  try {
    const now = new Date().toISOString();
    const compCache = await dbBuildNameIdMap('companies');

    // 1. Add non-duplicate companies
    setStatus(nonDupeCompanies.length.toLocaleString('tr-TR') + ' yeni firma ekleniyor\u2026');
    await yieldToUI();
    const newIds = await dbAddBatchChunked('companies', nonDupeCompanies);
    nonDupeCompanies.forEach(function(co, i) {
      if (newIds[i] != null) compCache[trLow(co.name)] = newIds[i];
    });

    let updatedCount = 0, subCount = 0, parentCount = 0, newExtraCount = 0, skipCount = 0;

    // 2. Handle each duplicate
    for (const dup of resolvedDupes) {
      if (dup.action === 'skip') { skipCount++; continue; }

      if (dup.action === 'update') {
        const existing = await dbGet('companies', dup.existingId);
        if (existing) {
          const nd = dup.newCompData;
          const updated = Object.assign({}, existing);
          // "Bilgileri güncelle" = Excel'de dolu gelen alanlarla yenile (overwrite)
          const overwrite = (k) => { if (nd[k] !== undefined && nd[k] !== null && nd[k] !== '') updated[k] = nd[k]; };
          ['phone','email','website','fax','address','city','district','state','postcode','country',
           'taxNumber','taxOffice','sector','description','revenue','employees','sic','naics',
           'linkedin','facebook','instagram','twitter','youtube','lat','lon','notes'].forEach(overwrite);
          updated.updatedAt    = now;
          updated.qualityScore = calculateCompanyQuality(updated);
          await dbPut('companies', updated);
          if (dup.compKey) compCache[dup.compKey] = dup.existingId;
          updatedCount++;
        }
      } else if (dup.action === 'sub') {
        // New record = Alt Bayi, linked to existing (parent)
        const co    = Object.assign({}, dup.newCompData, { companyType: 'Alt Bayi', parentCompanyId: dup.existingId });
        const newId = await dbAdd('companies', co);
        if (dup.compKey) compCache[dup.compKey] = newId;
        // Promote existing to Ana Firma if it was Normal
        const existing = await dbGet('companies', dup.existingId);
        if (existing && (!existing.companyType || existing.companyType === 'Normal')) {
          await dbPut('companies', Object.assign({}, existing, { companyType: 'Ana Firma', updatedAt: now }));
        }
        subCount++;
      } else if (dup.action === 'parent') {
        // New record = Ana Firma (parent of existing)
        const co    = Object.assign({}, dup.newCompData, { companyType: 'Ana Firma' });
        const newId = await dbAdd('companies', co);
        if (dup.compKey) compCache[dup.compKey] = newId;
        // Existing becomes Alt Bayi under new parent
        const existing = await dbGet('companies', dup.existingId);
        if (existing) {
          await dbPut('companies', Object.assign({}, existing, { companyType: 'Alt Bayi', parentCompanyId: newId, updatedAt: now }));
        }
        parentCount++;
      } else if (dup.action === 'new') {
        // Completely new separate record
        const newId = await dbAdd('companies', Object.assign({}, dup.newCompData));
        if (dup.compKey) compCache[dup.compKey] = newId;
        newExtraCount++;
      }
    }

    // 3. Assign company IDs to contacts (skip contacts of skipped companies)
    const skippedKeys = new Set(resolvedDupes.filter(d => d.action === 'skip').map(d => d.compKey));
    const contacts = contactsBuf
      .filter(function(item) {
        if (item.compKey && skippedKeys.has(item.compKey)) return false;
        return true;
      })
      .map(function(item) {
        item.obj.companyId    = item.compKey ? (compCache[item.compKey] || null) : null;
        item.obj.qualityScore = calculateContactQuality(item.obj);
        return item.obj;
      });

    setStatus(contacts.length.toLocaleString('tr-TR') + ' ki\u015fi ekleniyor\u2026');
    await yieldToUI();
    await dbAddBatchChunked('contacts', contacts);

    // 4. Save import log
    const fname = (document.getElementById('file-input').value || 'Excel')
      .split(/[\\\/]/).pop().replace(/^C:\\fakepath\\/i, '');
    const totalAdded = nonDupeCompanies.length + subCount + parentCount + newExtraCount;
    await dbAdd('imports', {
      filename:     fname,
      date:         now,
      companyCount: totalAdded,
      contactCount: contacts.length,
      totalRows:    importFileData.length,
      updatedCount, subCount, parentCount, skipCount
    });

    hideLoading();

    let msg = '\u2713 ' + nonDupeCompanies.length + ' yeni firma, ' + contacts.length + ' ki\u015fi aktar\u0131ld\u0131';
    if (updatedCount)   msg += ' \u2022 ' + updatedCount + ' g\u00fcncellendi';
    if (subCount)       msg += ' \u2022 ' + subCount + ' alt bayi eklendi';
    if (parentCount)    msg += ' \u2022 ' + parentCount + ' ana firma eklendi';
    if (newExtraCount)  msg += ' \u2022 ' + newExtraCount + ' yeni kay\u0131t';
    if (skipCount)      msg += ' \u2022 ' + skipCount + ' atland\u0131';
    toast(msg, 'success');
    cancelImport();

  } catch (err) {
    hideLoading();
    console.error('Import hatas\u0131:', err);
    toast('Aktar\u0131m hatas\u0131: ' + (err.message || String(err)), 'error');
    return;
  }

  try {
    await Promise.all([loadCompanies(), loadContacts(), loadImportHistory()]);
  } catch (uiErr) {
    console.warn('Liste yenileme hatas\u0131:', uiErr);
  }
}

async function loadImportHistory() {
  const list = await dbAll('imports');
  const el   = document.getElementById('import-history-list');
  if (!list.length) { el.innerHTML = '<p class="text-muted small">Henüz aktarım yapılmadı.</p>'; return; }
  el.innerHTML = '';
  list.slice(-10).reverse().forEach(imp => {
    const d = document.createElement('div');
    d.className = 'import-history-item';
    d.innerHTML = `<strong>${esc(imp.filename)}</strong> <span class="text-muted small ms-2">${new Date(imp.date).toLocaleDateString('tr-TR')}</span><br>
      <small class="text-muted">${imp.companyCount} firma · ${imp.contactCount} kişi · ${imp.totalRows||'?'} satır</small>`;
    el.appendChild(d);
  });
}

/* ===================== DASHBOARD ===================== */
