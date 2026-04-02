// Split from app.js — Contact CRUD operations and bulk management

/* ===================== KİŞİLER ===================== */
async function loadContacts() {
  const [cons, cos] = await Promise.all([dbAll('contacts'), dbAll('companies')]);
  const compMap = new Map(cos.map(c => [c.id, c]));

  const s   = trLow(document.getElementById('contact-search')?.value || '');
  const cf  = document.getElementById('contact-company-filter')?.value || '';
  const st  = document.getElementById('contact-status-filter')?.value || '';
  const dtf = document.getElementById('contact-date-filter')?.value || '';
  const crf = document.getElementById('contact-creator-filter')?.value || '';

  // Populate creator filter from fuarEmployees Firestore collection
  const creatorSel = document.getElementById('contact-creator-filter');
  if (creatorSel && creatorSel.dataset.loaded !== 'true') {
    try {
      const cfg = (typeof loadFbConfig === 'function') ? loadFbConfig() : null;
      if (cfg?.apiKey && cfg?.projectId) {
        const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/fuarEmployees?key=${cfg.apiKey}&pageSize=100`;
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          const docs = data.documents || [];
          const curVal = creatorSel.value;
          const employees = docs.map(d => {
            const f = d.fields || {};
            const email = f.email?.stringValue || f.emailAddress?.stringValue || '';
            const name  = f.name?.stringValue || f.displayName?.stringValue || '';
            return { email, name };
          }).filter(e => e.email);
          employees.sort((a,b) => (a.name||a.email).localeCompare(b.name||b.email));
          creatorSel.innerHTML = '<option value="">Tüm Ekleyenler</option>' +
            employees.map(e => {
              const label = e.name || e.email.split('@')[0];
              return `<option value="${esc(e.email)}" ${e.email === curVal ? 'selected' : ''}>${esc(label)}</option>`;
            }).join('');
          creatorSel.dataset.loaded = 'true';
        }
      }
    } catch (_) {
      // Fallback: populate from existing contacts
      const allCreators = [...new Set(cons.map(c => c.createdBy).filter(Boolean))].sort();
      const curVal = creatorSel.value;
      creatorSel.innerHTML = '<option value="">Tüm Ekleyenler</option>' +
        allCreators.map(cr => {
          const label = cr.includes('@') ? cr.split('@')[0] : cr;
          return `<option value="${esc(cr)}" ${cr === curVal ? 'selected' : ''}>${esc(label)}</option>`;
        }).join('');
    }
  }

  // Date range for filter
  const now = new Date();
  const dateFrom = dtf === 'today' ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
                 : dtf === 'week'  ? new Date(now - 7 * 86400000)
                 : dtf === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1)
                 : null;

  let f = cons.filter(c => {
    if (s && !trLow(c.name||'').includes(s) && !trLow(c.title||'').includes(s) && !trLow(c.phone||'').includes(s)) return false;
    const co = compMap.get(c.companyId);
    if (cf && (!co || co.name !== cf)) return false;
    if (st && c.status !== st) return false;
    if (dateFrom && c.createdAt && new Date(c.createdAt) < dateFrom) return false;
    if (crf && c.createdBy !== crf) return false;
    return true;
  });

  // Sıralama
  const { field, asc } = contSort;
  f.sort((a,b) => {
    let av, bv;
    if (field === 'quality')   { av = a.qualityScore||0; bv = b.qualityScore||0; }
    else if (field === 'createdAt') { av = a.createdAt||''; bv = b.createdAt||''; }
    else                       { av = trLow(a.name||''); bv = trLow(b.name||''); }
    if (av < bv) return asc ? -1 : 1;
    if (av > bv) return asc ? 1 : -1;
    return 0;
  });

  document.getElementById('contact-count').textContent = `(${f.length} kişi)`;
  const b = document.getElementById('contacts-table-body');

  if (f.length === 0) {
    b.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="bi bi-people"></i>${s||cf||st||dtf?'Arama sonucu bulunamadı':'Henüz kişi eklenmedi'}</div></td></tr>`;
    return;
  }

  const frag = document.createDocumentFragment();
  const statusColors = { 'Aktif':'success', 'Pasif':'secondary', 'Aday':'info' };
  f.forEach(c => {
    const co  = compMap.get(c.companyId);
    const q   = c.qualityScore || 0;
    const sbc = statusColors[c.status] || 'secondary';
    const tr  = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.innerHTML = `
      <td onclick="event.stopPropagation()"><input type="checkbox" class="form-check-input" data-id="${c.id}" onchange="toggleContactRow(this)"></td>
      <td onclick="showContactModal(${c.id})">
        <strong>${esc(c.name)}</strong>
        ${c.title ? `<br><small class="text-muted">${esc(c.title)}</small>` : ''}
      </td>
      <td onclick="showContactModal(${c.id})">${co ? `<span class="badge-company" onclick="event.stopPropagation();showCompanyModal(${co.id})">${esc(co.name)}</span>` : '-'}</td>
      <td onclick="showContactModal(${c.id})">${c.phone ? `<small>${esc(c.phone)}</small>` : '-'}</td>
      <td onclick="showContactModal(${c.id})"><span class="badge bg-${sbc} bg-opacity-10 text-${sbc}" style="font-size:11px;">${c.status||'-'}</span></td>
      <td onclick="showContactModal(${c.id})">
        <div class="d-flex align-items-center gap-1">
          <div class="quality-bar flex-grow-1"><div class="fill ${qualityClass(q)}" style="width:${q}%"></div></div>
          <small style="font-size:11px;color:#9ca3af;">${q}</small>
        </div>
      </td>
      <td onclick="showContactModal(${c.id})" style="font-size:11px;color:#9ca3af;white-space:nowrap;">
        <div>${c.createdAt ? new Date(c.createdAt).toLocaleDateString('tr-TR') : '-'}</div>
        ${c.createdBy ? `<div style="color:#6366f1;font-weight:500;">${esc(c.createdBy.includes('@') ? c.createdBy.split('@')[0] : c.createdBy)}</div>` : ''}
      </td>
      <td><button class="icon-btn" onclick="showContactModal(${c.id})" title="Görüntüle"><i class="bi bi-eye"></i></button></td>`;
    frag.appendChild(tr);
  });
  b.innerHTML = '';
  b.appendChild(frag);
}

function sortContacts(field) {
  if (contSort.field === field) contSort.asc = !contSort.asc;
  else { contSort.field = field; contSort.asc = true; }
  document.querySelectorAll('[id^="sort-contacts-"]').forEach(el => { el.textContent = '↕'; el.classList.remove('active'); });
  const ico = document.getElementById(`sort-contacts-${field}`);
  if (ico) { ico.textContent = contSort.asc ? '↑' : '↓'; ico.classList.add('active'); }
  loadContacts();
}

async function showContactModal(id) {
  const c = await dbGet('contacts', id);
  if (!c) return;
  currentModalContactId = id;
  // Expose contact for email compose button in modal footer
  if (typeof window !== 'undefined') window._emContactRef = c;
  const co = c.companyId ? await dbGet('companies', c.companyId) : null;

  // ── Call / WhatsApp buttons ──
  const rawPhone = c.phoneNormalized || c.phone || '';
  const waPhone  = rawPhone.replace(/\D/g, '');
  const callBtn  = document.getElementById('cont-call-btn');
  const waBtn    = document.getElementById('cont-wa-btn');
  if (callBtn) {
    callBtn.href = rawPhone ? `tel:${rawPhone}` : '#';
    callBtn.classList.toggle('cont-act-disabled', !rawPhone);
  }
  if (waBtn) {
    waBtn.href = waPhone ? `https://wa.me/${waPhone}` : '#';
    waBtn.classList.toggle('cont-act-disabled', !waPhone);
  }

  // ── Avatar initials ──
  const initials = (c.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const avatarEl = document.getElementById('cont-avatar');
  if (avatarEl) avatarEl.textContent = initials;

  // ── Hero name (large) ──
  const heroNameEl = document.getElementById('cont-name');
  if (heroNameEl) heroNameEl.textContent = c.name || '—';

  // ── Status dot color ──
  const statusDotEl = document.getElementById('cont-status-icon');
  if (statusDotEl) {
    const statusColors = { 'Aktif':'#4ade80', 'VIP':'#f59e0b', 'Pasif':'#94a3b8', 'Soğuk':'#60a5fa', 'Potansiyel':'#a78bfa' };
    statusDotEl.style.color = statusColors[c.status] || '#94a3b8';
  }

  // ── Subtitle: title · company ──
  const subtitleEl = document.getElementById('cont-title-sub');
  if (subtitleEl) {
    const parts = [c.title, co?.name].filter(Boolean);
    subtitleEl.textContent = parts.join(' · ') || '';
  }

  // ── Quality bar ──
  const freshScore = calculateContactQuality(c);
  const qPct = document.getElementById('cont-quality-pct');
  if (qPct) qPct.textContent = `${freshScore}%`;
  const qBar = document.getElementById('cont-quality-bar');
  if (qBar) { setTimeout(() => { qBar.style.width = `${freshScore}%`; }, 80); }

  // ── Left panel property fields ──
  const _setPropText = (field, val) => {
    const row = document.querySelector(`.cont-prop-val[data-field="${field}"] .cont-prop-text`);
    if (row) row.textContent = val || '-';
  };
  _setPropText('name', c.name);
  _setPropText('title', c.title);
  _setPropText('company', co?.name);
  _setPropText('status', c.status);
  _setPropText('notes', c.notes);

  // ── Address section ──
  const addrSection = document.getElementById('cont-address-section');
  const addrRow     = document.getElementById('cont-address-row');
  const cityRow     = document.getElementById('cont-city-row');
  const addrText    = document.getElementById('cont-address-text');
  const cityText    = document.getElementById('cont-city-country-text');
  // Resolve address from contact or fall back to linked company
  const resolvedAddr    = c.address    || co?.address    || null;
  const resolvedCity    = c.city       || co?.city       || null;
  const resolvedCountry = c.country    || co?.country    || null;
  const resolvedPostcode= c.postcode   || co?.postcode   || null;
  const hasAddr = resolvedAddr || resolvedCity || resolvedCountry;
  if (addrSection) addrSection.style.display = hasAddr ? '' : 'none';
  if (addrRow && addrText) {
    if (resolvedAddr) {
      addrRow.style.display = '';
      addrText.textContent  = resolvedAddr;
    } else { addrRow.style.display = 'none'; }
  }
  if (cityRow && cityText) {
    const cityParts = [resolvedCity, resolvedPostcode ? `(${resolvedPostcode})` : '', resolvedCountry].filter(Boolean).join(' · ');
    if (cityParts) {
      cityRow.style.display = '';
      cityText.textContent  = cityParts;
    } else { cityRow.style.display = 'none'; }
  }

  // Phone / email use innerHTML for links
  const phoneWrap = document.getElementById('cont-phone-wrap');
  if (phoneWrap) phoneWrap.innerHTML = phoneLink(c.phone, c.phoneNormalized) || c.phone || '-';
  const emailWrap = document.getElementById('cont-email-wrap');
  if (emailWrap) emailWrap.innerHTML = emailLink(c.email) || c.email || '-';

  // Metadata
  const createdEl = document.getElementById('cont-created-at');
  if (createdEl) {
    const d = c.createdAt ? new Date(c.createdAt) : null;
    createdEl.textContent = d ? d.toLocaleDateString('tr-TR', {day:'2-digit',month:'short',year:'numeric'}) : '-';
  }
  const sourceEl = document.getElementById('cont-source');
  if (sourceEl) {
    let src = c.source || c.sourceTag || '';
    // Fallback: extract from notes "Fuarbot: <EventName>" for older contacts
    if (!src && c.notes) {
      const m = c.notes.match(/^Fuarbot:\s*(.+?)(\n|$)/);
      if (m) src = m[1].replace(/^Fuarbot:\s*/i, '').trim();
    }
    sourceEl.textContent = src || '-';
  }

  const createdByEl = document.getElementById('cont-created-by');
  if (createdByEl) {
    const cb = c.createdBy || '';
    createdByEl.textContent = cb ? (cb.includes('@') ? cb.split('@')[0] + ' (' + cb + ')' : cb) : '-';
  }

  // Reset to Timeline tab
  contSwitchTab('timeline');

  // ── Find matching Fuarbot customer by email or name ──
  const email   = (c.email || '').toLowerCase().trim();
  const nameLow = (c.name  || '').toLowerCase().trim();
  const _fbMatch = arr => arr && arr.find(x =>
    (email   && (x.email||'').toLowerCase().trim() === email) ||
    (nameLow && (x.name ||'').toLowerCase().trim() === nameLow)
  );
  // Try in-memory first (filtered list + full raw list including already-imported)
  let fbCust = _fbMatch(typeof fbCustomers !== 'undefined' ? fbCustomers : null)
            || _fbMatch(typeof fbAllCustomersRaw !== 'undefined' ? fbAllCustomersRaw : null);

  // ── Timeline/Quotes placeholder shown immediately ─────
  const tlContent = document.getElementById('cont-timeline-content');
  const tlBadge   = document.getElementById('cont-timeline-badge');
  const qContent  = document.getElementById('cont-quotes-content');
  const qBadge    = document.getElementById('cont-quotes-badge');
  tlContent.innerHTML = '<div class="text-muted small text-center py-4"><i class="bi bi-hourglass-split me-2 opacity-25"></i>Yükleniyor…</div>';

  // ── Helper: render timeline + quotes + CRM notes from current memory ─
  const _renderFbPanels = () => {
    const fbActs = fbCust && typeof fbActivities !== 'undefined' ? (fbActivities[fbCust._id] || []) : [];
    const fbQts  = fbCust && typeof fbQuotes     !== 'undefined' ? (fbQuotes[fbCust._id]     || []) : [];

    // Convert quotes to timeline items
    const _sym = (typeof SYM !== 'undefined') ? SYM : {EUR:'€',USD:'$',TRY:'₺',GBP:'£'};
    const qtAsActs = fbQts.map(q => {
      const cur  = _sym[q.currency] || q.currency || '€';
      const amt  = q.totalNet != null ? Number(q.totalNet).toLocaleString('tr-TR',{minimumFractionDigits:2})+' '+cur : '';
      const statusLabel = q.status === 'sent' ? '✓ Gönderildi' : 'Taslak';
      return { type:'quote', createdAt:q.createdAt, text:[q.quoteNumber||'Teklif',amt,statusLabel].filter(Boolean).join(' · ') };
    });

    // CRM notes from crm_notes collection (stored by email.js after fetch)
    const crmNotes = Array.isArray(window._cmNotes) ? window._cmNotes : [];
    const notesAsActs = crmNotes.map(n => ({
      type: 'note',
      createdAt: n.createdAt,
      text: n.text,
      createdBy: n.createdBy,
      _noteColor: n.color,
      _notePinned: n.pinned,
    }));

    // E-Mails aus dem Kontakt-E-Mail-Tab als Timeline-Einträge
    const crmEmails = Array.isArray(window._cmEmails) ? window._cmEmails : [];
    const emailsAsActs = crmEmails.map(em => ({
      type:      'email',
      createdAt: em.sentAt || em.createdAt || '',
      text:      (em.direction === 'outbound' ? '↑ ' : '↓ ') + (em.subject || '(Konu yok)'),
      createdBy: em.direction === 'outbound' ? (em.createdBy || '') : '',
      message:   (typeof _htmlToText === 'function' ? _htmlToText(em.html || em.text || '') : (em.text || (em.html||'').replace(/<style[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim())).slice(0, 300),
      _emailId:  em._id,
      _emailDir: em.direction,
    }));

    const allTlItems = [...fbActs, ...qtAsActs, ...notesAsActs, ...emailsAsActs]
      .sort((a,b) => (b.createdAt||'') > (a.createdAt||'') ? 1 : -1);

    if (allTlItems.length && typeof renderTimeline === 'function') {
      tlContent.innerHTML = renderTimeline(allTlItems);
      tlBadge.textContent = allTlItems.length;
      tlBadge.style.display = '';
    } else {
      tlContent.innerHTML = '<div class="text-muted small text-center py-4"><i class="bi bi-clock-history me-2 opacity-25"></i>Aktivite bulunamadı.</div>';
      tlBadge.style.display = 'none';
    }
    if (fbQts.length && typeof renderQuoteCard === 'function') {
      qContent.innerHTML = fbQts.map(q => renderQuoteCard(q)).join('');
      qBadge.textContent = fbQts.length;
      qBadge.style.display = '';
    } else {
      qContent.innerHTML = '<div class="text-muted small text-center py-4"><i class="bi bi-file-earmark-text me-2 opacity-25"></i>Fuarbot\'ta teklif bulunamadı.</div>';
      qBadge.style.display = 'none';
    }
  };

  // Expose so email.js can refresh timeline when notes change
  window._contRenderTimeline = _renderFbPanels;
  window._cmNotes  = [];        // reset notes cache for this contact
  window._cmEmails = [];        // reset emails cache for this contact
  window._fbPanelsRendered = false; // flag: true once Fuarbot data has rendered

  // ── Render cached data immediately, then async fetch ──
  _renderFbPanels();

  // ── Load CRM notes silently in background ──
  if (typeof notesLoad === 'function') {
    notesLoad(id, true).catch(() => {});
  }

  // ── Load emails silently in background (for timeline integration) ──
  if (typeof emailLoadContactEmailsSilent === 'function') {
    emailLoadContactEmailsSilent(id).catch(() => {});
  }

  // ── Async: Firestore fallback lookup + fresh data fetch ─
  (async () => {
    // If not in memory → query crm_customers by email/name directly
    if (!fbCust && typeof fbFindCustomerByEmailOrName === 'function') {
      try {
        fbCust = await fbFindCustomerByEmailOrName(email, nameLow);
        if (fbCust) {
          // Cache for future lookups
          if (typeof fbAllCustomersRaw !== 'undefined' && !fbAllCustomersRaw.find(x => x._id === fbCust._id)) {
            fbAllCustomersRaw.push(fbCust);
          }
          // Show whatever cached activities exist already
          if (currentModalContactId === id) {
            window._fbPanelsRendered = true;
            _renderFbPanels();
          }
        }
      } catch(e) {}
    }
    // Fetch fresh Firestore data for this contact (activities + timeline + quotes)
    if (fbCust?._id && typeof fbFetchContactData === 'function') {
      try {
        await fbFetchContactData(fbCust._id);
        if (currentModalContactId === id) {
          window._fbPanelsRendered = true;
          _renderFbPanels();
        }
      } catch(e) {}
    }
    // If no Fuarbot data found at all, still render with just notes
    if (!fbCust && currentModalContactId === id) {
      window._fbPanelsRendered = true;
      _renderFbPanels();
    }
  })();

  bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('contModal')).show();
}

function contSwitchTab(tab) {
  ['timeline','emails','quotes','notes'].forEach(t => {
    const panel = document.getElementById(`cont-panel-${t}`);
    const navEl = document.getElementById(`cont-tab-${t}`);
    if (panel) panel.style.display = t === tab ? '' : 'none';
    if (navEl) navEl.classList.toggle('active', t === tab);
  });
  // Scroll tab into view on mobile
  const activeTab = document.getElementById(`cont-tab-${tab}`);
  if (activeTab && activeTab.scrollIntoView) activeTab.scrollIntoView({ block:'nearest', inline:'nearest', behavior:'smooth' });
  // Lazy-load E-postalar und Notizen beim ersten Öffnen
  if (tab === 'emails' && currentModalContactId && typeof emailLoadContactEmails === 'function') {
    emailLoadContactEmails(currentModalContactId);
  }
  if (tab === 'notes' && currentModalContactId && typeof notesLoad === 'function') {
    notesLoad(currentModalContactId);
  }
}

function editContactModal() {
  (async () => {
    const c  = await dbGet('contacts', currentModalContactId);
    if (!c) return;
    const co = c.companyId ? await dbGet('companies', c.companyId) : null;
    await refreshCompanyDatalist();
    document.getElementById('ect-id').value      = c.id;
    document.getElementById('ect-name').value    = c.name || '';
    document.getElementById('ect-title').value   = c.title || '';
    document.getElementById('ect-phone').value   = c.phone || '';
    document.getElementById('ect-email').value   = c.email || '';
    document.getElementById('ect-company').value = co?.name || '';
    document.getElementById('ect-address').value  = c.address  || '';
    document.getElementById('ect-city').value     = c.city     || '';
    document.getElementById('ect-postcode').value = c.postcode || '';
    document.getElementById('ect-country').value  = c.country  || '';
    document.getElementById('ect-status').value  = c.status || 'Aktif';
    document.getElementById('ect-notes').value   = c.notes || '';
    initAddressAutocomplete('ect-address','ect-city','ect-postcode','ect-country');
    bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('contModal')).hide();
    new bootstrap.Modal(document.getElementById('editContModal')).show();
  })();
}

function deleteContactModal() {
  (async () => {
    const c = await dbGet('contacts', currentModalContactId);
    if (!c || !confirm(`"${c.name}" kişisini silmek istiyor musunuz?`)) return;
    await dbDelete('contacts', c.id);
    bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('contModal')).hide();
    toast(`"${c.name}" kişisi silindi`);
    await loadContacts();
  })();
}

// ── Inline contact field editing (HubSpot-style) ────────────────────────────
function contFieldEdit(el) {
  if (!el || el.classList.contains('no-edit') || el.classList.contains('editing')) return;
  const field = el.dataset.field;
  const type  = el.dataset.type || 'text';
  const textSpan = el.querySelector('.cont-prop-text');
  const currentVal = (textSpan?.textContent || '').trim();
  if (currentVal === '-') textSpan.textContent = '';

  el.classList.add('editing');

  let input;
  if (type === 'textarea') {
    input = document.createElement('textarea');
    input.rows = 3;
    input.style.cssText = 'width:100%;font-size:12px;padding:4px 6px;border:1px solid #6366f1;border-radius:6px;resize:vertical;';
    input.value = currentVal === '-' ? '' : currentVal;
  } else if (type === 'select') {
    input = document.createElement('select');
    input.style.cssText = 'width:100%;font-size:12px;padding:4px 6px;border:1px solid #6366f1;border-radius:6px;';
    ['Aktif','Pasif','Potansiyel','VIP','Soğuk'].forEach(opt => {
      const o = document.createElement('option');
      o.value = o.textContent = opt;
      if (opt === currentVal) o.selected = true;
      input.appendChild(o);
    });
  } else if (type === 'company') {
    input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('list', 'company-datalist');
    input.style.cssText = 'width:100%;font-size:12px;padding:4px 6px;border:1px solid #6366f1;border-radius:6px;';
    input.value = currentVal === '-' ? '' : currentVal;
  } else {
    input = document.createElement('input');
    input.type = type;
    input.style.cssText = 'width:100%;font-size:12px;padding:4px 6px;border:1px solid #6366f1;border-radius:6px;';
    input.value = currentVal === '-' ? '' : currentVal;
  }

  // Hide span + pen, show input
  if (textSpan) textSpan.style.display = 'none';
  el.querySelector('.cont-edit-pen')?.style && (el.querySelector('.cont-edit-pen').style.display = 'none');
  el.appendChild(input);
  input.focus();
  if (input.select) input.select();

  const _commit = async () => {
    const newVal = input.value.trim();
    el.removeChild(input);
    if (textSpan) textSpan.style.display = '';
    el.querySelector('.cont-edit-pen')?.style && (el.querySelector('.cont-edit-pen').style.display = '');
    el.classList.remove('editing');
    if (newVal === (currentVal === '-' ? '' : currentVal)) return; // no change
    textSpan.textContent = newVal || '-';
    await contFieldSave(field, newVal);
  };

  input.addEventListener('blur', _commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && type !== 'textarea') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = currentVal; input.blur(); }
  });
}

