// Vercel Serverless Function — Gmail IMAP → Firestore sync
// Fetches latest emails from Gmail and saves new ones to Firestore crm_emails
// Required env vars: GMAIL_USER, GMAIL_APP_PASSWORD, FB_API_KEY, FB_PROJECT_ID
// Optional query param: ?q=searchterm  → IMAP server-side search

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

  const searchQuery = (req.query?.q || '').trim();

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
      // Determine which messages to fetch
      let fetchRange = null;
      let fetchUids  = null;

      if (searchQuery) {
        // IMAP server-side search across subject, from, body
        console.log(`[imap-sync] Searching IMAP for: "${searchQuery}"`);
        const matchedUids = await client.search(
          { or: [{ subject: searchQuery }, { from: searchQuery }, { body: searchQuery }] },
          { uid: true }
        );
        if (!matchedUids || matchedUids.length === 0) {
          return res.status(200).json({ ok: true, saved: 0, skipped: 0, searched: true });
        }
        // Fetch last 20 matches to avoid timeout
        fetchUids = matchedUids.slice(-20);
        console.log(`[imap-sync] Search matched ${matchedUids.length}, fetching last ${fetchUids.length}`);
      } else {
        // Normal sync: last 20 messages by sequence number
        const status = await client.status('INBOX', { messages: true });
        const total  = status.messages || 0;
        if (total === 0) {
          return res.status(200).json({ ok: true, saved: 0, skipped: 0 });
        }
        fetchRange = `${Math.max(1, total - 19)}:${total}`;
        console.log(`[imap-sync] Fetching seq ${fetchRange} (total=${total})`);
      }

      // Fetch by UID list or sequence range — first pass: parse all messages
      const fetchIterable = fetchUids
        ? client.fetch(fetchUids, { source: true, uid: true, flags: true }, { uid: true })
        : client.fetch(fetchRange, { source: true, uid: true, flags: true });

      const parsedMsgs = [];
      for await (const msg of fetchIterable) {
        try {
          const parsed = await simpleParser(msg.source);
          const messageId = (parsed.messageId || `uid-${msg.uid}`).trim();
          const docId     = messageId.replace(/[<>@./: ]+/g, '_').slice(0, 200);
          parsedMsgs.push({ parsed, messageId, docId, uid: msg.uid });
        } catch (e) { console.error('[imap-sync] parse error:', e.message); }
      }

      // Batch-check which docIds already exist (1 request instead of N)
      const base = `projects/${FB_PROJECT}/databases/(default)/documents`;
      const batchRes = await fetch(
        `https://firestore.googleapis.com/v1/${base}:batchGet?key=${FB_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documents: parsedMsgs.map(m => `${base}/crm_emails/${m.docId}`) }),
        }
      );
      const batchData = await batchRes.json().catch(() => []);
      const existingIds = new Set(
        (Array.isArray(batchData) ? batchData : [])
          .filter(r => r.found)
          .map(r => r.found.name.split('/').pop())
      );

      for (const { parsed, messageId, docId } of parsedMsgs) {
        try {
          if (existingIds.has(docId)) { skipped++; continue; }

          const fromAddr = parsed.from?.value?.[0]?.address || parsed.from?.text || '';
          const fromName = parsed.from?.value?.[0]?.name || '';
          const toAddr   = process.env.RECIPIENT_EMAIL || GMAIL_USER;
          const subject  = parsed.subject || '(Konu yok)';
          const html     = parsed.html    || '';
          const text     = parsed.text    || '';
          const sentAt   = parsed.date?.toISOString() || new Date().toISOString();

          // Save to Firestore
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

          const saveRes = await fetch(
            `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents/crm_emails/${docId}?key=${FB_API_KEY}`,
            { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) }
          );

          if (saveRes.ok) {
            saved++;
            console.log(`[imap-sync] ✓ Saved: ${subject} from ${fromAddr}`);
          } else {
            console.error('[imap-sync] Firestore error:', await saveRes.text().catch(() => ''));
          }
        } catch (msgErr) {
          console.error('[imap-sync] Message parse error:', msgErr.message);
        }
      }
    } finally {
      lock.release();
    }

    console.log(`[imap-sync] Done — saved: ${saved}, skipped: ${skipped}`);
    return res.status(200).json({ ok: true, saved, skipped });

  } catch (e) {
    console.error('[imap-sync] Error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  } finally {
    try { await client.logout(); } catch (_) {}
  }
}
