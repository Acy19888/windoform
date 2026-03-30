// Vercel Serverless Function — Gmail IMAP → Firestore sync
// Fetches latest emails from Gmail and saves new ones to Firestore crm_emails
// Required env vars: GMAIL_USER, GMAIL_APP_PASSWORD, FB_API_KEY, FB_PROJECT_ID

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const FB_API_KEY  = process.env.FB_API_KEY;
  const FB_PROJECT  = process.env.FB_PROJECT_ID;
  const GMAIL_USER  = process.env.GMAIL_USER;
  const GMAIL_PASS  = process.env.GMAIL_APP_PASSWORD;

  if (!GMAIL_USER || !GMAIL_PASS) {
    return res.status(200).json({ ok: false, error: 'GMAIL_USER oder GMAIL_APP_PASSWORD fehlt in Vercel env vars' });
  }
  if (!FB_API_KEY || !FB_PROJECT) {
    return res.status(200).json({ ok: false, error: 'Firebase env vars fehlen' });
  }

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  let saved = 0;
  let skipped = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      // Get total message count
      const status = await client.status('INBOX', { messages: true });
      const total  = status.messages || 0;
      if (total === 0) {
        return res.status(200).json({ ok: true, saved: 0, skipped: 0 });
      }

      // Fetch last 20 messages (most recent) — keep short to avoid Vercel timeout
      const start = Math.max(1, total - 19);
      const range = `${start}:${total}`;

      console.log(`[imap-sync] Fetching seq ${range} (total=${total})`);

      for await (const msg of client.fetch(range, { source: true, uid: true, flags: true })) {
        try {
          const parsed = await simpleParser(msg.source);

          const messageId = (parsed.messageId || `uid-${msg.uid}`).trim();
          // Sanitize for use as Firestore doc ID
          const docId = messageId.replace(/[<>@./: ]+/g, '_').slice(0, 200);

          const fromRaw  = parsed.from?.text || '';
          const fromAddr = parsed.from?.value?.[0]?.address || fromRaw;
          const fromName = parsed.from?.value?.[0]?.name || '';

          const toRaw  = parsed.to?.text || process.env.RECIPIENT_EMAIL || GMAIL_USER;
          const toAddr = process.env.RECIPIENT_EMAIL || GMAIL_USER;

          const subject = parsed.subject || '(Konu yok)';
          const html    = parsed.html    || '';
          const text    = parsed.text    || '';
          const sentAt  = parsed.date?.toISOString() || new Date().toISOString();

          // Check if already exists in Firestore
          const checkUrl = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents/crm_emails/${docId}?key=${FB_API_KEY}`;
          const checkRes = await fetch(checkUrl);
          if (checkRes.ok) {
            skipped++;
            continue; // Already saved
          }

          // Save to Firestore using docId as document name (deduplication)
          const doc = {
            fields: {
              direction:  { stringValue: 'inbound' },
              contactId:  { stringValue: '' },
              from:       { stringValue: fromAddr },
              fromRaw:    { stringValue: fromName ? `${fromName} <${fromAddr}>` : fromAddr },
              to:         { stringValue: toAddr },
              subject:    { stringValue: String(subject).slice(0, 500) },
              html:       { stringValue: String(html).slice(0, 50000) },
              text:       { stringValue: String(text).slice(0, 10000) },
              messageId:  { stringValue: messageId.slice(0, 500) },
              sentAt:     { stringValue: sentAt },
              createdAt:  { timestampValue: new Date().toISOString() },
              opened:     { booleanValue: false },
              read:       { booleanValue: false },
              status:     { stringValue: 'received' },
            }
          };

          const saveUrl = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents/crm_emails/${docId}?key=${FB_API_KEY}`;
          const saveRes = await fetch(saveUrl, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(doc),
          });

          if (saveRes.ok) {
            saved++;
            console.log(`[imap-sync] ✓ Saved: ${subject} from ${fromAddr}`);
          } else {
            const err = await saveRes.json().catch(() => ({}));
            console.error('[imap-sync] Firestore save error:', JSON.stringify(err));
          }
        } catch (msgErr) {
          console.error('[imap-sync] Message parse error:', msgErr.message);
        }
      }
    } finally {
      lock.release();
    }

    console.log(`[imap-sync] Done — saved: ${saved}, skipped (already exist): ${skipped}`);
    return res.status(200).json({ ok: true, saved, skipped });

  } catch (e) {
    console.error('[imap-sync] Error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  } finally {
    try { await client.logout(); } catch (_) {}
  }
}
