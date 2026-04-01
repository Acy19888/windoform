// tasks.js — Aufgaben/Görevler Management
'use strict';

const _TASKS_COL = 'crm_tasks';
let _tasksCache = [];
let _tasksCacheTs = 0;
const _TASKS_TTL = 5 * 60 * 1000; // 5 min

// ── Page loader ───────────────────────────────────────────────
async function loadTasksPage() {
  const cfg = loadFbConfig();
  if (!cfg?.apiKey) {
    document.getElementById('tasks-content').innerHTML =
      `<div class="alert alert-warning">Firebase nicht konfiguriert.</div>`;
    return;
  }
  // Ensure fuarbot user list is loaded for "Zugewiesen an" dropdown
  await _tasksEnsureUsers(cfg);
  await _fetchTasks(cfg);
  _renderTasksPage();
}

// Load fuarEmployees into fbUsersData if not already loaded
async function _tasksEnsureUsers(cfg) {
  if (typeof fbUsersData !== 'undefined' && fbUsersData.length > 0) return;
  try {
    const token = typeof authToken === 'function' ? await authToken() : null;
    const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/fuarEmployees?pageSize=100&key=${cfg.apiKey}`;
    const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return;
    const data = await res.json();
    const docs = data.documents || [];
    const users = docs.map(d => {
      const f = d.fields || {};
      const id = d.name?.split('/').pop() || '';
      return { _id: id, uid: id, name: f.name?.stringValue || f.displayName?.stringValue || '', email: f.email?.stringValue || '', role: f.role?.stringValue || '', crmRole: f.crmRole?.stringValue || 'sales' };
    }).filter(u => u.name || u.email);
    if (typeof fbUsersData !== 'undefined') {
      fbUsersData.splice(0, fbUsersData.length, ...users);
    }
  } catch(_) {}
}

async function _fetchTasks(cfg, force) {
  if (!force && _tasksCacheTs && Date.now() - _tasksCacheTs < _TASKS_TTL) return;
  try {
    const token = typeof authToken === 'function' ? await authToken() : null;
    const uid   = typeof authUid   === 'function' ? authUid() : null;
    const role  = typeof _userCrmRole !== 'undefined' ? _userCrmRole : 'sales';
    const url   = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents:runQuery?key=${cfg.apiKey}`;

    const body = { structuredQuery: {
      from: [{ collectionId: _TASKS_COL }],
      orderBy: [
        { field: { fieldPath: 'status' } },
        { field: { fieldPath: 'dueDate' }, direction: 'ASCENDING' },
      ],
      limit: 200,
    }};

    const res  = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {})}, body: JSON.stringify(body) });
    const rows = await res.json();
    let tasks  = (Array.isArray(rows) ? rows : []).filter(r => r.document).map(r => {
      const f = r.document.fields || {};
      return {
        _id:            r.document.name.split('/').pop(),
        title:          f.title?.stringValue || '(Aufgabe)',
        description:    f.description?.stringValue || '',
        dueDate:        f.dueDate?.stringValue || '',
        priority:       f.priority?.stringValue || 'normal',
        status:         f.status?.stringValue || 'open',
        assignedToUid:  f.assignedToUid?.stringValue || '',
        assignedToName: f.assignedToName?.stringValue || '',
        createdByUid:   f.createdByUid?.stringValue || '',
        createdBy:      f.createdBy?.stringValue || '',
        createdAt:      f.createdAt?.stringValue || '',
        contactId:      f.contactId?.stringValue || '',
        contactName:    f.contactName?.stringValue || '',
      };
    });

    // Sales: nur eigene Aufgaben (erstellt von oder zugewiesen an mich)
    if (role !== 'admin' && uid) {
      tasks = tasks.filter(t => t.createdByUid === uid || t.assignedToUid === uid);
    }

    _tasksCache  = tasks;
    _tasksCacheTs = Date.now();
  } catch(e) { console.warn('[tasks] fetch error:', e.message); }
}

