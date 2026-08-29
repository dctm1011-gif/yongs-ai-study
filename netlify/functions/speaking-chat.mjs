const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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

  const { messages, topic, isFeedbackRequest } = await req.json();

  const systemPrompt = isFeedbackRequest
    ? `You are an English tutor reviewing a student's conversation. In 2-3 sentences, mention one thing they did well and one specific improvement (e.g., grammar, vocabulary, phrasing). Be warm and encouraging. Write in Korean.`
    : `You are a friendly English conversation partner for a Korean learner at B2-C1 level.
Today's topic: "${topic}"
Rules:
- Keep responses to 2-4 sentences maximum. Be concise.
- Use natural everyday English.
- If the user makes a grammar error, gently note it at the end: "(Tip: '...' sounds more natural)"
- Always end with one follow-up question to keep the conversation going.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      messages,
    }),
  });

  const data = await res.json();
  const reply = data.content?.[0]?.text ?? 'Sorry, something went wrong.';

  return new Response(JSON.stringify({ reply }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
