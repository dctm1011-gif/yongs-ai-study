import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp } from 'firebase/app';
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

export default async (req, context) => {
  try {
    // Read the daily.json file
    const dailyPath = resolve(process.cwd(), 'english', 'daily.json');
    const dailyData = JSON.parse(readFileSync(dailyPath, 'utf-8'));

    // Initialize Firebase and save to database
    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);
    const today = new Date().toISOString().split('T')[0];

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
        date: new Date().toISOString().split('T')[0],
        details: error.message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
