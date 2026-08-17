import { corsHeaders } from './_utils.mjs';

export default async (req) => {
  const cors = corsHeaders();
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  try {
    const { word, meaning, sentence } = await req.json();
    if (!word?.trim()) return Response.json({ error: 'word required' }, { status: 400, headers: cors });

    const prompt = `Generate 3 short, natural example sentences for the English word "${word}"${meaning ? ` (Korean meaning: ${meaning})` : ''}.

Context sentence already used: "${sentence}"

Requirements:
- Each sentence must be different from the context sentence
- Keep each sentence under 12 words
- Show diverse practical usage (different situations/contexts)
- Provide a natural Korean translation for each

Return ONLY valid JSON with no markdown or extra text:
{"examples":[{"en":"...","ko":"..."},{"en":"...","ko":"..."},{"en":"...","ko":"..."}]}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      return Response.json({ error: 'Claude API failed' }, { status: 502, headers: cors });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? '';
    const parsed = JSON.parse(text);
    return Response.json(parsed, { headers: cors });
  } catch (e) {
    return Response.json({ error: 'Failed to generate examples' }, { status: 500, headers: cors });
  }
};
