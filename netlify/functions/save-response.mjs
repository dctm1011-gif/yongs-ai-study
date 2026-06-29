import { getStore } from '@netlify/blobs';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body;
  try { body = await req.json(); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }

  const { date, prompt, answer, feedback, wordCount, timestamp } = body;

  if (!date || !answer) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const store = getStore('toefl-responses');
    const existing = await store.get('responses.json', { type: 'json' }) || { responses: [] };

    existing.responses.push({
      date,
      prompt: prompt || '',
      answer,
      feedback: feedback || '',
      wordCount: wordCount || 0,
      timestamp: timestamp || new Date().toISOString()
    });

    await store.setJSON('responses.json', existing);

    return Response.json({
      ok: true,
      total: existing.responses.length
    });
  } catch (err) {
    console.error('Blob storage error:', err);
    return Response.json({ error: 'Failed to save response' }, { status: 500 });
  }
};

export const config = { path: '/api/save-response' };