function _renderTasksPage() {
  const el = document.getElementById('tasks-content');
  if (!el) return;

  const open = _tasksCache.filter(t => t.status !== 'done');
  const done = _tasksCache.filter(t => t.status === 'done');

  const prioColor = p => p === 'high' ? '#ef4444' : p === 'low' ? '#94a3b8' : '#f59e0b';
  const prioLabel = p => p === 'high' ? 'Hoch' : p === 'low' ? 'Niedrig' : 'Normal';

  const renderRow = t => {
    const overdue  = t.dueDate && t.status !== 'done' && new Date(t.dueDate) < new Date();
    const dt       = t.dueDate ? new Date(t.dueDate).toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
    const pColor   = prioColor(t.priority);
    const isDone   = t.status === 'done';
    return `<tr style="${isDone ? 'opacity:.55;' : ''}">
      <td>
        <div class="d-flex align-items-start gap-2">
          <input type="checkbox" class="form-check-input mt-1 flex-shrink-0" ${isDone ? 'checked' : ''}
            onchange="toggleTaskDone('${t._id}', this.checked)" style="cursor:pointer;">
          <div>
            <div class="fw-semibold small ${isDone ? 'text-decoration-line-through text-muted' : ''}">${_tesc(t.title)}</div>
            ${t.description ? `<div class="text-muted" style="font-size:11px;">${_tesc(t.description.slice(0,80))}${t.description.length>80?'…':''}</div>` : ''}
            ${t.contactName ? `<div style="font-size:11px;color:#6366f1;"><i class="bi bi-person-fill me-1"></i>${_tesc(t.contactName)}</div>` : ''}
          </div>
        </div>
      </td>
      <td class="text-center">
        <span class="badge" style="background:${pColor}20;color:${pColor};font-size:10px;">${prioLabel(t.priority)}</span>
      </td>
      <td class="small ${overdue ? 'text-danger fw-semibold' : 'text-muted'}">
        ${overdue ? '<i class="bi bi-exclamation-triangle-fill me-1"></i>' : ''}${dt}
      </td>
      <td class="small text-muted">${_tesc(t.assignedToName || t.createdBy || '—')}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary py-0 me-1" onclick="openTaskModal('${t._id}')" title="Bearbeiten"><i class="bi bi-pencil-fill"></i></button>
        <button class="btn btn-sm btn-outline-danger py-0" onclick="deleteTask('${t._id}')" title="Löschen"><i class="bi bi-trash-fill"></i></button>
      </td>
    </tr>`;
  };

  el.innerHTML = `
    <div class="tasks-summary d-flex gap-3 mb-3 flex-wrap">
      <div class="tasks-stat-card">
        <div class="tasks-stat-num">${open.length}</div>
        <div class="tasks-stat-label">Offen</div>
      </div>
      <div class="tasks-stat-card" style="border-color:#ef4444;color:#ef4444;">
        <div class="tasks-stat-num">${open.filter(t=>t.priority==='high').length}</div>
        <div class="tasks-stat-label">Hohe Priorität</div>
      </div>
      <div class="tasks-stat-card" style="border-color:#ef4444;color:#ef4444;">
        <div class="tasks-stat-num">${open.filter(t=>t.dueDate && new Date(t.dueDate)<new Date()).length}</div>
        <div class="tasks-stat-label">Überfällig</div>
      </div>
      <div class="tasks-stat-card" style="border-color:#22c55e;color:#22c55e;">
        <div class="tasks-stat-num">${done.length}</div>
        <div class="tasks-stat-label">Erledigt</div>
      </div>
    </div>

    ${open.length ? `
    <div class="card mb-3">
      <div class="card-header py-2 px-3 fw-semibold small">
        <i class="bi bi-list-check me-2 text-primary"></i>Offene Aufgaben (${open.length})
      </div>
      <div class="table-responsive">
        <table class="table table-hover table-sm mb-0">
          <thead class="table-light"><tr>
            <th>Aufgabe</th><th style="width:90px;">Priorität</th>
            <th style="width:110px;">Fällig am</th><th style="width:130px;">Zugewiesen</th>
            <th style="width:80px;"></th>
          </tr></thead>
          <tbody>${open.map(renderRow).join('')}</tbody>
        </table>
      </div>
    </div>` : `<div class="alert alert-success"><i class="bi bi-check-circle-fill me-2"></i>Keine offenen Aufgaben 🎉</div>`}

    ${done.length ? `
    <details class="card mb-3">
      <summary class="card-header py-2 px-3 fw-semibold small" style="cursor:pointer;list-style:none;">
        <i class="bi bi-check2-all me-2 text-success"></i>Erledigte Aufgaben (${done.length})
        <i class="bi bi-chevron-down ms-1" style="font-size:11px;"></i>
      </summary>
      <div class="table-responsive">
        <table class="table table-hover table-sm mb-0">
          <thead class="table-light"><tr>
            <th>Aufgabe</th><th style="width:90px;">Priorität</th>
            <th style="width:110px;">Fällig am</th><th style="width:130px;">Zugewiesen</th>
            <th style="width:80px;"></th>
          </tr></thead>
          <tbody>${done.map(renderRow).join('')}</tbody>
        </table>
      </div>
    </details>` : ''}
  `;
}

