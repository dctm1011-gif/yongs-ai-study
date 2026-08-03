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

    const prompt = `You are a strict TOEFL writing instructor. Evaluate the student's paraphrase and respond ONLY with a valid JSON object — no markdown, no code fences, no extra text.

Original sentence:
"${original}"

Student's paraphrase:
"${userAnswer}"

Evaluation criteria — be strict and specific:
- A good paraphrase MUST change BOTH vocabulary AND sentence structure significantly. Just swapping one or two words (e.g. "due to" → "because of") is NOT a paraphrase — it scores 1–3.
- Sentence structure change means: reordering clauses, switching active↔passive voice, changing subject, converting a phrase to a clause, etc.
- Vocabulary change means: replacing content words with true synonyms or conceptually equivalent expressions — NOT near-identical words.
- The core meaning must be preserved even with drastic structural changes.

For the "rewrite" field: produce a model paraphrase that is STRUCTURALLY DIFFERENT from the original (different clause order or sentence pattern) AND uses substantially different vocabulary. Do NOT just lightly rephrase.

JSON format to return:
{
  "score": <integer 1–10>,
  "meaning": "<Korean: did the student preserve the core meaning? 1–2 sentences>",
  "vocabulary": "<Korean: did the student change vocabulary substantially, or just minor synonyms? 1–2 sentences. Be specific about which words were/weren't changed enough.>",
  "grammar": "<Korean: any grammar issues? 1–2 sentences>",
  "suggestion": "<Korean: one concrete structural change the student should make — e.g. 'subject를 바꿔서 수동태로 써보세요' or '두 절의 순서를 바꿔보세요'>",
  "rewrite": "<English: a model paraphrase with clearly different structure AND vocabulary from the original>"
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
