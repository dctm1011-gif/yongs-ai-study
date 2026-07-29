import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, get, set } from 'firebase/database';
import { createLogger, corsHeaders } from './_utils.mjs';

const log = createLogger('announcements');

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

let app = null;
function getFirebaseApp() {
  if (!app) {
    const existing = getApps();
    app = existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
  }
  return app;
}

export default async (req) => {
  const cors = corsHeaders();

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    log.log('Processing request', { method: req.method });
    const db = getDatabase(getFirebaseApp());
    const listRef = ref(db, 'announcements/list');

    if (req.method === 'GET') {
      const snap = await get(listRef);
      const result = snap.exists() ? snap.val() : [];
      log.log('GET announcements', { count: result.length });
      return Response.json(result, { headers: cors });
    }

    if (req.method === 'POST') {
      const data = await req.json();

      if (!data.id || !data.title || !data.message) {
        return Response.json(
          { error: 'Missing required fields: id, title, message' },
          { status: 400, headers: cors }
        );
      }

      const snap = await get(listRef);
      const existing = snap.exists() ? snap.val() : [];

      if (!existing.find(a => a.id === data.id)) {
        existing.unshift({
          id: data.id,
          title: data.title,
          message: data.message,
          type: data.type || 'info',
          createdAt: new Date().toISOString(),
          importance: data.importance || 'normal',
          expiresAt: data.expiresAt || null,
        });

        if (existing.length > 50) existing.pop();
        await set(listRef, existing);
        log.log('POST successful', { id: data.id, total: existing.length });
      }

      return Response.json({ ok: true, timestamp: new Date().toISOString() }, { headers: cors });
    }

    if (req.method === 'DELETE') {
      const { id } = await req.json();
      const snap = await get(listRef);
      const existing = snap.exists() ? snap.val() : [];
      const filtered = existing.filter(a => a.id !== id);
      await set(listRef, filtered);
      log.log('DELETE successful', { id, remaining: filtered.length });
      return Response.json({ ok: true }, { headers: cors });
    }

    return new Response('Method not allowed', { status: 405, headers: cors });
  } catch (error) {
    log.error('Request failed', { message: error.message });
    return Response.json({ error: error.message }, { status: 500, headers: cors });
  }
};

export const config = { path: '/api/announcements' };