// ── Toggle done/open ──────────────────────────────────────────
async function toggleTaskDone(id, done) {
  const cfg   = loadFbConfig(); if (!cfg?.apiKey) return;
  const token = typeof authToken === 'function' ? await authToken() : null;
  const status = done ? 'done' : 'open';
  const url  = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${_TASKS_COL}/${id}?updateMask.fieldPaths=status&key=${cfg.apiKey}`;
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {}) },
    body: JSON.stringify({ fields: { status: { stringValue: status } } }),
  });
  const t = _tasksCache.find(x => x._id === id);
  if (t) t.status = status;
  _renderTasksPage();
}

// ── Delete ────────────────────────────────────────────────────
async function deleteTask(id) {
  if (!confirm('Aufgabe wirklich löschen?')) return;
  const cfg   = loadFbConfig(); if (!cfg?.apiKey) return;
  const token = typeof authToken === 'function' ? await authToken() : null;
  const url   = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${_TASKS_COL}/${id}?key=${cfg.apiKey}`;
  await fetch(url, { method:'DELETE', headers: token ? {Authorization:`Bearer ${token}`} : {} });
  _tasksCache = _tasksCache.filter(t => t._id !== id);
  _renderTasksPage();
}

// ── Modal: open / create / edit ───────────────────────────────
function openTaskModal(id) {
  const t = id ? _tasksCache.find(x => x._id === id) : null;
  document.getElementById('task-modal-title').textContent = t ? 'Aufgabe bearbeiten' : 'Neue Aufgabe';
  document.getElementById('task-edit-id').value           = t?._id || '';
  document.getElementById('task-edit-title').value        = t?.title || '';
  document.getElementById('task-edit-desc').value         = t?.description || '';
  document.getElementById('task-edit-due').value          = t?.dueDate || '';
  document.getElementById('task-edit-priority').value     = t?.priority || 'normal';
  document.getElementById('task-edit-assigned').value     = t?.assignedToUid || '';
  document.getElementById('task-edit-contact').value      = t?.contactId || '';
  document.getElementById('task-edit-contact-name').value = t?.contactName || '';

  // Fill assigned-to dropdown with users
  _fillTaskUserDropdown(t?.assignedToUid);
  _fillTaskContactDropdown(t?.contactId, t?.contactName);

  new bootstrap.Modal(document.getElementById('taskEditModal')).show();
}

function _fillTaskUserDropdown(selectedUid) {
  const sel = document.getElementById('task-edit-assigned');
  if (!sel) return;
  // Get users from fbUsersData (fuarbot2.js global)
  const users = typeof fbUsersData !== 'undefined' ? fbUsersData : [];
  const myUid = typeof authUid === 'function' ? authUid() : '';
  sel.innerHTML = `<option value="">— Nicht zugewiesen —</option>` +
    users.map(u => `<option value="${_tesc(u._id || u.uid || u.email)}" ${(u._id === selectedUid || u.uid === selectedUid) ? 'selected' : ''}>${_tesc(u.name || u.email)}</option>`).join('');
  if (!selectedUid && myUid) sel.value = myUid; // default: assign to self
}

async function _fillTaskContactDropdown(selectedId, selectedName) {
  const inp = document.getElementById('task-edit-contact-name');
  const hid = document.getElementById('task-edit-contact');
  if (!inp) return;
  if (selectedName) inp.value = selectedName;

  // Ensure dropdown container exists below input
  let dd = document.getElementById('task-contact-dd');
  if (!dd) {
    dd = document.createElement('ul');
    dd.id = 'task-contact-dd';
    dd.className = 'list-group shadow-sm';
    dd.style.cssText = 'display:none;max-height:200px;overflow-y:auto;border:1px solid #dee2e6;border-radius:6px;margin-top:2px;background:#fff;z-index:10000;';
    inp.parentNode.appendChild(dd);
  }

  // Autocomplete on input
  inp.oninput = async () => {
    const q = inp.value.toLowerCase().trim();
    if (q.length < 2) { dd.style.display = 'none'; hid.value = ''; return; }
    try {
      const contacts = typeof dbAll === 'function' ? await dbAll('contacts') : [];
      const matches  = contacts.filter(c =>
        (c.name||'').toLowerCase().includes(q) ||
        (c.email||'').toLowerCase().includes(q) ||
        (c.company||'').toLowerCase().includes(q)
      ).slice(0, 8);
      if (!matches.length) { dd.style.display = 'none'; return; }
      dd.innerHTML = matches.map(c =>
        `<li class="list-group-item list-group-item-action py-1 px-2 small" style="cursor:pointer;"
          onmousedown="_pickTaskContact('${_tesc(c.id||'')}','${_tesc(c.name||'')}')">
          <span class="fw-semibold">${_tesc(c.name||'—')}</span>
          ${c.company ? `<span class="text-muted ms-1">${_tesc(c.company)}</span>` : ''}
          ${c.email ? `<div style="font-size:10px;color:#6b7280;">${_tesc(c.email)}</div>` : ''}
        </li>`
      ).join('');
      dd.style.display = 'block';
    } catch(e) { console.warn('Contact search error:', e); }
  };

  inp.onblur = () => { setTimeout(() => { dd.style.display = 'none'; }, 200); };
}

