import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

export const config = {
  schedule: '10 20 * * *',
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

const DB_URL    = (process.env.FIREBASE_DATABASE_URL || '').replace(/\/$/, '');
const DB_SECRET = process.env.FIREBASE_DATABASE_SECRET;
const USER_UID  = process.env.FIREBASE_USER_UID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

let app = null;
function getFirebaseApp() {
  if (!app) {
    const existing = getApps();
    app = existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
  }
  return app;
}

function getKSTDateString() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

async function fbGet(path) {
  const res = await fetch(`${DB_URL}/${path}.json?auth=${DB_SECRET}`);
  if (!res.ok) return null;
  return res.json();
}

async function fbPut(path, data) {
  const res = await fetch(`${DB_URL}/${path}.json?auth=${DB_SECRET}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.ok;
}

async function generateReviewStory(today) {
  if (!DB_SECRET || !USER_UID || !ANTHROPIC_API_KEY) {
    console.warn('⚠️ review story 생성 스킵: 환경변수 누락 (FIREBASE_DATABASE_SECRET / FIREBASE_USER_UID / ANTHROPIC_API_KEY)');
    return;
  }

  // 이미 오늘치 있으면 스킵
  const existing = await fbGet(`users/${USER_UID}/english/reviewStory/${today}`);
  if (existing) {
    console.log('[review story] 이미 존재. 스킵.');
    return;
  }

  // reviewPool 읽기
  const pool = await fbGet(`users/${USER_UID}/english/reviewPool`);
  if (!pool) {
    console.warn('[review story] reviewPool 비어있음. 스킵.');
    return;
  }

  const candidates = Object.entries(pool)
    .filter(([, v]) => (v.count || 0) < 10)
    .sort(([, a], [, b]) => (a.count || 0) - (b.count || 0))
    .slice(0, 15);

  if (!candidates.length) {
    console.warn('[review story] 활성 단어 없음. 스킵.');
    return;
  }

  const words = candidates.map(([, v]) => ({ word: v.word, meaning: v.meaning || '' }));
  const wordList = words.map(w => `${w.word} (${w.meaning})`).join(', ');
  console.log(`[review story] 단어 ${words.length}개: ${wordList}`);

  const prompt = `You have these ${words.length} English vocabulary words to review: ${wordList}

Create a review in two sections:

1. STORY: Write 5-7 sentences forming a coherent, natural story. Use as many words as fit naturally — do NOT force words that feel out of place. Bold each used word with **word**. Add Korean translation after each sentence.

2. EXTRA: For any words that did not fit the story, write one natural standalone example sentence each. Bold the word. Add Korean translation.

Return ONLY JSON (no markdown):
{"sentences":[{"en":"Story sentence with **vocab**.","ko":"한국어 번역."}],"extra":[{"en":"Standalone sentence with **word**.","ko":"한국어 번역."}],"wordNuances":[{"word":"word1","meaning":"뜻","nuance":"뉘앙스 1~2문장"}]}`;

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const aiData = await aiRes.json();
  const text = aiData.content?.[0]?.text ?? '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) {
    console.error('[review story] JSON 파싱 실패:', text.slice(0, 200));
    return;
  }

  const story = JSON.parse(m[0]);
  const ok = await fbPut(`users/${USER_UID}/english/reviewStory/${today}`, story);
  console.log(ok
    ? `✅ review story 저장 완료: ${story.sentences?.length}문장`
    : '❌ review story Firebase 저장 실패');
}

export default async (req, context) => {
  try {
    const dailyPath = resolve(process.cwd(), 'english', 'daily.json');
    let dailyData;
    try {
      dailyData = JSON.parse(readFileSync(dailyPath, 'utf-8'));
    } catch (e) {
      console.log('daily.json not found, using default data');
      dailyData = { words: [], date: getKSTDateString() };
    }

    const firebaseApp = getFirebaseApp();
    const db = getDatabase(firebaseApp);
    const today = getKSTDateString();

    if (dailyData.date && dailyData.date !== today) {
      console.warn(`⚠️ english daily.json date mismatch: file=${dailyData.date}, today=${today}. Skipping.`);
      return new Response(
        JSON.stringify({ success: false, message: 'Skipped: daily.json is stale', fileDate: dailyData.date, today }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    await set(ref(db, `english/words/${today}`), {
      ...dailyData,
      timestamp: new Date().toISOString(),
      date: today,
    });
    console.log(`✅ English data saved to Firebase for ${today}`);

    // 문장복습 스토리 생성 (실패해도 단어 저장은 유지)
    try {
      await generateReviewStory(today);
    } catch (e) {
      console.error('[review story] 생성 중 예외:', e.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'English data + review story saved',
        date: today,
        count: dailyData.words?.length || 0,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing daily English data:', error);
    return new Response(
      JSON.stringify({ error: 'Failed', date: getKSTDateString(), details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
