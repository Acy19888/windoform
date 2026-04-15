// Windoform CRM — E-Mail Tracking Pixel
// Wird aufgerufen wenn der Empfänger die E-Mail öffnet.
// → Aktualisiert email_tracking/{id} in Firestore

const PIXEL_B64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export default async function handler(req, res) {
  const { id } = req.query;

  // Pixel sofort zurückgeben (unabhängig von Firestore)
  const gif = Buffer.from(PIXEL_B64, 'base64');
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.end(gif);

  if (!id || id === 'undefined') return;

  const PROJECT = process.env.FB_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'fuarbot';
  const API_KEY = process.env.FB_API_KEY    || process.env.FIREBASE_API_KEY    || 'AIzaSyCvFT3pQn4OFtTjep87-y9wrSZjrKbno1s';
  const now     = new Date().toISOString();
  const DOC_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/email_tracking/${id}?key=${API_KEY}`;

  try {
    // Aktuellen Stand lesen
    const getRes = await fetch(DOC_URL);
    let openCount   = 1;
    let firstOpened = now;

    if (getRes.ok) {
      const doc = await getRes.json();
      if (doc.fields) {
        openCount   = (parseInt(doc.fields.openCount?.integerValue) || 0) + 1;
        firstOpened = doc.fields.openedAt?.timestampValue || now;
      }
    }

    // Tracking-Dokument aktualisieren
    await fetch(
      DOC_URL
        + '&updateMask.fieldPaths=openedAt'
        + '&updateMask.fieldPaths=openCount'
        + '&updateMask.fieldPaths=lastOpenedAt',
      {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            openedAt:     { timestampValue: firstOpened },
            lastOpenedAt: { timestampValue: now },
            openCount:    { integerValue: String(openCount) },
          }
        })
      }
    );
  } catch (e) {
    // Stiller Fehler — Pixel bereits geliefert
    console.error('[windoform/track]', e.message);
  }
}
