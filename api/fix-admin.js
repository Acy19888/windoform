// ONE-TIME admin role fix endpoint — DELETE THIS FILE after use!

export default async function handler(req, res) {
  const FB_API_KEY = process.env.FB_API_KEY;
  const FB_PROJECT = process.env.FB_PROJECT_ID;

  if (!FB_API_KEY || !FB_PROJECT) {
    return res.status(500).json({ error: 'Firebase env vars missing' });
  }

  const base = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents`;

  // List ALL fuarEmployees to see what's stored
  const listRes = await fetch(`${base}/fuarEmployees?key=${FB_API_KEY}&pageSize=50`);
  const listData = await listRes.json();
  const docs = listData.documents || [];

  const targetEmail = req.query.email || '';
  const setAdmin    = req.query.set === 'admin';

  // Show all employees with their email fields
  const employees = docs.map(d => {
    const f = d.fields || {};
    return {
      uid:          d.name.split('/').pop(),
      email:        f.email?.stringValue || '',
      emailAddress: f.emailAddress?.stringValue || '',
      name:         f.name?.stringValue || f.displayName?.stringValue || '',
      crmRole:      f.crmRole?.stringValue || '(not set)',
    };
  });

  // If ?set=admin&email=xxx was passed, update that UID
  if (setAdmin && targetEmail) {
    const match = docs.find(d => {
      const f = d.fields || {};
      const uid = d.name.split('/').pop();
      return uid === targetEmail ||
        f.email?.stringValue === targetEmail ||
        f.emailAddress?.stringValue === targetEmail;
    });

    if (!match) {
      return res.status(404).json({ error: `Not found: ${targetEmail}`, employees });
    }

    const patchRes = await fetch(
      `${match.name}?updateMask.fieldPaths=crmRole&key=${FB_API_KEY}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { crmRole: { stringValue: 'admin' } } }),
      }
    );

    return res.status(200).json({
      ok: patchRes.ok,
      message: patchRes.ok ? `✅ Done! ${targetEmail} is now admin. DELETE /api/fix-admin.js now!` : '❌ Patch failed',
      uid: match.name.split('/').pop(),
    });
  }

  return res.status(200).json({ employees, usage: 'Add ?set=admin&email=YOUR_EMAIL_OR_UID to make someone admin' });
}
