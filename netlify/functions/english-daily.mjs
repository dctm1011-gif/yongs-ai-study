import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

export const config = {
  schedule: '0 21 * * *',
};

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

// Netlify Functions run in UTC; KST (UTC+9) doesn't roll to the next
// calendar day until 09:00 UTC, so the plain UTC date lags KST by a day
// for 9 hours each morning. Shift the clock forward before formatting.
function getKSTDateString() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

export default async (req, context) => {
  try {
    // Read the daily.json file
    const dailyPath = resolve(process.cwd(), 'english', 'daily.json');
    let dailyData;
    try {
      dailyData = JSON.parse(readFileSync(dailyPath, 'utf-8'));
    } catch (e) {
      console.log('daily.json not found, using default data');
      dailyData = { words: [], date: getKSTDateString() };
    }

    // Initialize Firebase and save to database
    const firebaseApp = getFirebaseApp();
    const db = getDatabase(firebaseApp);
    const today = getKSTDateString();

    await set(ref(db, `english/words/${today}`), {
      ...dailyData,
      timestamp: new Date().toISOString(),
      date: today,
    });

    console.log(`✅ English data saved to Firebase for ${today}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'English data saved to Firebase',
        date: today,
        count: dailyData.words?.length || 0,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error processing daily English data:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to process daily English content',
        date: getKSTDateString(),
        details: error.message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
