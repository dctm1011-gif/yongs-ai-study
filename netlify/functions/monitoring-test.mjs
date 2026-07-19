import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// Firebase 설정 (환경변수에서 가져오기)
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
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  try {
    const timestamp = new Date().toISOString();
    const value = Math.floor(Math.random() * 10000); // 0-9999 랜덤
    const randomData = {
      temperature: parseFloat((Math.random() * 50).toFixed(2)), // 0-50도
      cpu: parseFloat((Math.random() * 100).toFixed(2)), // 0-100%
      memory: parseFloat((Math.random() * 100).toFixed(2)), // 0-100%
    };

    const data = {
      timestamp,
      value,
      randomData,
      apiVersion: 'v1',
      message: 'Monitoring data updated',
    };

    // Firebase에 데이터 쓰기
    const app = initializeApp(firebaseConfig);
    const database = getDatabase(app);
    const dbRef = ref(database, 'monitoring/latest');

    await set(dbRef, data);

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
    console.error('Firebase write error:', error);

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
