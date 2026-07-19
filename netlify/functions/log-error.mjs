import { getStore } from '@netlify/blobs';
import { createLogger, corsHeaders } from './_utils.mjs';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, push } from 'firebase/database';

export const config = {
  schedule: '* * * * *',
};

const log = createLogger('log-error');
const MAX_ERRORS = 1000;

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
      const app = initializeApp(firebaseConfig);
      const db = getDatabase(app);
      const timestamp = new Date().toISOString();

      // Store scheduled check
      await set(ref(db, `errors/last-check`), {
        timestamp,
        status: 'ok',
        type: 'scheduled',
      });

      log.log('✅ Scheduled check recorded to Firebase');
      return new Response(
        JSON.stringify({ success: true, timestamp, message: 'Scheduled check completed' }),
        { status: 200 }
      );
    } catch (error) {
      log.error('Scheduled check failed:', error.message);
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
    const store = getStore({ name: 'error-logs', consistency: 'strong' });

    if (req.method === 'GET') {
      try {
        const data = await store.get('list', { type: 'json' }).catch(() => null);
        const errors = data || [];
        log.log('GET error logs', { count: errors.length });
        return Response.json(errors, { headers: cors });
      } catch (e) {
        log.error('GET failed', { message: String(e) });
        return Response.json([], { status: 200, headers: cors });
      }
    }

    if (req.method === 'POST') {
      try {
        const batch = await req.json();

        if (!batch.errors || !Array.isArray(batch.errors)) {
          return Response.json(
            { error: 'Invalid batch format' },
            { status: 400, headers: cors }
          );
        }

        let errors = [];
        try {
          const data = await store.get('list', { type: 'json' }).catch(() => null);
          errors = data || [];
        } catch (e) {
          errors = [];
        }

        // Add batch errors to the list
        const newErrors = batch.errors.map((err) => ({
          ...err,
          batchId: batch.id,
          receivedAt: new Date().toISOString(),
        }));

        errors.unshift(...newErrors);

        // Keep only recent errors
        if (errors.length > MAX_ERRORS) {
          errors = errors.slice(0, MAX_ERRORS);
        }

        await store.set('list', JSON.stringify(errors));
        log.log('POST successful', {
          batchId: batch.id,
          errorsAdded: batch.errors.length,
          total: errors.length,
        });

        return Response.json(
          {
            success: true,
            batchId: batch.id,
            errorsAdded: batch.errors.length,
            total: errors.length,
          },
          { headers: cors }
        );
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

export const config = { path: '/api/log-error' };
