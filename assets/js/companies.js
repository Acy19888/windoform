// Split from app.js — Company CRUD operations and bulk management

/* ===================== FİRMALAR ===================== */
function clearCompanyFilters() {
  document.getElementById('company-search').value = '';
  document.getElementById('company-city-filter').value = '';
  document.getElementById('company-sector-filter').value = '';
  loadCompanies();
}

function clearContactFilters() {
  document.getElementById('contact-search').value = '';
  document.getElementById('contact-company-filter').value = '';
  document.getElementById('contact-status-filter').value = '';
  const dtEl = document.getElementById('contact-date-filter');
  if (dtEl) dtEl.value = '';
  const crEl = document.getElementById('contact-creator-filter');
  if (crEl) crEl.value = '';
  loadContacts();
}

/* ===================== FİRMALAR ===================== */
async function loadCompanies() {
  const [cos, cons] = await Promise.all([dbAll('companies'), dbAll('contacts')]);

  // Kişi sayısı Map
  const countMap = new Map();
  cons.forEach(cn => { if (cn.companyId) countMap.set(cn.companyId, (countMap.get(cn.companyId)||0)+1); });

  const s  = trLow(document.getElementById('company-search')?.value || '');
  const cf = document.getElementById('company-city-filter')?.value || '';
  const sf = document.getElementById('company-sector-filter')?.value || '';

  let f = cos.filter(c => {
    if (s && !trLow(c.name||'').includes(s) && !trLow(c.city||'').includes(s) && !trLow(c.sector||'').includes(s)) return false;
    if (cf && c.city !== cf) return false;
    if (sf && c.sector !== sf) return false;
    return true;
  });

  // Sıralama
  const { field, asc } = compSort;
  f.sort((a,b) => {
    let av, bv;
    if (field === 'name')     { av = trLow(a.name||''); bv = trLow(b.name||''); }
    else if (field === 'city'){ av = trLow(a.city||''); bv = trLow(b.city||''); }
    else if (field === 'contacts') { av = countMap.get(a.id)||0; bv = countMap.get(b.id)||0; }
    else if (field === 'quality')  { av = a.qualityScore||0; bv = b.qualityScore||0; }
    else { av = trLow(a.name||''); bv = trLow(b.name||''); }
    if (av < bv) return asc ? -1 : 1;
    if (av > bv) return asc ? 1 : -1;
    return 0;
  });

  document.getElementById('company-count').textContent = `(${f.length} firma)`;

  // Kişi filtresi dropdown
  const cs = document.getElementById('contact-company-filter');
  if (cs) {
    const prev = cs.value;
    cs.innerHTML = '<option value="">Tüm Firmalar</option>';
    [...new Set(cos.map(c=>c.name))].sort().forEach(n => {
      const o = document.createElement('option'); o.value = n; o.textContent = n; cs.appendChild(o);
    });
    cs.value = prev;
  }

  const b = document.getElementById('companies-table-body');
  if (f.length === 0) {
    b.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="bi bi-building"></i>${s||cf||sf?'Arama sonucu bulunamadı':'Henüz firma eklenmedi'}</div></td></tr>`;
    return;
  }

  const frag = document.createDocumentFragment();
  f.forEach(c => {
    const cc = countMap.get(c.id) || 0;
    const q = c.qualityScore || 0;
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.innerHTML = `
      <td onclick="event.stopPropagation()"><input type="checkbox" class="form-check-input" data-id="${c.id}" onchange="toggleCompanyRow(this)"></td>
      <td onclick="showCompanyModal(${c.id})">
        <strong>${esc(c.name)}</strong>
        ${c.sector ? `<span class="badge-sector ms-1">${esc(c.sector)}</span>` : ''}
        ${c.companyType === 'Alt Bayi' ? '<span class="badge ms-1" style="background:#dbeafe;color:#1d4ed8;font-size:10px;font-weight:600;">Alt Bayi</span>' : ''}
        ${(c.companyType === 'Ana Firma' || c.companyType === 'Ana \u00dcretici') ? '<span class="badge ms-1" style="background:#f0fdf4;color:#15803d;font-size:10px;font-weight:600;">' + esc(c.companyType) + '</span>' : ''}
      </td>
      <td onclick="showCompanyModal(${c.id})">${esc(c.city||'-')}${c.district?' / '+esc(c.district):''}</td>
      <td onclick="showCompanyModal(${c.id})">${cc}</td>
      <td onclick="showCompanyModal(${c.id})">
        <div class="d-flex align-items-center gap-1">
          <div class="quality-bar flex-grow-1"><div class="fill ${qualityClass(q)}" style="width:${q}%"></div></div>
          <small style="font-size:11px;color:#9ca3af;">${q}</small>
        </div>
      </td>
      <td><button class="icon-btn" onclick="showCompanyModal(${c.id})" title="Görüntüle"><i class="bi bi-eye"></i></button></td>`;
    frag.appendChild(tr);
  });
  b.innerHTML = '';
  b.appendChild(frag);
}

function sortCompanies(field) {
  if (compSort.field === field) compSort.asc = !compSort.asc;
  else { compSort.field = field; compSort.asc = true; }
  // Simgeleri güncelle
  document.querySelectorAll('[id^="sort-companies-"]').forEach(el => { el.textContent = '↕'; el.classList.remove('active'); });
  const ico = document.getElementById(`sort-companies-${field}`);
  if (ico) { ico.textContent = compSort.asc ? '↑' : '↓'; ico.classList.add('active'); }
  loadCompanies();
}

async function showCompanyModal(id) {
  const [c, cons] = await Promise.all([dbGet('companies', id), dbAll('contacts')]);
  if (!c) return;
  currentModalCompanyId = id;
  const employees = cons.filter(cc => cc.companyId === id);

  document.getElementById('comp-name').textContent = c.name;
  const qb = document.getElementById('comp-quality-badge');
  qb.textContent = `${c.qualityScore||0}%`;
  qb.className = `badge ${qualityBadgeClass(c.qualityScore||0)}`;

  document.getElementById('comp-phone-wrap').innerHTML   = phoneLink(c.phone, c.phoneNormalized);
  document.getElementById('comp-email-wrap').innerHTML   = emailLink(c.email);
  document.getElementById('comp-website-wrap').innerHTML = websiteLink(c.website);
  document.getElementById('comp-sector').textContent    = c.sector || '-';
  document.getElementById('comp-tax').textContent       = c.taxNumber || '-';

  // Faks
  const faxWrap = document.getElementById('comp-fax-wrap');
  if (faxWrap) faxWrap.style.display = c.fax ? '' : 'none';
  const faxEl = document.getElementById('comp-fax');
  if (faxEl) faxEl.textContent = c.fax || '';

  // Vergi Dairesi
  const taxOfficeWrap = document.getElementById('comp-tax-office-wrap');
  if (taxOfficeWrap) taxOfficeWrap.style.display = c.taxOffice ? '' : 'none';
  const taxOfficeEl = document.getElementById('comp-tax-office');
  if (taxOfficeEl) taxOfficeEl.textContent = c.taxOffice || '';

  // Adres — sadece bu firmanın kendi kaydından veya çalışanın adresinden al
  const _emp = employees.find(e => e.address || e.city);
  const _rawAddr = c.address || _emp?.address || '';

  // Şehir/Ülke: kayıtta yoksa adres metninden parse et
  function _parseAddrParts(addr) {
    if (!addr) return { city: '', country: '' };
    // US format: "Street, City, ST ZIP" veya "Street, City, ST ZIP, USA"
    const usM = addr.match(/,\s*([A-Za-z\s]+),\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?(?:\s*,?\s*USA?)?$/i);
    if (usM) return { city: usM[1].trim(), country: 'USA' };
    // Generic: son iki virgüllü parça
    const parts = addr.split(',').map(p => p.trim()).filter(Boolean);
    let city = '', country = '';
    if (parts.length >= 2) {
      const candidate = parts[parts.length - 2];
      if (!/^\d/.test(candidate)) city = candidate;
    }
    if (parts.length >= 1) {
      const last = parts[parts.length - 1];
      if (!/^\d/.test(last) && last.length > 2) country = last;
    }
    return { city, country };
  }

  const _parsed = _parseAddrParts(_rawAddr);
  const _addrEl     = document.getElementById('comp-address');
  const _cityEl     = document.getElementById('comp-city');
  const _districtEl = document.getElementById('comp-district');
  if (_addrEl)     _addrEl.textContent     = _rawAddr || '-';
  if (_cityEl)     _cityEl.textContent     = c.city    || _emp?.city    || _parsed.city    || '-';
  if (_districtEl) _districtEl.textContent = c.district || _emp?.district || '';

  // Mahalle
  const neighWrap = document.getElementById('comp-neighbourhood-wrap');
  const neighEl   = document.getElementById('comp-neighbourhood');
  if (neighWrap && neighEl) {
    if (c.neighbourhood) {
      neighEl.textContent = c.neighbourhood;
      neighWrap.style.display = '';
    } else {
      neighWrap.style.display = 'none';
      neighEl.textContent = '';
    }
  }

  // State / Posta Kodu / Ülke
  const stateWrap = document.getElementById('comp-state-wrap');
  if (stateWrap) { stateWrap.style.display = c.state ? '' : 'none'; }
  const stateEl = document.getElementById('comp-state');
  if (stateEl) stateEl.textContent = c.state || '';
  const postcodeWrap = document.getElementById('comp-postcode-wrap');
  if (postcodeWrap) { postcodeWrap.style.display = c.postcode ? '' : 'none'; }
  const postcodeEl = document.getElementById('comp-postcode');
  if (postcodeEl) postcodeEl.textContent = c.postcode || '';
  // Ülke — her zaman göster, adres parse fallback ile
  const countryEl = document.getElementById('comp-country');
  if (countryEl) countryEl.textContent = c.country || _emp?.country || _parsed.country || '-';
  const countryWrap = document.getElementById('comp-country-wrap');
  if (countryWrap) countryWrap.style.display = 'none';

  // Pazarlama Durumu
  const mktStatus = c.marketingStatus || 'Aranacak';
  const mktColors = {
    'Aranacak': 'bg-secondary', 'Arandı': 'bg-info text-dark',
    'Teklifte': 'bg-primary', 'Takipte': 'bg-warning text-dark',
    'Müşteri': 'bg-success', 'Hayır': 'bg-danger'
  };
  const mktBadge = document.getElementById('comp-marketing-status-badge');
  if (mktBadge) {
    mktBadge.textContent = mktStatus;
    mktBadge.className = 'badge fs-6 px-3 py-2 ' + (mktColors[mktStatus] || 'bg-secondary');
  }
  const headerMktBadge = document.getElementById('comp-marketing-badge');
  if (headerMktBadge) {
    headerMktBadge.textContent = mktStatus;
    headerMktBadge.className = 'badge ms-1 ' + (mktColors[mktStatus] || 'bg-secondary');
    headerMktBadge.style.fontSize = '11px';
  }
  const prioBadge = document.getElementById('comp-priority-badge');
  if (prioBadge) {
    if (c.priority && c.priority !== 'Normal') {
      prioBadge.textContent = c.priority;
      prioBadge.className = 'badge ms-1 ' + (c.priority === 'Yüksek' ? 'bg-danger' : c.priority === 'Düşük' ? 'bg-light text-dark' : 'bg-secondary');
      prioBadge.style.display = '';
    } else {
      prioBadge.style.display = 'none';
    }
  }

  // Sosyal Medya
  const socialWrap = document.getElementById('comp-social-wrap');
  const socialLinks = document.getElementById('comp-social-links');
  if (socialWrap && socialLinks) {
    const socials = [
      { key: 'linkedin',  icon: 'bi-linkedin',  label: 'LinkedIn', color: '#0a66c2' },
      { key: 'facebook',  icon: 'bi-facebook',  label: 'Facebook', color: '#1877f2' },
      { key: 'instagram', icon: 'bi-instagram', label: 'Instagram', color: '#e4405f' },
      { key: 'twitter',   icon: 'bi-twitter-x', label: 'Twitter/X', color: '#000' },
      { key: 'youtube',   icon: 'bi-youtube',   label: 'YouTube',  color: '#ff0000' }
    ];
    const socialHtml = socials.filter(s => c[s.key]).map(s => {
      const href = c[s.key].startsWith('http') ? c[s.key] : 'https://' + c[s.key];
      return `<a href="${href}" target="_blank" rel="noopener" class="btn btn-sm" style="background:${s.color};color:#fff;font-size:12px;padding:3px 10px;">
        <i class="bi ${s.icon} me-1"></i>${s.label}</a>`;
    }).join('');
    if (socialHtml) {
      socialLinks.innerHTML = socialHtml;
      socialWrap.style.display = '';
    } else {
      socialWrap.style.display = 'none';
    }
  }

  // İş Metrikleri
  const metricsWrap = document.getElementById('comp-metrics-wrap');
  const hasMetrics = c.revenue || c.employees || c.sic || c.naics;
  if (metricsWrap) metricsWrap.style.display = hasMetrics ? '' : 'none';
  const _showMetricField = (wrapId, elId, val) => {
    const w = document.getElementById(wrapId);
    const e = document.getElementById(elId);
    if (w) w.style.display = val ? '' : 'none';
    if (e) e.textContent = val || '';
  };
  _showMetricField('comp-revenue-wrap',   'comp-revenue',   c.revenue);
  _showMetricField('comp-employees-wrap', 'comp-employees', c.employees ? c.employees.toLocaleString('tr-TR') : null);
  _showMetricField('comp-sic-wrap',       'comp-sic',       c.sic);
  _showMetricField('comp-naics-wrap',     'comp-naics',     c.naics);

  // Açıklama
  const descWrap = document.getElementById('comp-description-wrap');
  const descEl   = document.getElementById('comp-description');
  if (descWrap && descEl) {
    if (c.description) {
      descEl.textContent = c.description;
      descWrap.style.display = '';
    } else {
      descWrap.style.display = 'none';
      descEl.textContent = '';
    }
  }

  // Hiyerarşi bilgisi — varsa göster
  const hierEl = document.getElementById('comp-hierarchy-info');
  if (hierEl) {
    if (c.companyType && c.companyType !== 'Normal') {
      let hierHtml = '<div class="modal-section-title mt-2">Firma Türü</div>';
      const typeColors = {'Ana Firma':'#f0fdf4;color:#15803d', 'Ana Üretici':'#fdf4ff;color:#7c3aed', 'Alt Bayi':'#dbeafe;color:#1d4ed8'};
      const tColor = typeColors[c.companyType] || '#f8fafc;color:#374151';
      hierHtml += '<span class="badge" style="background:' + tColor + ';font-size:12px;font-weight:600;padding:5px 10px;">' + esc(c.companyType) + '</span>';
      if (c.parentCompanyId) {
        hierHtml += '<br><small class="text-muted mt-1 d-block">Bağlı Firma: <span class="badge-company" style="cursor:pointer;" onclick="showCompanyModal(' + c.parentCompanyId + ');bootstrap.Modal.getInstance(document.getElementById(\\\"compModal\\\")).hide();">ID #' + c.parentCompanyId + '</span></small>';
      }
      hierEl.innerHTML = hierHtml;
      hierEl.style.display = '';
    } else {
      hierEl.innerHTML = '';
      hierEl.style.display = 'none';
    }
  }

  // Harita — HER açılışta temizle
  const mapsEl = document.getElementById('comp-maps-links');
  if (c.lat && c.lon) {
    mapsEl.innerHTML = `<small class="text-muted">Harita: </small>
      <a href="https://maps.google.com/?q=${c.lat},${c.lon}" target="_blank" class="me-2">Google Maps</a>
      <a href="https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lon}" target="_blank" class="me-2">OSM</a>
      <a href="https://maps.apple.com/?ll=${c.lat},${c.lon}" target="_blank">Apple Maps</a>`;
  } else {
    mapsEl.innerHTML = '';
  }

  // Statik harita (enlem/boylam varsa)
  const staticMapEl = document.getElementById('comp-static-map');
  if (c.lat && c.lon) {
    const smUrl = 'https://staticmap.openstreetmap.de/staticmap.php?center=' +
      c.lat + ',' + c.lon + '&zoom=16&size=400x180&markers=' + c.lat + ',' + c.lon + ',red-pushpin';
    staticMapEl.innerHTML = '<a href="https://www.google.com/maps?q=' + c.lat + ',' + c.lon +
      '" target="_blank"><img src="' + smUrl + '" style="width:100%;border-radius:6px;" ' +
      'alt="Harita" onerror="this.parentElement.parentElement.style.display=\'none\'"></a>';
    staticMapEl.style.display = '';
  } else {
    staticMapEl.style.display = 'none';
    staticMapEl.innerHTML = '';
  }

  // Firma fotograflari
  const photoWrap   = document.getElementById('comp-photo-wrap');
  const photoGallery = document.getElementById('comp-photo-gallery');
  const photosStrip  = document.getElementById('comp-photos-strip');
  photoWrap.innerHTML = '';
  if (c.photos && c.photos.length > 0) {
    photoGallery.style.display = '';
    photosStrip.innerHTML = c.photos.map((src, i) =>
      '<img src="' + src + '" alt="Foto ' + (i+1) + '" style="height:120px;border-radius:6px;object-fit:cover;cursor:pointer;" ' +
      'onclick="window.open(this.src)">'
    ).join('');
  } else {
    photoGallery.style.display = 'none';
    photosStrip.innerHTML = '';
  }

  // Notlar
  const notesWrapEl = document.getElementById('comp-notes-wrap');
  const notesEl     = document.getElementById('comp-notes');
  if (notesWrapEl && notesEl) {
    if (c.notes) {
      notesEl.textContent    = c.notes;
      notesWrapEl.style.display = '';
    } else {
      notesWrapEl.style.display = 'none';
      notesEl.textContent    = '';
    }
  }

  document.getElementById('comp-contact-count').textContent = employees.length;
  const cl = document.getElementById('comp-contacts-list');
  if (employees.length === 0) {
    cl.innerHTML = '<p class="text-muted small">Bu firmaya bağlı kişi yok.</p>';
  } else {
    cl.innerHTML = '';
    const frag = document.createDocumentFragment();
    employees.forEach(cc => {
      const d = document.createElement('div');
      d.className = 'contact-row';
      d.innerHTML = `
        <div class="contact-info">
          <strong style="cursor:pointer;" onclick="showContactModal(${cc.id});bootstrap.Modal.getOrCreateInstance(document.getElementById('compModal')).hide();">${esc(cc.name)}</strong>
          ${cc.title ? `<small class="text-muted ms-1">— ${esc(cc.title)}</small>` : ''}
          <br><small class="text-muted">${cc.phone ? phoneLink(cc.phone, cc.phoneNormalized) : '-'}</small>
        </div>`;
      frag.appendChild(d);
    });
    cl.appendChild(frag);
  }
  // Adres güncelle panelini her açılışta kapat
  document.getElementById('comp-update-panel').style.display = 'none';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('compModal')).show();
}

function editCompanyModal() {
  (async () => {
    const c = await dbGet('companies', currentModalCompanyId);
    if (!c) return;
    document.getElementById('ec-id').value              = c.id;
    document.getElementById('ec-name').value            = c.name || '';
    document.getElementById('ec-sector').value          = c.sector || '';
    document.getElementById('ec-phone').value           = c.phone || '';
    document.getElementById('ec-fax').value             = c.fax || '';
    document.getElementById('ec-email').value           = c.email || '';
    document.getElementById('ec-website').value         = c.website || '';
    document.getElementById('ec-tax').value             = c.taxNumber || '';
    document.getElementById('ec-tax-office').value      = c.taxOffice || '';
    document.getElementById('ec-address').value         = c.address || '';
    document.getElementById('ec-city').value            = c.city || '';
    document.getElementById('ec-district').value        = c.district || '';
    document.getElementById('ec-postcode').value        = c.postcode || '';
    const _ecCountry = document.getElementById('ec-country');
    if (_ecCountry) _ecCountry.value = c.country || 'Türkiye';
    initAddressAutocomplete('ec-address','ec-city','ec-postcode','ec-country');
    document.getElementById('ec-lat').value             = c.lat || '';
    document.getElementById('ec-lon').value             = c.lon || '';
    document.getElementById('ec-employees').value       = c.employees || '';
    document.getElementById('ec-revenue').value         = c.revenue || '';
    document.getElementById('ec-linkedin').value        = c.linkedin || '';
    document.getElementById('ec-instagram').value       = c.instagram || '';
    document.getElementById('ec-facebook').value        = c.facebook || '';
    document.getElementById('ec-twitter').value         = c.twitter || '';
    document.getElementById('ec-description').value     = c.description || '';
    document.getElementById('ec-notes').value           = c.notes || '';
    const mktEl = document.getElementById('ec-marketing-status');
    if (mktEl) mktEl.value = c.marketingStatus || 'Aranacak';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('compModal')).hide();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('editCompModal')).show();
  })();
}

function setMarketingStatus(status) {
  (async () => {
    const id = currentModalCompanyId;
    if (!id) return;
    const c = await dbGet('companies', id);
    if (!c) return;
    const updated = Object.assign({}, c, { marketingStatus: status, updatedAt: new Date().toISOString() });
    await dbPut('companies', updated);
    // Update modal badges
    const mktColors = {
      'Aranacak': 'bg-secondary', 'Arandı': 'bg-info text-dark',
      'Teklifte': 'bg-primary', 'Takipte': 'bg-warning text-dark',
      'Müşteri': 'bg-success', 'Hayır': 'bg-danger'
    };
    const cls = 'badge fs-6 px-3 py-2 ' + (mktColors[status] || 'bg-secondary');
    const mktBadge = document.getElementById('comp-marketing-status-badge');
    if (mktBadge) { mktBadge.textContent = status; mktBadge.className = cls; }
    const headerMktBadge = document.getElementById('comp-marketing-badge');
    if (headerMktBadge) {
      headerMktBadge.textContent = status;
      headerMktBadge.className = 'badge ms-1 ' + (mktColors[status] || 'bg-secondary');
    }
    toast('✓ ' + status + ' olarak işaretlendi', 'success');
    // Refresh list in background
    loadCompanies().catch(() => {});
  })();
}

// ── Adres Kontrol Paneli ─────────────────────────────────────────────────────
function toggleUpdatePanel() {
  const panel = document.getElementById('comp-update-panel');
  const visible = panel.style.display !== 'none';
  if (visible) {
    panel.style.display = 'none';
    return;
  }
  // Paneli aç ve mevcut değerleri doldur
  (async () => {
    const c = await dbGet('companies', currentModalCompanyId);
    if (!c) return;

    // Arama linkleri oluştur
    const q   = encodeURIComponent(c.name + (c.city ? ' ' + c.city : ''));
    const qAd = encodeURIComponent((c.name || '') + ' adres telefon');
    const links = [
      { label:'Google',      icon:'bi-google',       url:`https://www.google.com/search?q=${qAd}` },
      { label:'Google Maps', icon:'bi-map-fill',     url:`https://www.google.com/maps/search/${q}` },
      { label:'Yandex',      icon:'bi-search',       url:`https://yandex.com.tr/search/?text=${qAd}` },
      { label:'Yandex Hrt.', icon:'bi-pin-map-fill', url:`https://yandex.com.tr/harita/?text=${q}` },
      { label:'LinkedIn',    icon:'bi-linkedin',     url:`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(c.name)}` },
      { label:'Şirket Bilgi',icon:'bi-building',     url:`https://www.google.com/search?q=${encodeURIComponent(c.name+' vergi no şirket bilgi')}` },
    ];
    const linksEl = document.getElementById('comp-search-links');
    linksEl.innerHTML = '';
    links.forEach(lk => {
      const a = document.createElement('a');
      a.href   = lk.url;
      a.target = '_blank';
      a.rel    = 'noopener noreferrer';
      a.className = 'btn btn-outline-secondary btn-sm';
      a.innerHTML = `<i class="bi ${lk.icon} me-1"></i>${esc(lk.label)}`;
      linksEl.appendChild(a);
    });

    // Mevcut değerleri doldur — Firma adresi yoksa çalışan kaydından al
    const allCons2 = typeof dbAll === 'function' ? await dbAll('contacts').catch(() => []) : [];
    const empFallback = allCons2.find(e => e.companyId === currentModalCompanyId && (e.address || e.city));
    const _cuRawAddr = c.address || empFallback?.address || '';
    // Adres metninden şehir/ülke parse et
    const _cuParsed = (function(addr) {
      if (!addr) return { city: '', country: '' };
      const usM = addr.match(/,\s*([A-Za-z\s]+),\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?(?:\s*,?\s*USA?)?$/i);
      if (usM) return { city: usM[1].trim(), country: 'USA' };
      const parts = addr.split(',').map(p => p.trim()).filter(Boolean);
      let city = '', country = '';
      if (parts.length >= 2 && !/^\d/.test(parts[parts.length-2])) city = parts[parts.length-2];
      if (parts.length >= 1 && !/^\d/.test(parts[parts.length-1]) && parts[parts.length-1].length > 2) country = parts[parts.length-1];
      return { city, country };
    })(_cuRawAddr);
    document.getElementById('cu-address').value       = _cuRawAddr;
    document.getElementById('cu-neighbourhood').value = c.neighbourhood  || empFallback?.neighbourhood || '';
    document.getElementById('cu-city').value          = c.city          || empFallback?.city          || _cuParsed.city    || '';
    document.getElementById('cu-district').value      = c.district      || empFallback?.district      || '';
    document.getElementById('cu-phone').value         = c.phone         || '';
    document.getElementById('cu-email').value         = c.email         || '';
    document.getElementById('cu-website').value       = c.website       || '';
    document.getElementById('cu-lat').value           = c.lat           || empFallback?.lat           || '';
    document.getElementById('cu-lon').value           = c.lon           || empFallback?.lon           || '';

    panel.style.display = '';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  })();
}

