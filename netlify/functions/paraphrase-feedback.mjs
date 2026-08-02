import { createLogger, corsHeaders } from './_utils.mjs';

const log = createLogger('paraphrase-feedback');

export default async (req) => {
  const cors = corsHeaders();

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors });
  }

  try {
    const { original, userAnswer } = await req.json();

    if (!original || !userAnswer?.trim()) {
      return Response.json({ error: 'Missing original or userAnswer' }, { status: 400, headers: cors });
    }

    log.log('Evaluating paraphrase', { originalLen: original.length, answerLen: userAnswer.length });

    const prompt = `You are an expert TOEFL writing instructor. Evaluate the student's paraphrase and respond ONLY with a valid JSON object — no markdown, no code fences, no extra text.

Original sentence:
"${original}"

Student's paraphrase:
"${userAnswer}"

JSON format to return:
{
  "score": <integer 1–10>,
  "meaning": "<Korean: did the student preserve the core meaning? 1–2 sentences>",
  "vocabulary": "<Korean: did the student use different vocabulary effectively? 1–2 sentences>",
  "grammar": "<Korean: any grammar issues? 1–2 sentences>",
  "suggestion": "<Korean: one specific improvement tip>",
  "rewrite": "<English: an improved version of the student's attempt>"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      log.error('Claude API error', { status: response.status, err });
      return Response.json({ error: 'AI service error' }, { status: 502, headers: cors });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? '';

    let feedback;
    try {
      feedback = JSON.parse(text);
    } catch {
      // strip potential markdown code fences and retry
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      feedback = JSON.parse(cleaned);
    }

    log.log('Feedback generated', { score: feedback.score });
    return Response.json(feedback, { headers: cors });

  } catch (error) {
    log.error('Failed', { message: error.message });
    return Response.json({ error: error.message }, { status: 500, headers: cors });
  }
};

export const config = { path: '/api/paraphrase-feedback' };
