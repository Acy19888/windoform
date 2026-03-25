// Vercel Serverless Function — Eingehende E-Mails (Resend Inbound Webhook)
// Resend sendet POST wenn eine E-Mail empfangen wird
// Webhook URL in Resend setzen: https://windoform.vercel.app/api/email/inbound

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const FB_API_KEY = process.env.FB_API_KEY;
  const FB_PROJECT = process.env.FB_PROJECT_ID;

  try {
    const body = req.body || {};

    // Resend Inbound format: { type: 'email.received', data: { from, to, subject, html, text, ... } }
    const emailData = body.data || body; // fallback falls kein wrapper

    const fromRaw   = emailData.from || '';
    const toRaw     = emailData.to || '';
    const subject   = emailData.subject || '(Kein Betreff)';
    const html      = emailData.html || '';
    const text      = emailData.text || '';
    const messageId = emailData.headers?.['message-id'] || emailData.message_id || '';
    const sentAt    = emailData.date || new Date().toISOString();

    // E-Mail-Adresse extrahieren aus "Name <email@domain.de>"
    const extractEmail = str => {
      const m = str.match(/<([^>]+)>/);
      return m ? m[1] : str.trim();
    };
    const fromEmail = extractEmail(Array.isArray(fromRaw) ? fromRaw[0] : fromRaw);
    const toEmail   = Array.isArray(toRaw) ? toRaw.join(', ') : toRaw;

    if (!FB_API_KEY || !FB_PROJECT) {
      console.warn('[inbound] Firebase env vars missing');
      return res.status(200).json({ ok: true, warn: 'Firebase nicht konfiguriert' });
    }

    // In Firestore speichern (crm_emails)
    const doc = {
      fields: {
        direction:  { stringValue: 'inbound' },
        contactId:  { stringValue: '' }, // wird später per E-Mail-Matching gefüllt
        from:       { stringValue: fromEmail },
        to:         { stringValue: toEmail },
        subject:    { stringValue: subject },
        html:       { stringValue: html.slice(0, 50000) }, // Firestore limit
        text:       { stringValue: text.slice(0, 10000) },
        messageId:  { stringValue: messageId },
        sentAt:     { stringValue: sentAt },
        createdAt:  { timestampValue: new Date().toISOString() },
        opened:     { booleanValue: false },
        read:       { booleanValue: false },
        status:     { stringValue: 'received' },
      }
    };

    const fsUrl = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents/crm_emails?key=${FB_API_KEY}`;
    const fsRes = await fetch(fsUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(doc),
    });

    if (!fsRes.ok) {
      const err = await fsRes.json().catch(() => ({}));
      console.error('[inbound] Firestore error:', err);
    } else {
      console.log('[inbound] Saved email from', fromEmail);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[inbound] Error:', e);
    return res.status(500).json({ error: e.message });
  }
}