async function saveCompanyContactUpdate() {
  const id = currentModalCompanyId;
  if (!id) return;
  const c = await dbGet('companies', id);
  if (!c) return;

  const address       = document.getElementById('cu-address').value.trim()       || null;
  const neighbourhood = document.getElementById('cu-neighbourhood').value.trim() || null;
  const city          = document.getElementById('cu-city').value.trim()          || null;
  const district      = document.getElementById('cu-district').value.trim()      || null;
  const phone         = document.getElementById('cu-phone').value.trim()         || null;
  const email         = document.getElementById('cu-email').value.trim()         || null;
  const website       = document.getElementById('cu-website').value.trim()       || null;
  const latVal        = parseFloat(document.getElementById('cu-lat').value)      || null;
  const lonVal        = parseFloat(document.getElementById('cu-lon').value)      || null;

  const pd = phone ? normalizePhone(phone) : {valid:false, normalized:null, type:null};

  const updated = {
    ...c,
    address, neighbourhood, city, district,
    phone,
    phoneNormalized: pd.normalized || null,
    phoneValid:      pd.valid,
    phoneType:       pd.type || null,
    email, website,
    lat: latVal !== null ? latVal : (c.lat || null),
    lon: lonVal !== null ? lonVal : (c.lon || null),
    photoUrl: c.photoUrl || null,
    updatedAt: new Date().toISOString()
  };
  updated.qualityScore = calculateCompanyQuality(updated);

  await dbPut('companies', updated);
  if (typeof syncToFirestore === 'function') syncToFirestore();

  // Modalı güncelle (kapamadan)
  document.getElementById('comp-address').textContent  = address  || '-';
  document.getElementById('comp-city').textContent     = city     || '-';
  document.getElementById('comp-district').textContent = district || '-';
  const neighWrap2 = document.getElementById('comp-neighbourhood-wrap');
  const neighEl2   = document.getElementById('comp-neighbourhood');
  if (neighWrap2 && neighEl2) {
    neighEl2.textContent = neighbourhood || '';
    neighWrap2.style.display = neighbourhood ? '' : 'none';
  }
  document.getElementById('comp-phone-wrap').innerHTML = phoneLink(phone, pd.normalized);
  document.getElementById('comp-email-wrap').innerHTML = emailLink(email);
  document.getElementById('comp-website-wrap').innerHTML = websiteLink(website);
  const qb = document.getElementById('comp-quality-badge');
  qb.textContent = `${updated.qualityScore||0}%`;
  qb.className   = `badge ${qualityBadgeClass(updated.qualityScore||0)}`;

  // Paneli kapat
  document.getElementById('comp-update-panel').style.display = 'none';

  toast(`✓ "${updated.name}" güncellendi`, 'success');
}
// ─────────────────────────────────────────────────────────────────────────────