async function contFieldSave(field, value) {
  if (!currentModalContactId) return;
  try {
    const c = await dbGet('contacts', currentModalContactId);
    if (!c) return;
    const update = {};

    if (field === 'company') {
      // Resolve company name → companyId
      const cos = await dbAll('companies');
      const co  = value ? cos.find(x => trLow(x.name) === trLow(value)) : null;
      update.companyId = co?.id || null;
      // Also update subtitle
      const subtitleEl = document.getElementById('cont-title-sub');
      if (subtitleEl) {
        const parts = [(c.title || ''), value].filter(Boolean);
        subtitleEl.textContent = parts.join(' · ');
      }
    } else {
      update[field] = value;
    }

    // Special: update avatar initials if name changed
    if (field === 'name' && value) {
      const initials = value.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
      const avatarEl = document.getElementById('cont-avatar');
      if (avatarEl) avatarEl.textContent = initials;
      const heroNameEl = document.getElementById('cont-name');
      if (heroNameEl) heroNameEl.textContent = value;
      // Update subtitle
      const subtitleEl = document.getElementById('cont-title-sub');
      if (subtitleEl) {
        const co = c.companyId ? await dbGet('companies', c.companyId) : null;
        const parts = [c.title, co?.name].filter(Boolean);
        subtitleEl.textContent = parts.join(' · ');
      }
    }
    if (field === 'title' && value) {
      const subtitleEl = document.getElementById('cont-title-sub');
      if (subtitleEl) {
        const co = c.companyId ? await dbGet('companies', c.companyId) : null;
        const parts = [value, co?.name].filter(Boolean);
        subtitleEl.textContent = parts.join(' · ');
      }
    }

    await dbUpdate('contacts', currentModalContactId, update);

    // Recalculate quality after edit
    const updatedC = await dbGet('contacts', currentModalContactId);
    if (updatedC) {
      const newScore = calculateContactQuality(updatedC);
      const qPct = document.getElementById('cont-quality-pct');
      if (qPct) qPct.textContent = `${newScore}%`;
      const qBar = document.getElementById('cont-quality-bar');
      if (qBar) qBar.style.width = `${newScore}%`;
    }

    // Show save toast
    const toast = document.getElementById('cont-save-toast');
    if (toast) {
      toast.style.display = 'block';
      toast.style.opacity = '1';
      clearTimeout(toast._t);
      toast._t = setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => { toast.style.display = 'none'; }, 300); }, 2000);
    }

    // Refresh contacts list in background
    if (typeof loadContacts === 'function') loadContacts().catch(()=>{});
  } catch(e) {
    console.error('contFieldSave error:', e);
  }
}
// ─────────────────────────────────────────────────────────────────────────────

