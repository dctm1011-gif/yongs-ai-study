export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body;
  try { body = await req.json(); } catch { return Response.json({ error: '잘못된 요청' }, { status: 400 }); }

  const { text, type, prompt, structure } = body;

  if (!text || text.trim().split(/\s+/).length < 3) {
    return Response.json({ error: '내용을 더 입력해주세요.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: 'API key가 설정되지 않았습니다.' }, { status: 500 });

  let systemPrompt, userMessage;

  if (type === 'writing') {
    systemPrompt = 'You are a TOEFL writing expert. Give practical feedback in Korean. Be concise and specific. Max 300 words.';
    const structStr = structure
      ? `\n구조 가이드: Intro - ${structure.intro || ''} / Body1 - ${structure.body1 || ''} / Body2 - ${structure.body2 || ''} / Conclusion - ${structure.conclusion || ''}`
      : '';
    userMessage = `TOEFL Writing 문제: "${prompt}"${structStr}\n\n학생 답안:\n${text}\n\n아래 형식으로 피드백 주세요:\n1. 예상 점수 (TOEFL 0-30점)\n2. 잘한 점 (2가지)\n3. 개선할 점 (2-3가지, 구체적으로)\n4. 눈에 띄는 문법/어휘 실수 (있다면)`;
  } else {
    systemPrompt = 'You are a TOEFL speaking expert. Give practical feedback in Korean. Be concise and encouraging. Max 250 words.';
    userMessage = `TOEFL Speaking 문제: "${prompt}"\n\n학생 답변:\n${text}\n\n아래 형식으로 피드백 주세요:\n1. 예상 점수 (TOEFL 0-4점)\n2. 내용 전달력\n3. 언어 사용 (문법/어휘)\n4. 한 줄 개선 조언`;
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Claude API error:', err);
    return Response.json({ error: 'Claude API 오류가 발생했습니다.' }, { status: 500 });
  }

  const result = await res.json();
  const feedback = result.content?.[0]?.text || '피드백을 가져올 수 없습니다.';
  return Response.json({ feedback });
};

export const config = { path: '/api/feedback' };