function deleteCompanyModal() {
  (async () => {
    const c    = await dbGet('companies', currentModalCompanyId);
    const cons = await dbAll('contacts');
    const emp  = cons.filter(cc => cc.companyId === currentModalCompanyId);
    if (!confirm(`"${c?.name}" firmasını silmek istiyor musunuz?\n(${emp.length} çalışan da silinecek)`)) return;
    await dbDelete('companies', currentModalCompanyId);
    for (const cc of emp) await dbDelete('contacts', cc.id);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('compModal')).hide();
    toast(`"${c?.name}" firması silindi`);
    await loadCompanies();
  })();
}

async function saveCompany(e) {
  e.preventDefault();
  const ph = document.getElementById('ac-phone').value;
  const pd = normalizePhone(ph);
  const c = buildCompanyObj('ac', null, pd, ph);
  c.createdAt = new Date().toISOString();
  c.qualityScore = calculateCompanyQuality(c);
  await dbAdd('companies', c);
  toast('Firma eklendi');
  showPage('companies');
}

async function saveEditedCompany() {
  const ph = document.getElementById('ec-phone').value;
  const pd = normalizePhone(ph);
  const oldId = parseInt(document.getElementById('ec-id').value);
  const existing = await dbGet('companies', oldId);
  const c = buildCompanyObj('ec', oldId, pd, ph);
  c.createdAt   = existing?.createdAt || new Date().toISOString();
  c.sourceFile  = existing?.sourceFile || null;
  c.qualityScore = calculateCompanyQuality(c);
  await dbPut('companies', c);
  toast('Firma güncellendi');
  bootstrap.Modal.getOrCreateInstance(document.getElementById('editCompModal')).hide();
  await loadCompanies();
}

