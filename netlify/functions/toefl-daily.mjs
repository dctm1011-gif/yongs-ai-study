import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, set, get, remove } from 'firebase/database';

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
    const dailyPath = resolve(process.cwd(), 'toefl', 'daily.json');
    let dailyData;
    try {
      dailyData = JSON.parse(readFileSync(dailyPath, 'utf-8'));
    } catch (e) {
      console.log('daily.json not found, using default data');
      dailyData = { sections: [], date: getKSTDateString() };
    }

    // Save to Firebase
    const firebaseApp = getFirebaseApp();
    const db = getDatabase(firebaseApp);
    const today = getKSTDateString();

    await set(ref(db, `toefl/problems/${today}`), {
      ...dailyData,
      timestamp: new Date().toISOString(),
      date: today,
    });

    console.log('✅ TOEFL problems saved to Firebase');

    // 오늘 날짜 외 이전 데이터 삭제
    const snap = await get(ref(db, 'toefl/problems'));
    if (snap.exists()) {
      const oldKeys = Object.keys(snap.val()).filter(k => k !== today);
      await Promise.all(oldKeys.map(k => remove(ref(db, `toefl/problems/${k}`))));
      if (oldKeys.length > 0) console.log(`🗑️ Removed old TOEFL entries: ${oldKeys.join(', ')}`);
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'TOEFL problems generated and saved',
      date: today,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error processing TOEFL data:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to process TOEFL data',
        date: getKSTDateString(),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
