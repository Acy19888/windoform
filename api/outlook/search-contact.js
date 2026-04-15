// GET /api/outlook/search-contact?email=foo@bar.com&projectId=X&apiKey=Y
// 1. Searches 'contacts' collection for matching email (email or contactEmail field)
// 2. Searches 'crm_emails' for recent communication history
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

  const runQuery = (query) =>
    fetch(`${base}:runQuery?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authH },
      body: JSON.stringify({ structuredQuery: query }),
    }).then(r => r.json());

  try {
    // ── 1. Kontakt suchen in: kisiler, contacts (beide Collections, mehrere Email-Felder)
    const contactCollections = ['kisiler', 'contacts'];
    const emailFields        = ['email', 'contactEmail', 'emailAddress', 'e_posta'];

    const contactQueries = [];
    for (const col of contactCollections) {
      for (const field of emailFields) {
        contactQueries.push(runQuery({
          from:  [{ collectionId: col }],
          where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: emailLow } } },
          limit: 1,
        }));
      }
    }

    const contactResults = await Promise.all(contactQueries);

    // Ersten gefundenen Kontakt nehmen
    const contactRows = contactResults.flat().filter(r => r && r.document);

    let contactId   = '';
    let contactName = '';

    if (contactRows.length > 0) {
      const f = contactRows[0].document.fields || {};
      contactId = contactRows[0].document.name.split('/').pop();
      // Name aus firstName+lastName oder name-Feld
      const first = f.firstName?.stringValue || '';
      const last  = f.lastName?.stringValue  || '';
      contactName = (first + ' ' + last).trim() || f.name?.stringValue || '';
    }

    // ── 2. Letzte E-Mails aus crm_emails holen ───────────────────────
    const [outData, inData] = await Promise.all([
      runQuery({
        from:    [{ collectionId: 'crm_emails' }],
        where:   { fieldFilter: { field: { fieldPath: 'to' }, op: 'EQUAL', value: { stringValue: emailLow } } },
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit:   5,
      }),
      runQuery({
        from:    [{ collectionId: 'crm_emails' }],
        where:   { fieldFilter: { field: { fieldPath: 'from' }, op: 'EQUAL', value: { stringValue: emailLow } } },
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit:   5,
      }),
    ]);

    const parseRows = (rows) =>
      (Array.isArray(rows) ? rows : [])
        .filter(r => r.document)
        .map(r => {
          const f   = r.document.fields || {};
          const dir = f.direction?.stringValue || 'outbound';
          const rawField = dir === 'outbound'
            ? (f.toRaw?.stringValue || f.to?.stringValue || '')
            : (f.fromRaw?.stringValue || f.from?.stringValue || '');
          const nameMatch = rawField.match(/^(.+?)\s*</);
          const nameFromEmail = nameMatch ? nameMatch[1].trim() : '';
          return {
            direction: dir,
            contactId: f.contactId?.stringValue || '',
            subject:   f.subject?.stringValue   || '(Konu yok)',
            sentAt:    f.sentAt?.timestampValue  || f.createdAt?.timestampValue || '',
            name:      nameFromEmail,
          };
        });

    const allEmails = [...parseRows(outData), ...parseRows(inData)]
      .sort((a, b) => (b.sentAt > a.sentAt ? 1 : -1))
      .slice(0, 8);

    // contactId aus E-Mails als Fallback (falls nicht in contacts gefunden)
    if (!contactId) contactId = allEmails.find(e => e.contactId)?.contactId || '';
    if (!contactName) contactName = allEmails.find(e => e.name)?.name || '';

    const found = contactRows.length > 0 || allEmails.length > 0;

    return res.status(200).json({
      found,
      name:         contactName,
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