function _getVal(id) {
  const el = document.getElementById(id);
  return el ? (el.value.trim() || null) : null;
}

function buildCompanyObj(pre, id, pd, ph) {
  const o = {
    name:             _getVal(`${pre}-name`) || '',
    sector:           _getVal(`${pre}-sector`),
    phone:            ph || null,
    phoneNormalized:  pd.normalized || null,
    phoneValid:       pd.valid,
    phoneType:        pd.type || null,
    fax:              _getVal(`${pre}-fax`),
    email:            _getVal(`${pre}-email`),
    website:          _getVal(`${pre}-website`),
    taxNumber:        _getVal(`${pre}-tax`),
    taxOffice:        _getVal(`${pre}-tax-office`),
    address:          _getVal(`${pre}-address`),
    city:             _getVal(`${pre}-city`),
    district:         _getVal(`${pre}-district`),
    postcode:         _getVal(`${pre}-postcode`),
    lat:              parseFloat(document.getElementById(`${pre}-lat`)?.value) || null,
    lon:              parseFloat(document.getElementById(`${pre}-lon`)?.value) || null,
    employees:        _getVal(`${pre}-employees`),
    revenue:          _getVal(`${pre}-revenue`),
    linkedin:         _getVal(`${pre}-linkedin`),
    instagram:        _getVal(`${pre}-instagram`),
    facebook:         _getVal(`${pre}-facebook`),
    twitter:          _getVal(`${pre}-twitter`),
    description:      _getVal(`${pre}-description`),
    notes:            _getVal(`${pre}-notes`),
    marketingStatus:  _getVal(`${pre}-marketing-status`) || 'Aranacak',
    country:          _getVal(`${pre}-country`) || 'Türkiye',
    updatedAt:        new Date().toISOString(),
    errors:           []
  };
  if (id !== null) o.id = id;
  return o;
}
function toggleCompanyRow(cb) { cb.checked ? selectedCompIds.add(+cb.dataset.id) : selectedCompIds.delete(+cb.dataset.id); updateCompanyBulkBar(); }
function toggleCompanySelectAll() { const a=document.getElementById('company-select-all').checked; document.querySelectorAll('#companies-table-body input[type="checkbox"]').forEach(cb=>{cb.checked=a;toggleCompanyRow(cb);}); }
function clearCompanySelection() { selectedCompIds.clear(); document.querySelectorAll('#companies-table-body input[type="checkbox"]').forEach(cb=>cb.checked=false); document.getElementById('company-select-all').checked=false; updateCompanyBulkBar(); }
function updateCompanyBulkBar() { const b=document.getElementById('company-bulk-bar'); b.classList.toggle('show',selectedCompIds.size>0); document.getElementById('company-bulk-count').textContent=`${selectedCompIds.size} firma seçildi`; }
async function bulkDeleteCompanies() {
  if (!confirm(`${selectedCompIds.size} firmayı (ve bağlı kişileri) silmek istiyor musunuz?`)) return;
  showLoading('Siliniyor…');
  const cons = await dbAll('contacts');
  for (const id of selectedCompIds) {
    await dbDelete('companies', id);
    for (const c of cons.filter(cc=>cc.companyId===id)) await dbDelete('contacts',c.id);
  }
  toast(`${selectedCompIds.size} firma silindi`);
  clearCompanySelection();
  hideLoading();
  await loadCompanies();
}

