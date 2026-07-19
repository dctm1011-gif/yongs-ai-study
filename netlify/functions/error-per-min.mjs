import { createLogger } from './_utils.mjs';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

export const config = {
  schedule: '* * * * *',
};

const log = createLogger('error-per-min');

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

export default async (req, context) => {
  try {
    const firebaseApp = getFirebaseApp();
    const db = getDatabase(firebaseApp);
    const timestamp = new Date().toISOString();

    await set(ref(db, `errors/stats/${timestamp.split('T')[0]}`), {
      timestamp,
      status: 'monitoring',
      type: 'stats-collection',
    });

    log.log('✅ Error stats saved to Firebase');
    return new Response(
      JSON.stringify({ success: true, message: 'Stats collected' }),
      { status: 200 }
    );
  } catch (error) {
    log.error('Stats collection failed:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
};

