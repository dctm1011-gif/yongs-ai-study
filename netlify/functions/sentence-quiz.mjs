import { createLogger, corsHeaders } from './_utils.mjs';

const log = createLogger('sentence-quiz');

export default async (req) => {
  const cors = corsHeaders();
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  try {
    const { word, meaning, pos } = await req.json();
    if (!word?.trim() || !meaning?.trim()) {
      return Response.json({ error: 'Missing word or meaning' }, { status: 400, headers: cors });
    }

    const prompt = `You are an expert English vocabulary teacher creating a nuance-judgment quiz.

Word: "${word}"${pos ? ` (${pos})` : ''}
Korean meaning: "${meaning}"

Create two sentences:

O sentence — natural, idiomatic usage a native speaker would say without hesitation.

X sentence — must follow ALL of these rules:
1. Grammatically CORRECT
2. Uses "${word}" with its correct dictionary meaning
3. BUT has ONE subtle problem: wrong register, unusual collocation, semantically odd context, or slight meaning mismatch
4. Should look plausible to a learner but feel off to a native speaker
5. Do NOT make it obviously wrong, nonsensical, or humorous

Good X examples:
- Using a formal/academic word in a trivial everyday context ("He scrutinized his sandwich.")
- Unusual collocation where a different word is strongly preferred ("She was reluctant to eat her favorite pizza." — reluctant implies something burdensome)
- Slight semantic scope mismatch ("The medicine alleviated her birthday." — alleviate needs a negative state)

Return ONLY valid JSON, no markdown, no explanation outside JSON:
{
  "oSentence": "<natural English sentence>",
  "xSentence": "<subtly off English sentence>",
  "explanation": "<Korean: X 문장이 어색한 이유를 구체적으로 1~2문장. 어떤 뉘앙스 차이인지, 어떤 상황/단어와 어울리는지 설명>"
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
        max_tokens: 400,
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
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}') + 1;
    if (start === -1 || end === 0) throw new Error('No JSON in response');
    const result = JSON.parse(text.slice(start, end));

    if (!result.oSentence || !result.xSentence || !result.explanation) {
      throw new Error('Incomplete fields in response');
    }

    log.log('Generated quiz pair', { word });
    return Response.json(result, { headers: cors });

  } catch (error) {
    log.error('Failed', { message: error.message });
    return Response.json({ error: error.message }, { status: 500, headers: cors });
  }
};

export const config = { path: '/api/sentence-quiz' };
