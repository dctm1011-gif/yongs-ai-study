import { getStore } from '@netlify/blobs';
import { createLogger, corsHeaders } from './_utils.mjs';
import { initializeApp, getApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

export const config = {
  schedule: '* * * * *',
};

const log = createLogger('runtime-errors');
const MAX_ERRORS = 500;

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

export default async (req, context) => {
  // Scheduled execution (no request object)
  if (!req || !req.url) {
    try {
      let app;
      try {
        app = initializeApp(firebaseConfig);
      } catch (e) {
        app = getApp();
      }
      const db = getDatabase(app);
      const timestamp = new Date().toISOString();

      await set(ref(db, `errors/runtime/${timestamp.split('T')[0]}/${timestamp.split('T')[1]}`), {
        timestamp,
        status: 'monitored',
        type: 'runtime-check',
      });

      log.log('✅ Runtime check saved to Firebase');
      return new Response(
        JSON.stringify({ success: true, message: 'Runtime monitoring' }),
        { status: 200 }
      );
    } catch (error) {
      log.error('Runtime check failed:', error.message);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500 }
      );
    }
  }

  // HTTP request handling
  const cors = corsHeaders();

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const store = getStore({ name: 'runtime-errors', consistency: 'strong' });

    if (req.method === 'GET') {
      try {
        const data = await store.get('list', { type: 'json' }).catch(() => null);
        const errors = data || [];
        log.log('GET runtime errors', { count: errors.length });
        return Response.json(errors, { headers: cors });
      } catch (e) {
        log.error('GET failed', { message: String(e) });
        return Response.json([], { status: 200, headers: cors });
      }
    }

    if (req.method === 'POST') {
      try {
        const errorLog = await req.json();

        let errors = [];
        try {
          const data = await store.get('list', { type: 'json' }).catch(() => null);
          errors = data || [];
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

        await store.set('list', JSON.stringify(errors));
        log.log('POST successful', { total: errors.length });

        return Response.json({ success: true, total: errors.length }, { headers: cors });
      } catch (e) {
        log.error('POST failed', { message: String(e) });
        return Response.json({ error: String(e) }, { status: 400, headers: cors });
      }
    }

    if (req.method === 'DELETE') {
      try {
        await store.delete('list');
        log.log('DELETE successful');
        return Response.json({ success: true }, { headers: cors });
      } catch (e) {
        log.error('DELETE failed', { message: String(e) });
        return Response.json({ error: String(e) }, { status: 400, headers: cors });
      }
    }

    log.error('Unsupported method', { method: req.method });
    return new Response('Method not allowed', { status: 405, headers: cors });
  } catch (error) {
    log.error('Request failed', { message: error.message });
    return Response.json({ error: String(error) }, { status: 500, headers: cors });
  }
};

