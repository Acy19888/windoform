// Vercel Serverless Function — Email senden via Resend
// Env vars needed: RESEND_API_KEY, FB_API_KEY, FB_PROJECT_ID, APP_URL

export default async function handler(req, res) {
  // CORS for same-origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const RESEND_KEY  = process.env.RESEND_API_KEY;
  const FB_API_KEY  = process.env.FB_API_KEY;
  const FB_PROJECT  = process.env.FB_PROJECT_ID;
  const APP_URL     = process.env.APP_URL || 'https://windoform.vercel.app';

  if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY nicht konfiguriert' });

  const { to, subject, html, fromName, fromEmail, replyTo, emailDocId } = req.body || {};

  if (!to || !subject || !fromEmail) {
    return res.status(400).json({ error: 'to, subject, fromEmail sind pflicht' });
  }

  // Tracking pixel in HTML einbauen
  const pixelUrl = emailDocId ? `${APP_URL}/api/track/${emailDocId}` : null;
  const pixelTag = pixelUrl
    ? `<img src="${pixelUrl}" width="1" height="1" style="display:none;border:0;" alt="" />`
    : '';
  const htmlWithTracking = (html || '') + pixelTag;

  // Via Resend senden
  const payload = {
    from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    to:   Array.isArray(to) ? to : [to],
    subject,
    html: htmlWithTracking,
  };
  if (replyTo) payload.reply_to = replyTo;

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const data = await resendRes.json();
    if (!resendRes.ok) {
      console.error('[send] Resend error:', data);
      return res.status(resendRes.status).json({ error: data.message || 'Resend Fehler' });
    }

    // Firestore: Status auf 'sent' setzen
    if (emailDocId && FB_API_KEY && FB_PROJECT) {
      const patchUrl = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents/crm_emails/${emailDocId}?updateMask.fieldPaths=status&updateMask.fieldPaths=resendId&key=${FB_API_KEY}`;
      await fetch(patchUrl, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fields: {
          status:   { stringValue: 'sent' },
          resendId: { stringValue: data.id || '' },
        }}),
      }).catch(e => console.warn('[send] Firestore patch failed:', e.message));
    }

    return res.status(200).json({ id: data.id });
  } catch (e) {
    console.error('[send] Error:', e);
    return res.status(500).json({ error: e.message });
  }
}
