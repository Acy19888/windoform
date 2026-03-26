// Vercel Serverless Function — Eingehende E-Mails (Resend Inbound Webhook)
// Webhook URL in Resend setzen: https://windoform.vercel.app/api/email/inbound

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const FB_API_KEY = process.env.FB_API_KEY;
  const FB_PROJECT = process.env.FB_PROJECT_ID;

  try {
    const body = req.body || {};

    // Debug: log raw structure so we can see what Resend sends
    console.log('[inbound] Raw body keys:', Object.keys(body));
    console.log('[inbound] body.type:', body.type);
    console.log('[inbound] Raw (first 2000):', JSON.stringify(body).slice(0, 2000));

    // Resend inbound format: { type: 'email.received', data: { ... } }
    // Fallback: body itself might be the email data
    const emailData = body.data || body;

    // ── From ──────────────────────────────────────────────────
    const fromRaw = emailData.from || emailData.sender || '';
    const extractEmail = str => {
      if (!str) return '';
      if (Array.isArray(str)) str = str[0];
      const m = str.match(/<([^>]+)>/);
      return m ? m[1] : str.trim();
    };
    const fromEmail = extractEmail(fromRaw);

    // ── To ────────────────────────────────────────────────────
    const toRaw   = emailData.to || emailData.recipient || '';
    const toEmail = Array.isArray(toRaw) ? toRaw.join(', ') : String(toRaw);

    // ── Subject ───────────────────────────────────────────────
    const subject = emailData.subject || '(Konu yok)';

    // ── HTML & Text — try many possible field paths ───────────
    let html = emailData.html
      || emailData.html_body
      || emailData.body_html
      || emailData.htmlBody
      || '';

    let text = emailData.text
      || emailData.text_body
      || emailData.body_text
      || emailData.plain
      || emailData.plainText
      || emailData.textBody
      || '';

    // If still empty, try nested payload structure (some providers use this)
    if (!html && !text && emailData.payload) {
      html = emailData.payload.html || emailData.payload.body || '';
      text = emailData.payload.text || emailData.payload.plain || '';
    }

    // Last resort: store readable JSON summary as text for debugging
    if (!html && !text) {
      const keys = Object.keys(emailData).filter(k => !['headers','attachments','dkim','spf'].includes(k));
      text = `[Debug] Alanlar: ${keys.join(', ')}\n\nRaw: ${JSON.stringify(emailData).slice(0, 1000)}`;
      console.warn('[inbound] html & text both empty — stored debug info as text');
    }

    // ── Metadata ──────────────────────────────────────────────
    const messageId = emailData.message_id
      || emailData.messageId
      || (Array.isArray(emailData.headers)
          ? emailData.headers.find(h => h.name?.toLowerCase() === 'message-id')?.value
          : emailData.headers?.['message-id'])
      || '';

    const sentAt = emailData.date
      || emailData.sent_at
      || emailData.created_at
      || emailData.timestamp
      || new Date().toISOString();

    console.log('[inbound] Parsed — from:', fromEmail, '| subject:', subject, '| html len:', html.length, '| text len:', text.length);

    if (!FB_API_KEY || !FB_PROJECT) {
      console.warn('[inbound] Firebase env vars missing');
      return res.status(200).json({ ok: true, warn: 'Firebase nicht konfiguriert' });
    }

    // ── Firestore speichern ───────────────────────────────────
    const doc = {
      fields: {
        direction:  { stringValue: 'inbound' },
        contactId:  { stringValue: '' },
        from:       { stringValue: fromEmail },
        fromRaw:    { stringValue: String(fromRaw).slice(0, 500) },
        to:         { stringValue: toEmail },
        subject:    { stringValue: String(subject).slice(0, 500) },
        html:       { stringValue: String(html).slice(0, 50000) },
        text:       { stringValue: String(text).slice(0, 10000) },
        messageId:  { stringValue: String(messageId).slice(0, 500) },
        sentAt:     { stringValue: String(sentAt) },
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
      console.error('[inbound] Firestore error:', JSON.stringify(err));
    } else {
      console.log('[inbound] ✓ Saved email from', fromEmail, '— subject:', subject);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[inbound] Error:', e.message, e.stack);
    return res.status(500).json({ error: e.message });
  }
}
