import { getStore } from '@netlify/blobs';

const STORE_KEY = 'runtime-errors';
const MAX_ERRORS = 500;

export default async (req, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    const store = getStore('yongstudy-runtime-errors');

    if (req.method === 'GET') {
      try {
        const data = await store.get(STORE_KEY);
        const errors = data ? JSON.parse(data) : [];
        return new Response(JSON.stringify(errors), { status: 200, headers });
      } catch (e) {
        return new Response(JSON.stringify([]), { status: 200, headers });
      }
    }

    if (req.method === 'POST') {
      try {
        const errorLog = await req.json();

        let errors = [];
        try {
          const data = await store.get(STORE_KEY);
          errors = data ? JSON.parse(data) : [];
        } catch (e) {
          errors = [];
        }

        // 새 에러 추가 (최상단)
        errors.unshift({
          ...errorLog,
          id: `runtime-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          savedAt: new Date().toISOString(),
        });

        // 최대 개수 유지
        if (errors.length > MAX_ERRORS) {
          errors = errors.slice(0, MAX_ERRORS);
        }

        await store.set(STORE_KEY, JSON.stringify(errors));

        return new Response(JSON.stringify({ success: true, total: errors.length }), {
          status: 201,
          headers,
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), { status: 400, headers });
      }
    }

    if (req.method === 'DELETE') {
      try {
        await store.delete(STORE_KEY);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), { status: 400, headers });
      }
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers });
  }
};
