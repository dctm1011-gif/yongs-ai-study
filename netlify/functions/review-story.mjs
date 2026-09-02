const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const { words } = await req.json();
  if (!words?.length) {
    return new Response(JSON.stringify({ error: 'No words' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const wordList = words.map(w => `${w.word} (${w.meaning})`).join(', ');

  const prompt = `You are an English writing tutor. Write a cohesive story (5-6 sentences) that naturally uses ALL of these vocabulary words: ${wordList}

Rules:
- Use every word listed above in context
- Sentences must flow as one coherent narrative
- Make it vivid and engaging
- Bold each vocabulary word using **word** syntax
- Provide a natural Korean translation for EACH sentence

Return ONLY this JSON (no markdown code block, no extra text):
{
  "sentences": [
    {"en": "First English sentence with **vocab** bolded.", "ko": "첫 번째 문장의 자연스러운 한국어 번역."},
    {"en": "Second sentence with **vocab** bolded.", "ko": "두 번째 문장 번역."}
  ],
  "wordNuances": [
    {"word": "word1", "meaning": "한국어 뜻", "nuance": "이 문장에서의 뉘앙스와 사용법을 한국어로 2~3문장으로 설명"}
  ]
}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await res.json();
    const text = data.content?.[0]?.text ?? '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('No JSON in response');
    const result = JSON.parse(m[0]);

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
};
