import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

// Firebase 설정 (google-services.json에서 추출한 값)
// 아래 값들을 Firebase Console에서 확인하세요
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
};

// Firebase 초기화
let app: any = null;

export function getFirebaseApp() {
  if (!app) {
    try {
      const apps = require('firebase/app').getApps?.() || [];
      if (apps.length > 0) {
        app = apps[0];
      } else {
        app = initializeApp(firebaseConfig);
      }
    } catch (e) {
      app = initializeApp(firebaseConfig);
    }
  }
  return app;
}

// Realtime Database 참조
export const database = getDatabase(getFirebaseApp());

// 앱 내보내기 (필요시 사용)
export default getFirebaseApp();