function _pickTaskContact(id, name) {
  document.getElementById('task-edit-contact').value = id;
  document.getElementById('task-edit-contact-name').value = name;
  const dd = document.getElementById('task-contact-dd');
  if (dd) dd.innerHTML = '';
}

async function saveTask() {
  const cfg   = loadFbConfig(); if (!cfg?.apiKey) return;
  const token = typeof authToken === 'function' ? await authToken() : null;
  const id    = document.getElementById('task-edit-id').value.trim();
  const title = document.getElementById('task-edit-title').value.trim();
  if (!title) { alert('Titel ist pflicht.'); return; }

  const assignedUid  = document.getElementById('task-edit-assigned').value.trim();
  const assignedName = assignedUid
    ? (typeof fbUsersData !== 'undefined' ? (fbUsersData.find(u => u._id === assignedUid || u.uid === assignedUid)?.name || assignedUid) : assignedUid)
    : '';
  const contactId    = document.getElementById('task-edit-contact').value.trim();
  const contactName  = document.getElementById('task-edit-contact-name').value.trim();

  const now    = new Date().toISOString();
  const fields = {
    title:          { stringValue: title },
    description:    { stringValue: document.getElementById('task-edit-desc').value.trim() },
    dueDate:        { stringValue: document.getElementById('task-edit-due').value },
    priority:       { stringValue: document.getElementById('task-edit-priority').value },
    status:         { stringValue: id ? (_tasksCache.find(t=>t._id===id)?.status || 'open') : 'open' },
    assignedToUid:  { stringValue: assignedUid },
    assignedToName: { stringValue: assignedName },
    contactId:      { stringValue: contactId },
    contactName:    { stringValue: contactName },
    createdBy:      { stringValue: typeof _userDispName !== 'undefined' ? (_userDispName || '') : '' },
    createdByUid:   { stringValue: typeof authUid === 'function' ? (authUid() || '') : '' },
    updatedAt:      { stringValue: now },
  };
  if (!id) fields.createdAt = { stringValue: now };

  const base = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${_TASKS_COL}`;
  const hdrs = { 'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {}) };

  try {
    let res, docId = id;
    if (id) {
      const mask = Object.keys(fields).map(k => 'updateMask.fieldPaths='+encodeURIComponent(k)).join('&');
      res = await fetch(`${base}/${id}?${mask}&key=${cfg.apiKey}`, { method:'PATCH', headers:hdrs, body:JSON.stringify({fields}) });
    } else {
      res = await fetch(`${base}?key=${cfg.apiKey}`, { method:'POST', headers:hdrs, body:JSON.stringify({fields}) });
      if (res.ok) { const d = await res.json(); docId = d.name?.split('/').pop(); }
    }
    if (!res.ok) throw new Error('Speichern fehlgeschlagen');

    // Update cache
    const obj = { _id: docId, title, description: fields.description.stringValue,
      dueDate: fields.dueDate.stringValue, priority: fields.priority.stringValue,
      status: fields.status.stringValue, assignedToUid: assignedUid, assignedToName: assignedName,
      contactId, contactName, createdBy: fields.createdBy.stringValue,
      createdByUid: fields.createdByUid.stringValue, createdAt: fields.createdAt?.stringValue || now };
    const idx = _tasksCache.findIndex(t => t._id === docId);
    if (idx >= 0) _tasksCache[idx] = obj; else _tasksCache.unshift(obj);

    bootstrap.Modal.getOrCreateInstance(document.getElementById('taskEditModal')).hide();
    _renderTasksPage();
    if (typeof toast === 'function') toast(id ? 'Aufgabe aktualisiert' : 'Aufgabe erstellt', 'success');
  } catch(e) { alert('Fehler: ' + e.message); }
}

// ── Called from contact modal to add task for a contact ───────
function openTaskModalForContact(contactId, contactName) {
  openTaskModal(null);
  setTimeout(() => {
    document.getElementById('task-edit-contact').value      = contactId;
    document.getElementById('task-edit-contact-name').value = contactName;
  }, 150);
}

function _tesc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
