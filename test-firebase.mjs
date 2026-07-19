import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

async function updateFirebase() {
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
    message: 'Test data from local script',
  };

  try {
    const dbRef = ref(database, 'monitoring/latest');
    await set(dbRef, data);
    console.log('✅ Firebase updated:', data);
  } catch (err) {
    console.error('❌ Firebase error:', err.message);
    process.exit(1);
  }
}

// 3초마다 반복
setInterval(updateFirebase, 3000);
console.log('🔄 Starting auto-update every 3 seconds...');
