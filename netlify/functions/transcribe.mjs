export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response('API key not configured', { status: 500 });

  const formData = await req.formData();
  const audioFile = formData.get('audio');
  if (!audioFile) return Response.json({ error: 'No audio file' }, { status: 400 });

  const whisperForm = new FormData();
  whisperForm.append('file', audioFile, 'speech.webm');
  whisperForm.append('model', 'whisper-1');
  whisperForm.append('language', 'en');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: whisperForm,
  });

  if (!res.ok) {
    const err = await res.text();
    return Response.json({ error: 'Whisper error: ' + err }, { status: 500 });
  }

  const result = await res.json();
  return Response.json({ text: result.text || '' });
};

export const config = { path: '/api/transcribe' };
