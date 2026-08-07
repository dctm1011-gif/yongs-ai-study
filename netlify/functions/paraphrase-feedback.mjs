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
  "suggestion": "<Korean: 위의 어휘/문법 피드백에서 지적한 구체적인 수정사항(예: 어떤 단어를 무엇으로 바꿔야 하는지)을 먼저 언급하고, 추가로 문장 구조를 어떻게 개선할지 함께 제안하세요. 잘못된 점만 지적하지 말고 '~로 바꾸면 더 좋다'는 방향으로 설명하세요.>",
  "rewrite": "<English: a model paraphrase that explicitly fixes every vocabulary and grammar issue identified in the vocabulary and grammar fields above, AND uses a clearly different sentence structure from the original. The corrected words/phrases must actually appear in this rewrite.>"
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
      // Claude sometimes prepends conversational text before JSON — extract the object directly
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}') + 1;
      if (start === -1 || end === 0) throw new Error('No JSON object in response');
      feedback = JSON.parse(text.slice(start, end));
    } catch {
      throw new Error(`JSON parse failed. Raw: ${text.slice(0, 200)}`);
    }

    log.log('Feedback generated', { score: feedback.score });
    return Response.json(feedback, { headers: cors });

  } catch (error) {
    log.error('Failed', { message: error.message });
    return Response.json({ error: error.message }, { status: 500, headers: cors });
  }
};

export const config = { path: '/api/paraphrase-feedback' };
