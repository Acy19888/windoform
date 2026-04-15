'use strict';
// ── Windoform CRM — Outlook ItemSend Auto-Save ───────────────────────────────
// Wird automatisch aufgerufen wenn der Nutzer auf "Senden" klickt.
// Speichert die E-Mail still im Hintergrund ins CRM.

const _AUTH_KEY    = '_wf_outlook_auth';
const _CFG_KEY     = '_wf_outlook_cfg';
const _FS_BASE     = 'https://firestore.googleapis.com/v1/projects';
const _TOKEN_BASE  = 'https://securetoken.googleapis.com/v1/token';
const _EM_COL      = 'crm_emails';
const _TR_COL      = 'email_tracking';
const _TRACK_URL   = 'https://windoform.vercel.app/api/track';
const _CFG_DEFAULT = { projectId: 'fuarbot', apiKey: 'AIzaSyCvFT3pQn4OFtTjep87-y9wrSZjrKbno1s' };

Office.initialize = function () {};

// ── Haupt-Event-Handler ───────────────────────────────────────────────────────
function onItemSend(event) {
  const TIMEOUT_MS = 9000; // 9 Sekunden Max – danach immer senden

  const done = () => event.completed({ allowEvent: true });

  // Timeout-Sicherung: E-Mail wird immer gesendet
  const timer = setTimeout(done, TIMEOUT_MS);

  _autoSave()
    .catch(() => {})
    .finally(() => { clearTimeout(timer); done(); });
}

// ── Auto-Save Logik ───────────────────────────────────────────────────────────
async function _autoSave() {
  // Auth + Config aus localStorage (wird vom Taskpane gesetzt)
  let auth, cfg;
  try {
    auth = JSON.parse(localStorage.getItem(_AUTH_KEY) || 'null');
    cfg  = JSON.parse(localStorage.getItem(_CFG_KEY)  || 'null') || _CFG_DEFAULT;
  } catch { return; }

  if (!auth?.idToken || !cfg?.projectId) return;

  // Token ggf. aktualisieren
  let token = auth.idToken;
  if (Date.now() >= (auth.expiresAt || 0) - 60000) {
    try {
      const res  = await fetch(`${_TOKEN_BASE}?key=${cfg.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(auth.refreshToken)}`,
      });
      const data = await res.json();
      if (res.ok) token = data.id_token;
    } catch {}
  }
  if (!token) return;

  const item = Office.context.mailbox.item;
  if (!item) return;

  // OWA-Sync erzwingen
  await new Promise(r => item.body.prependAsync('', { coercionType: Office.CoercionType.Html }, r));

  // Empfänger (To)
  const toList = await new Promise(resolve =>
    item.to.getAsync(r =>
      resolve(r.status === Office.AsyncResultStatus.Succeeded ? r.value || [] : [])
    )
  );
  const to = (toList[0]?.emailAddress || '').toLowerCase();
  if (!to) return;

  // Betreff (mit Retry)
  let subject = '';
  for (let i = 0; i < 3; i++) {
    subject = await _getStr(cb => item.subject.getAsync({ asyncContext: null }, cb));
    if (subject.trim()) break;
    await _wait(400);
  }

  // Body Text
  const bodyText = await _getStr(cb =>
    item.body.getAsync(Office.CoercionType.Text, { asyncContext: null }, cb)
  );

  // Body HTML (für Tracking-Pixel)
  const bodyHtml = await _getStr(cb =>
    item.body.getAsync(Office.CoercionType.Html, { asyncContext: null }, cb)
  );

  // Kontakt-ID aus crm_customers suchen
  let contactId = '';
  try {
    const qRes = await fetch(
      `${_FS_BASE}/${cfg.projectId}/databases/(default)/documents:runQuery?key=${cfg.apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ structuredQuery: {
          from:  [{ collectionId: 'crm_customers' }],
          where: { fieldFilter: { field: { fieldPath: 'email' }, op: 'EQUAL', value: { stringValue: to } } },
          limit: 1,
        }}),
      }
    );
    const rows = await qRes.json();
    if (Array.isArray(rows) && rows[0]?.document) {
      contactId = rows[0].document.name.split('/').pop();
    }
  } catch {}

  // Tracking-ID
  const trackingId = _uuid();
  const now        = new Date().toISOString();

  // Tracking-Pixel injizieren
  if (bodyHtml) {
    const pixel   = `<img src="${_TRACK_URL}/${trackingId}" width="1" height="1" alt="" `
      + `style="display:block;width:1px!important;height:1px!important;`
      + `max-width:1px!important;overflow:hidden;opacity:0.01;">`;
    const newHtml = bodyHtml.includes('</body>')
      ? bodyHtml.replace('</body>', pixel + '</body>')
      : bodyHtml + pixel;
    await new Promise(r =>
      item.body.setAsync(newHtml, { coercionType: Office.CoercionType.Html }, r)
    );
  }

  // E-Mail in crm_emails speichern
  const fields = {
    direction:    { stringValue: 'outbound' },
    contactId:    { stringValue: contactId },
    to:           { stringValue: to },
    from:         { stringValue: auth.email.toLowerCase() },
    subject:      { stringValue: subject || '(Kein Betreff)' },
    text:         { stringValue: (bodyText || '').slice(0, 5000) },
    sentAt:       { timestampValue: now },
    createdAt:    { timestampValue: now },
    createdBy:    { stringValue: auth.email },
    createdByUid: { stringValue: auth.uid || '' },
    source:       { stringValue: 'outlook-addin' },
    status:       { stringValue: 'sent' },
    trackingId:   { stringValue: trackingId },
  };

  await fetch(
    `${_FS_BASE}/${cfg.projectId}/databases/(default)/documents/${_EM_COL}?key=${cfg.apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ fields }),
    }
  );

  // Tracking-Dokument anlegen
  await fetch(
    `${_FS_BASE}/${cfg.projectId}/databases/(default)/documents/${_TR_COL}?documentId=${trackingId}&key=${cfg.apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fields: {
        trackingId: { stringValue: trackingId },
        subject:    { stringValue: subject || '' },
        to:         { stringValue: to },
        from:       { stringValue: auth.email.toLowerCase() },
        createdAt:  { timestampValue: now },
        openCount:  { integerValue: '0' },
      }}),
    }
  );
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────
function _getStr(fn) {
  return new Promise(resolve => {
    try {
      fn(r => resolve(
        r?.status === Office.AsyncResultStatus.Succeeded ? (r.value ?? '') : ''
      ));
    } catch { resolve(''); }
  });
}

const _wait = ms => new Promise(r => setTimeout(r, ms));

function _uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
