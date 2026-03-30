// GET /api/outlook/search-contact?email=foo@bar.com&projectId=X&apiKey=Y&token=Z
// Searches crm_emails for existing communication with this email address
// Returns: { found, name, email, contactId, recentEmails[] }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { email, projectId, apiKey } = req.query;
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;

  if (!email || !projectId || !apiKey) {
    return res.status(400).json({ error: 'email, projectId, apiKey required' });
  }

  const emailLow = email.toLowerCase().trim();
  const base     = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const authH    = token ? { Authorization: `Bearer ${token}` } : {};

  try {
    // Query crm_emails where 'to' = email (outbound) OR 'from' = email (inbound)
    // Firestore doesn't support OR across fields in one query → two queries
    const [outRes, inRes] = await Promise.all([
      fetch(`${base}:runQuery?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({ structuredQuery: {
          from:    [{ collectionId: 'crm_emails' }],
          where:   { fieldFilter: { field: { fieldPath: 'to' }, op: 'EQUAL', value: { stringValue: emailLow } } },
          orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
          limit:   5,
        }}),
      }),
      fetch(`${base}:runQuery?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({ structuredQuery: {
          from:    [{ collectionId: 'crm_emails' }],
          where:   { fieldFilter: { field: { fieldPath: 'from' }, op: 'EQUAL', value: { stringValue: emailLow } } },
          orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
          limit:   5,
        }}),
      }),
    ]);

    const parseRows = (rows) =>
      (Array.isArray(rows) ? rows : [])
        .filter(r => r.document)
        .map(r => {
          const f = r.document.fields || {};
          const dir = f.direction?.stringValue || 'outbound';
          // Extract display name from toRaw / fromRaw
          const rawField = dir === 'outbound' ? (f.toRaw?.stringValue || f.to?.stringValue || '')
                                               : (f.fromRaw?.stringValue || f.from?.stringValue || '');
          const nameMatch = rawField.match(/^(.+?)\s*</);
          const name = nameMatch ? nameMatch[1].trim() : '';
          return {
            _id:       r.document.name.split('/').pop(),
            direction: dir,
            contactId: f.contactId?.stringValue || '',
            subject:   f.subject?.stringValue || '(Konu yok)',
            sentAt:    f.sentAt?.timestampValue || f.createdAt?.timestampValue || '',
            name,
          };
        });

    const [outData, inData] = await Promise.all([outRes.json(), inRes.json()]);
    const outEmails = parseRows(outData);
    const inEmails  = parseRows(inData);

    // Merge + sort by date
    const allEmails = [...outEmails, ...inEmails]
      .sort((a, b) => (b.sentAt > a.sentAt ? 1 : -1))
      .slice(0, 8);

    // Try to find name from emails
    const nameFromEmail = allEmails.find(e => e.name)?.name || '';
    const contactId     = allEmails.find(e => e.contactId)?.contactId || '';

    return res.status(200).json({
      found:        allEmails.length > 0,
      name:         nameFromEmail,
      email:        emailLow,
      contactId,
      recentEmails: allEmails.map(e => ({
        direction: e.direction,
        subject:   e.subject,
        sentAt:    e.sentAt,
      })),
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
