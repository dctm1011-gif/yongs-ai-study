const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

async function resolveImageUrl(query) {
  try {
    // Wikipedia REST API — free, no key, reliable for common topics
    const keyword = query.trim().split(/\s+/).slice(0, 3).join(' ');
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(keyword)}`,
      {
        headers: { 'User-Agent': 'YongStudyApp/1.0 (educational)' },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (res.ok) {
      const data = await res.json();
      const src = data?.thumbnail?.source;
      if (src) {
        // Upscale thumbnail to 400px wide
        return src.replace(/\/\d+px-/, '/400px-');
      }
    }
  } catch {}
  return null;
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const { messages, topic, isFeedbackRequest, history } = await req.json();

  const systemPrompt = isFeedbackRequest
    ? `당신은 친절한 영어 튜터입니다. 학생과의 대화 내역을 분석하여 상세한 피드백을 한국어로 작성하세요.
절대 마크다운 기호(**, *, ---, #, __)를 사용하지 마세요. 순수 텍스트만 사용하고, 항목 구분은 빈 줄로만 합니다.

아래 순서대로 작성하세요:

전반적 평가
이번 대화에서 보여준 전반적인 영어 수준과 대화 흐름을 2~3문장으로 평가합니다.

문법 교정
대화에서 발견된 문법 오류를 구체적으로 지적합니다. 각각 "틀린 표현 → 올바른 표현 (이유)" 형식으로 씁니다. 오류가 없으면 "문법 오류 없음 - 훌륭합니다!"라고 씁니다.

더 자연스러운 표현
학생이 사용한 표현 중 원어민이 더 자주 쓰는 대안 표현이 있으면 2~3개 제안합니다. 없으면 생략합니다.

다음에 써볼 표현
오늘 주제와 관련해서 다음 대화에서 사용해보면 좋을 영어 표현이나 단어 2가지를 알려줍니다. 예문도 함께 써주세요.

격려
한 줄로 따뜻하게 마무리합니다.`
    : `You are a friendly English conversation partner for a Korean learner at B2-C1 level.
Today's topic: "${topic}"
${history?.length
  ? `\nYour memory of past conversations with this user (last ${history.length} sessions):\n${history.map(h => `- ${h.date} [Topic: ${h.topic}]: ${h.summary}`).join('\n')}\n\nIMPORTANT: You genuinely remember these past conversations. When the user asks "do you remember...?" or mentions something from before, check your memory above and respond naturally — confirm what you remember, reference specific details, and connect it to the current conversation. Never say you don't have memory of previous conversations.\n`
  : ''}Rules:
- Keep responses to 2-4 sentences maximum. Be concise.
- Use natural everyday English.
- If the user makes a grammar error, gently note it at the end: "(Tip: '...' sounds more natural)"
- Always end with one follow-up question to keep the conversation going.
- PHOTO RULE (very important): When the user asks to see a photo or picture of anything — phrases like "show me a picture of X", "사진 보여줘", "X 사진", "can I see X", etc. — you MUST write [IMAGE: 2-3 English keywords] at the very end of your reply. The app will automatically fetch and display the photo using that tag. Do NOT say you can't show pictures. Just include the tag and the app handles the rest. Example: user says "show me Australia" → you reply normally AND append [IMAGE: australia landscape]`;

  const callHaiku = (system, msgs, maxTokens) =>
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, system, messages: msgs }),
    }).then(r => r.json());

  // Run feedback + summary generation in parallel when ending conversation
  let reply = '';
  let summary = null;

  if (isFeedbackRequest) {
    const summaryPrompt = `Summarize this English conversation in 1-2 sentences in English. Focus on: what topics the user discussed, their English level, and any notable strengths or patterns. Be specific and concise. Return only the summary text, nothing else.`;

    const [feedbackData, summaryData] = await Promise.all([
      callHaiku(systemPrompt, messages, 800),
      callHaiku(summaryPrompt, messages, 150),
    ]);

    reply = feedbackData.content?.[0]?.text ?? '';
    summary = summaryData.content?.[0]?.text?.trim() ?? null;
  } else {
    const data = await callHaiku(systemPrompt, messages, 500);
    reply = data.content?.[0]?.text ?? '';
  }

  // Parse [IMAGE: query] tag and resolve to actual URL server-side
  let imageUrl = null;
  const imageMatch = reply.match(/\[IMAGE:\s*([^\]]+)\]/i);
  if (imageMatch) {
    const query = imageMatch[1].trim();
    reply = reply.replace(/\[IMAGE:\s*[^\]]+\]/gi, '').trim();
    imageUrl = await resolveImageUrl(query);
  }

  return new Response(JSON.stringify({ reply, imageUrl, summary }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
