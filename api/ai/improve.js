// api/ai/improve.js — Verbessert E-Mail-Text mit Claude AI
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text } = req.body || {};
  if (!text || text.trim().length < 5) {
    return res.status(400).json({ error: 'Metin çok kısa' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY ayarlanmamış' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Verbessere den folgenden E-Mail-Text. Mache ihn professionell, klar und höflich. Behalte die ursprüngliche Sprache (Deutsch/Türkisch/Englisch) bei. Antworte NUR mit dem verbesserten Text, keine Erklärungen, keine Anführungszeichen.\n\nOriginaltext:\n${text}`,
        }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || 'API Fehler' });
    }

    const improved = data.content?.[0]?.text || '';
    return res.status(200).json({ improved });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