async function saveContact(e) {
  e.preventDefault();
  const ph = document.getElementById('act-phone').value;
  const pd = normalizePhone(ph);
  const cos = await dbAll('companies');
  const cn = document.getElementById('act-company').value.trim();
  const cid = cn ? (cos.find(c => trLow(c.name) === trLow(cn))?.id || null) : null;
  const c = buildContactObj('act', null, pd, ph, cid);
  c.createdAt = new Date().toISOString();
  c.createdBy = (typeof authEmail === 'function' ? authEmail() : '') || '';
  c.qualityScore = calculateContactQuality(c);
  await dbAdd('contacts', c);
  toast('Kişi eklendi');
  showPage('contacts');
}

async function saveEditedContact() {
  const ph = document.getElementById('ect-phone').value;
  const pd = normalizePhone(ph);
  const cos = await dbAll('companies');
  const cn = document.getElementById('ect-company').value.trim();
  const cid = cn ? (cos.find(c => trLow(c.name) === trLow(cn))?.id || null) : null;
  const oldId = parseInt(document.getElementById('ect-id').value);
  const existing = await dbGet('contacts', oldId);
  const c = buildContactObj('ect', oldId, pd, ph, cid);
  c.createdAt  = existing?.createdAt || new Date().toISOString();
  c.createdBy  = existing?.createdBy || (typeof authEmail === 'function' ? authEmail() : '') || '';
  c.sourceFile = existing?.sourceFile || null;
  c.qualityScore = calculateContactQuality(c);
  await dbPut('contacts', c);
  toast('Kişi güncellendi');
  bootstrap.Modal.getOrCreateInstance(document.getElementById('editContModal')).hide();
  await loadContacts();
}

