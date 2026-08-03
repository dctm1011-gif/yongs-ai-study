// OpenAI TTS proxy — returns audio/mpeg for a given text + speaker name.
// Cached for 24 h so replays don't incur extra API cost.

const VOICE_MAP = {
  'Narrator':   'nova',     // 밝은 여성 (메인 진행)
  'Professor':  'shimmer',  // 차분한 여성 (교수)
  'Student A':  'fable',    // 활기찬 남성
  'Student B':  'echo',     // 중성 남성
  'Man':        'fable',    // 활기찬 남성
  'Woman':      'nova',     // 밝은 여성
};

export default async (req) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'GET only' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const text = url.searchParams.get('text');
  const speaker = url.searchParams.get('speaker') || 'Narrator';

  if (!text) {
    return new Response(JSON.stringify({ error: 'text param required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not set' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const voice = VOICE_MAP[speaker] || 'alloy';

  const ttsResponse = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'tts-1-hd', input: text, voice }),
  });

  if (!ttsResponse.ok) {
    const errText = await ttsResponse.text();
    console.error('OpenAI TTS error:', ttsResponse.status, errText);
    return new Response(JSON.stringify({ error: 'TTS generation failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const audioBuffer = await ttsResponse.arrayBuffer();

  return new Response(audioBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=86400',
      'Content-Length': String(audioBuffer.byteLength),
    },
  });
};
