import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

export const config = {
  schedule: '0 0 15 * *', // 매월 15일 00:00 UTC = 09:00 KST
};

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
};

export default async () => {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const db = getDatabase(app);

  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const twoMonthsAgo = new Date(kst.getFullYear(), kst.getMonth() - 2, 1)
    .toISOString().slice(0, 7); // e.g. "2026-07"

  await set(ref(db, 'investment/complexUpdateReminder'), {
    active: true,
    targetMonth: twoMonthsAgo,
    message: `${twoMonthsAgo} 기준 부동산 단지 데이터 업데이트가 필요합니다`,
    createdAt: kst.toISOString(),
  });

  console.log(`[+] 업데이트 알림 설정 완료: ${twoMonthsAgo} 기준`);
  return new Response('ok', { status: 200 });
};
