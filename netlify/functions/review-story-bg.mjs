const DB_URL = process.env.FIREBASE_DATABASE_URL;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export const config = {
  type: 'background',
};

function getKSTDateString() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

export default async (req) => {
  const { words, uid, token } = await req.json();
  if (!words?.length || !uid || !token) return;

  const today = getKSTDateString();
  const wordList = words.map(w => `${w.word} (${w.meaning})`).join(', ');

  const prompt = `Write a short story (3-4 sentences) using ALL these words: ${wordList}

Rules: use every word naturally, bold each with **word**, add Korean translation per sentence.

Return ONLY JSON:
{"sentences":[{"en":"Sentence with **vocab**.","ko":"한국어 번역."}],"wordNuances":[{"word":"word1","meaning":"뜻","nuance":"뉘앙스 1~2문장"}]}`;

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
    if (!m) return;
    const story = JSON.parse(m[0]);

    // 사용자 auth token으로 Firebase REST API 직접 기록
    await fetch(
      `${DB_URL}/users/${uid}/english/reviewStory/${today}.json?auth=${token}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(story),
      }
    );
  } catch (e) {
    console.error('review-story-bg 실패:', e);
  }
};
