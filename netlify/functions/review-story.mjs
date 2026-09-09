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

  const prompt = `You have these ${words.length} English vocabulary words to review: ${wordList}

Create a review in two sections:

1. STORY: Write 5-7 sentences forming a coherent, natural story. Use as many words as fit naturally — do NOT force words that feel out of place. Bold each used word with **word**. Add Korean translation after each sentence.

2. EXTRA: For any words that did not fit the story, write one natural standalone example sentence each. Bold the word. Add Korean translation.

Return ONLY JSON (no markdown):
{"sentences":[{"en":"Story sentence with **vocab**.","ko":"한국어 번역."}],"extra":[{"en":"Standalone sentence with **word**.","ko":"한국어 번역."}],"wordNuances":[{"word":"word1","meaning":"뜻","nuance":"뉘앙스 1~2문장"}]}`;

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
        max_tokens: 4000,
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
