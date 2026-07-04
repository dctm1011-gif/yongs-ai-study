export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body;
  try { body = await req.json(); } catch { return new Response('Bad request', { status: 400 }); }

  const { text, voice = 'alloy' } = body;
  if (!text) return new Response('No text', { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response('API key not configured', { status: 500 });

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice,
      response_format: 'mp3',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response('TTS error: ' + err, { status: 500 });
  }

  const audio = await res.arrayBuffer();
  return new Response(audio, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};

export const config = { path: '/api/tts' };
