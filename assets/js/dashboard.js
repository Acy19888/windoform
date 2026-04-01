// Split from app.js — Dashboard and statistics

async function loadDashboard() {
  const [cos, cons] = await Promise.all([dbAll('companies'), dbAll('contacts')]);
  document.getElementById('stat-companies').textContent = cos.length;
  document.getElementById('stat-contacts').textContent  = cons.length;

  // ── Fuarbot canlı özet ────────────────────────────────────
  _loadFuarbotDashStats();

  const aq = cos.length ? Math.round(cos.reduce((a,b) => a + (b.qualityScore||0), 0) / cos.length) : 0;
  document.getElementById('stat-avg-quality').textContent  = aq;
  document.getElementById('stat-high-quality').textContent = cos.filter(c => (c.qualityScore||0) >= 80).length;

  // Şehir grafiği
  const cc = {};
  cos.forEach(c => { if (c.city) cc[c.city] = (cc[c.city]||0)+1; });
  const tc = Object.entries(cc).sort((a,b)=>b[1]-a[1]).slice(0,10);
  if (charts.cities) charts.cities.destroy();
  if (tc.length) {
    charts.cities = new Chart(document.getElementById('chart-cities').getContext('2d'), {
      type:'bar',
      data:{ labels:tc.map(c=>c[0]), datasets:[{label:'Firma',data:tc.map(c=>c[1]),backgroundColor:'#3b82f6',borderRadius:5}] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} }
    });
  }

  // Sektör grafiği
  const sc = {};
  cos.forEach(c => { if (c.sector) sc[c.sector] = (sc[c.sector]||0)+1; });
  if (charts.sector) charts.sector.destroy();
  if (Object.keys(sc).length) {
    charts.sector = new Chart(document.getElementById('chart-sector').getContext('2d'), {
      type:'doughnut',
      data:{ labels:Object.keys(sc), datasets:[{data:Object.values(sc), backgroundColor:['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#14b8a6']}] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{font:{size:11}}}} }
    });
  }

  // Kalite grafiği
  const hc = cos.filter(c=>(c.qualityScore||0)>=80).length;
  const mc = cos.filter(c=>(c.qualityScore||0)>=50&&(c.qualityScore||0)<80).length;
  const lc = cos.filter(c=>(c.qualityScore||0)<50).length;
  if (charts.quality) charts.quality.destroy();
  if (cos.length) {
    charts.quality = new Chart(document.getElementById('chart-quality').getContext('2d'), {
      type:'pie',
      data:{ labels:['Yüksek (80+)','Orta (50-79)','Düşük (<50)'], datasets:[{data:[hc,mc,lc],backgroundColor:['#10b981','#f59e0b','#ef4444']}] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}} }
    });
  }
}

