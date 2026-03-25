// Vercel Serverless Function — E-Mail Öffnungs-Tracking
// Wenn der Empfänger die E-Mail öffnet, lädt sein E-Mail-Client dieses Pixel.
// → Firestore wird aktualisiert → 2. Haken im CRM erscheint

export default async function handler(req, res) {
  const { id } = req.query;
  const FB_API_KEY = process.env.FB_API_KEY;
  const FB_PROJECT = process.env.FB_PROJECT_ID;

  // Firestore: opened = true, openedAt = jetzt
  if (id && id !== 'undefined' && FB_API_KEY && FB_PROJECT) {
    try {
      const patchUrl = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents/crm_emails/${id}?updateMask.fieldPaths=opened&updateMask.fieldPaths=openedAt&key=${FB_API_KEY}`;
      await fetch(patchUrl, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fields: {
          opened:   { booleanValue: true },
          openedAt: { timestampValue: new Date().toISOString() },
        }}),
      });
    } catch (e) {
      // Silent — don't fail the pixel
    }
  }

  // 1×1 transparentes GIF zurückgeben
  const gif = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.end(gif);
}