function buildContactObj(pre, id, pd, ph, cid) {
  const o = {
    companyId:       cid || null,
    name:            document.getElementById(`${pre}-name`).value.trim(),
    title:           document.getElementById(`${pre}-title`).value.trim() || null,
    phone:           ph || null,
    phoneNormalized: pd.normalized || null,
    phoneValid:      pd.valid,
    phoneType:       pd.type || null,
    email:           document.getElementById(`${pre}-email`).value.trim() || null,
    address:         document.getElementById(`${pre}-address`)?.value.trim() || null,
    city:            document.getElementById(`${pre}-city`)?.value.trim() || null,
    postcode:        document.getElementById(`${pre}-postcode`)?.value.trim() || null,
    country:         document.getElementById(`${pre}-country`)?.value.trim() || null,
    notes:           document.getElementById(`${pre}-notes`).value.trim() || null,
    status:          document.getElementById(`${pre}-status`).value || 'Aktif',
    updatedAt:       new Date().toISOString(),
    errors:          []
  };
  if (id !== null) o.id = id;
  return o;
}

/* ===================== TOPLU İŞLEMLER ===================== */
function toggleContactRow(cb) { cb.checked ? selectedContIds.add(+cb.dataset.id) : selectedContIds.delete(+cb.dataset.id); updateContactBulkBar(); }
function toggleContactSelectAll() { const a=document.getElementById('contact-select-all').checked; document.querySelectorAll('#contacts-table-body input[type="checkbox"]').forEach(cb=>{cb.checked=a;toggleContactRow(cb);}); }
function clearContactSelection() { selectedContIds.clear(); document.querySelectorAll('#contacts-table-body input[type="checkbox"]').forEach(cb=>cb.checked=false); document.getElementById('contact-select-all').checked=false; updateContactBulkBar(); }
function updateContactBulkBar() { const b=document.getElementById('contact-bulk-bar'); b.classList.toggle('show',selectedContIds.size>0); document.getElementById('contact-bulk-count').textContent=`${selectedContIds.size} kişi seçildi`; }
async function bulkDeleteContacts() {
  if (!confirm(`${selectedContIds.size} kişiyi silmek istiyor musunuz?`)) return;
  showLoading('Siliniyor…');
  for (const id of selectedContIds) await dbDelete('contacts', id);
  toast(`${selectedContIds.size} kişi silindi`);
  clearContactSelection();
  hideLoading();
  await loadContacts();
}

/* ===================== EXCEL AKTARIM ===================== */
