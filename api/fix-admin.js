// ONE-TIME admin role fix endpoint
// DELETE THIS FILE after use!
// Call: GET /api/fix-admin?email=cyuksel88@gmail.com

export default async function handler(req, res) {
  const FB_API_KEY = process.env.FB_API_KEY;
  const FB_PROJECT = process.env.FB_PROJECT_ID;
  const targetEmail = req.query.email || 'cyuksel88@gmail.com';

  if (!FB_API_KEY || !FB_PROJECT) {
    return res.status(500).json({ error: 'Firebase env vars missing' });
  }

  const base = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents`;

  // Search fuarEmployees for this email
  const queryRes = await fetch(`${base}:runQuery?key=${FB_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'fuarEmployees' }],
      where: { compositeFilter: { op: 'OR', filters: [
        { fieldFilter: { field: { fieldPath: 'email' }, op: 'EQUAL', value: { stringValue: targetEmail } } },
        { fieldFilter: { field: { fieldPath: 'emailAddress' }, op: 'EQUAL', value: { stringValue: targetEmail } } },
      ]}},
      limit: 5,
    }}),
  });

  const rows = await queryRes.json();
  const docs = (Array.isArray(rows) ? rows : []).filter(r => r.document);

  if (docs.length === 0) {
    return res.status(404).json({ error: `No fuarEmployees document found for ${targetEmail}`, hint: 'Check the email address or add the user in Firebase console' });
  }

  // Update each matched doc to admin
  const results = [];
  for (const row of docs) {
    const docName = row.document.name;
    const patchRes = await fetch(`${docName}?updateMask.fieldPaths=crmRole&key=${FB_API_KEY}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { crmRole: { stringValue: 'admin' } } }),
    });
    const patchData = await patchRes.json();
    results.push({ doc: docName.split('/').pop(), ok: patchRes.ok, status: patchRes.status });
  }

  return res.status(200).json({ ok: true, updated: results, message: `Done! ${targetEmail} is now admin. Please DELETE /api/fix-admin.js now.` });
}
