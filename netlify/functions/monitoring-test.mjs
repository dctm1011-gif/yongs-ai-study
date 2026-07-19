import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

export const config = {
  schedule: '* * * * *',
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

let app = null;
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

function getFirebaseApp() {
  if (!app) {
    const existing = getApps();
    app = existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
  }
  return app;
}

export default async (req, context) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  try {
    const timestamp = new Date().toISOString();
    const value = Math.floor(Math.random() * 10000);
    const randomData = {
      temperature: parseFloat((Math.random() * 50).toFixed(2)),
      cpu: parseFloat((Math.random() * 100).toFixed(2)),
      memory: parseFloat((Math.random() * 100).toFixed(2)),
    };

    const data = {
      timestamp,
      value,
      randomData,
      apiVersion: 'v1',
      message: 'Monitoring data updated',
    };

    const firebaseApp = getFirebaseApp();
    const database = getDatabase(firebaseApp);
    const dbRef = ref(database, 'monitoring/latest');

    await Promise.race([
      set(dbRef, data),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase timeout')), 5000))
    ]);

    return new Response(
      JSON.stringify({
        ...data,
        firebase: 'updated',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          ...corsHeaders(),
        },
      }
    );
  } catch (error) {
    console.error('Firebase error:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to update Firebase',
        message: error.message,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(),
        },
      }
    );
  }
};