async function _loadFuarbotDashStats() {
  try {
    const cfg = (typeof loadFbConfig === 'function') ? loadFbConfig() : null;
    if (!cfg?.apiKey || !cfg?.projectId) return;

    // Her zaman fbAllCustomersRaw kullan — bu import edilenleri de içerir
    // fbCustomers = sadece henüz import edilmemiş olanlar (filtrelenmiş), KULLANMA
    let customers = [];
    if (typeof fbAllCustomersRaw !== 'undefined' && fbAllCustomersRaw.length) {
      customers = fbAllCustomersRaw;
    } else {
      // Henüz sync olmamış — Firestore'dan doğrudan çek (filtresiz)
      customers = typeof fsFetch === 'function'
        ? await fsFetch(cfg.apiKey, cfg.projectId, 'crm_customers').catch(()=>[])
        : [];
      // Cache'e ekle
      if (customers.length && typeof fbAllCustomersRaw !== 'undefined') {
        customers.forEach(c => { if (!fbAllCustomersRaw.find(x=>x._id===c._id)) fbAllCustomersRaw.push(c); });
      }
    }

    // ── Tarayan için: activities + employees her zaman doğrudan çek ──────────
    // fbActivities / fbUsersData fuarbot2.js cache'i — sadece o tab açıksa dolu olur.
    // Dashboard başlangıçta açık olduğu için her zaman Firestore'dan al.
    let _dashActivities = {};
    let _dashEmployees  = [];
    if (typeof fsFetch === 'function') {
      const [rawActs, rawEmps] = await Promise.all([
        fsFetch(cfg.apiKey, cfg.projectId, 'crm_activities').catch(()=>[]),
        fsFetch(cfg.apiKey, cfg.projectId, 'fuarEmployees').catch(()=>[]),
      ]);
      rawActs.forEach(a => {
        const k = a.parentId || a.contactId || '';
        if (k) { (_dashActivities[k] || (_dashActivities[k] = [])).push(a); }
      });
      Object.values(_dashActivities).forEach(arr =>
        arr.sort((a,b) => (b.createdAt||'') > (a.createdAt||'') ? 1 : -1)
      );
      _dashEmployees = rawEmps;
      // fuarbot2 cache de güncelle — eğer boşsa
      if (typeof fbUsersData !== 'undefined' && !fbUsersData.length && rawEmps.length) fbUsersData = rawEmps;
      if (typeof fbActivities !== 'undefined' && !Object.keys(fbActivities).length && Object.keys(_dashActivities).length) {
        Object.assign(fbActivities, _dashActivities);
      }
    }

    let quotes = (typeof fbQuotes !== 'undefined' && Object.keys(fbQuotes).length)
      ? Object.values(fbQuotes).flat()
      : await (typeof fsFetch === 'function'
          ? fsFetch(cfg.apiKey, cfg.projectId, 'crm_quotes').catch(()=>[])
          : Promise.resolve([]));

    // Bugünkü aktivite: createdAt VEYA updatedAt bugün olan kişiler
    // (tekrar taranan eski müşteriler de sayılır)
    const todayStr = new Date().toISOString().slice(0,10);
    const todayScans = customers.filter(c =>
      (c.createdAt||'').slice(0,10) === todayStr ||
      (c.updatedAt||'').slice(0,10) === todayStr
    ).length;

    // Toplam tutar
    const totalRev = quotes.reduce((s,q) => s + Number(q.totalNet||q.totalGross||0), 0);
    const sym = '€';
    const fmtRev = totalRev >= 1000
      ? (totalRev/1000).toLocaleString('de-DE',{maximumFractionDigits:1}) + 'k'
      : totalRev.toLocaleString('de-DE',{maximumFractionDigits:0});

    document.getElementById('fb-stat-today').textContent   = todayScans;
    document.getElementById('fb-stat-total').textContent   = customers.length;
    document.getElementById('fb-stat-quotes').textContent  = quotes.length;
    document.getElementById('fb-stat-revenue').textContent = fmtRev + ' ' + sym;

    // Badge CANLI göster
    const badge = document.getElementById('fuarbot-dash-badge');
    if (badge) badge.style.display = '';

    // Son 5 tarama — updatedAt veya createdAt'e göre sırala (tekrar tarananlar üstte)
    const recent = [...customers]
      .sort((a,b) => {
        const ta = b.updatedAt || b.createdAt || '';
        const tb = a.updatedAt || a.createdAt || '';
        return ta > tb ? 1 : -1;
      })
      .slice(0,5);
    const recentEl = document.getElementById('fb-dash-recent');
    if (recentEl) {
      if (!recent.length) {
        recentEl.innerHTML = '<span class="text-muted">Henüz tarama yok.</span>';
      } else {
        recentEl.innerHTML = `<table class="table table-sm mb-0" style="font-size:12px;">
          <thead class="table-light"><tr><th>Ad</th><th>Şirket</th><th>Tarayan</th><th>Tarih</th></tr></thead>
          <tbody>
          ${recent.map(c => {
            // Resolve scanner: use freshly-fetched _dashActivities + _dashEmployees
            let tarayan = c.createdBy || '';
            if (!tarayan) {
              const acts = _dashActivities[c._id] || [];
              const scanAct = acts[acts.length - 1]; // sorted newest-first → last = oldest (= scan event)
              if (scanAct) {
                const uid = scanAct.createdByUid || scanAct.uid || '';
                const email = (scanAct.createdBy || '').toLowerCase();
                const u = _dashEmployees.find(u =>
                  (uid && u._id === uid) ||
                  (email && (u.email||'').toLowerCase() === email)
                );
                tarayan = u ? (u.name || u.email || scanAct.createdBy || '') : (scanAct.createdBy || uid || '');
              }
            }
            // Tarih: updatedAt (re-scans) or createdAt
            const dateStr = c.updatedAt || c.createdAt;
            const dt = dateStr ? new Date(dateStr).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
            return `<tr>
              <td>${esc(c.name||'—')}</td>
              <td>${esc(c.company||c.companyName||'—')}</td>
              <td>${esc(tarayan||'—')}</td>
              <td>${dt}</td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>`;
      }
    }
    // ── Fatura / Rechnungs-Statistiken (aus crm_invoices) ────
    const now2 = new Date();
    const thisMonth = now2.getMonth(), thisYear = now2.getFullYear();
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
    const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

    const fmtEur = v => v >= 1000000
      ? (v/1000000).toLocaleString('de-DE',{maximumFractionDigits:1})+' M€'
      : v >= 1000
      ? (v/1000).toLocaleString('de-DE',{maximumFractionDigits:1})+' k€'
      : v.toLocaleString('de-DE',{minimumFractionDigits:0,maximumFractionDigits:0})+' €';

    // Fetch real invoices from crm_invoices (saved when printing a Fatura)
    const invoices = typeof fsFetch === 'function'
      ? await fsFetch(cfg.apiKey, cfg.projectId, 'crm_invoices').catch(()=>[])
      : [];

    const rev = q => Number(q.totalNet||0);
    const inMonth = (q, m, y) => { const d = new Date(q.createdAt||''); return d.getMonth()===m && d.getFullYear()===y; };

    const thisMonthRev  = invoices.filter(q=>inMonth(q,thisMonth,thisYear)).reduce((s,q)=>s+rev(q),0);
    const lastMonthRev  = invoices.filter(q=>inMonth(q,lastMonth,lastMonthYear)).reduce((s,q)=>s+rev(q),0);
    const thisYearRev   = invoices.filter(q=>new Date(q.createdAt||'').getFullYear()===thisYear).reduce((s,q)=>s+rev(q),0);
    const avgQ          = invoices.length ? invoices.reduce((s,q)=>s+rev(q),0)/invoices.length : 0;
    // "Taslak" = quotes still not invoiced (in crm_quotes but not in crm_invoices)
    const invoicedNums  = new Set(invoices.map(i=>i.quoteNumber).filter(Boolean));
    const draftRev      = quotes.filter(q=>q.status==='draft'||(q.quoteNumber&&!invoicedNums.has(q.quoteNumber))).reduce((s,q)=>s+Number(q.totalNet||0),0);

    const trend = lastMonthRev > 0 ? Math.round(((thisMonthRev-lastMonthRev)/lastMonthRev)*100) : null;
    const trendHtml = trend !== null
      ? `<span style="color:${trend>=0?'#10b981':'#ef4444'};font-size:11px;">${trend>=0?'↑':'↓'} ${Math.abs(trend)}% geçen ay</span>`
      : `<span style="color:#9ca3af;font-size:11px;">İlk ay</span>`;

    const setEl = (id, val) => { const e = document.getElementById(id); if(e) e.innerHTML = val; };
    setEl('rev-stat-month',       fmtEur(thisMonthRev));
    setEl('rev-stat-month-trend', trendHtml);
    setEl('rev-stat-year',        fmtEur(thisYearRev));
    setEl('rev-stat-avg',         fmtEur(avgQ));
    setEl('rev-stat-pending',     fmtEur(draftRev));

    // 6 aylık chart
    const m6labels = [], m6data = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(thisYear, thisMonth - i, 1);
      m6labels.push(d.toLocaleString('tr-TR',{month:'short'}) + ' \'' + String(d.getFullYear()).slice(2));
      m6data.push(allQ.filter(q=>inMonth(q,d.getMonth(),d.getFullYear())).reduce((s,q)=>s+rev(q),0));
    }
    const mCtx = document.getElementById('chart-revenue-monthly')?.getContext('2d');
    if (mCtx) {
      if (window._chartRevMonthly) window._chartRevMonthly.destroy();
      window._chartRevMonthly = new Chart(mCtx, {
        type: 'bar',
        data: {
          labels: m6labels,
          datasets: [{
            data: m6data,
            backgroundColor: m6data.map((_,i) => i===5 ? '#3b82f6' : '#bfdbfe'),
            borderRadius: 8,
            borderSkipped: false,
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display:false }, tooltip: {
            callbacks: { label: ctx => ' ' + fmtEur(ctx.raw) }
          }},
          scales: {
            x: { grid: { display:false } },
            y: { grid: { color:'#f3f4f6' }, ticks: {
              callback: v => v>=1000 ? (v/1000).toFixed(0)+'k' : v
            }}
          }
        }
      });
    }
  } catch(e) {
    console.warn('Fuarbot dash stats:', e.message);
  }
}

/* ===================== RAPORLAR ===================== */
