import Anthropic from '@anthropic-ai/sdk';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, get, set } from 'firebase/database';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
};

function getFirebaseApp() {
  const existing = getApps();
  return existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
}

function wordToKey(word) {
  return word.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { word, meaning, example_en, explanation } = body;
  if (!word) {
    return new Response(JSON.stringify({ error: 'word required' }), { status: 400 });
  }

  const key = wordToKey(word);

  // 이미 Firebase에 있으면 반환
  try {
    const db = getDatabase(getFirebaseApp());
    const snap = await get(ref(db, `english/sentences/${key}`));
    if (snap.exists()) {
      return new Response(JSON.stringify({ success: true, data: snap.val(), cached: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch {}

  // Claude로 생성
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const contextHint = [meaning, example_en, explanation].filter(Boolean).join(' / ');
  const prompt = `다음 TOEFL 어휘에 대해 문장 복습 데이터를 JSON으로만 생성해주세요.
단어: ${word}${contextHint ? `\n참고: ${contextHint}` : ''}

JSON 형식 (객체 1개):
{
  "sentence": "Skipping sleep only exacerbates the anxiety you already feel before an exam.",
  "sentence_ko": "수면 부족은 시험 전 불안을 더욱 악화시킬 뿐이에요.",
  "nuance": "이미 존재하는 부정적 상황을 능동적으로 더 심화시키는 뉘앙스. 외부 요인이 문제를 증폭시킬 때 씁니다.",
  "context": "건강, 갈등, 환경 문제, 사회 현상이 더 나빠지는 맥락. 뉴스·학술문에서 정책 비판할 때 자주 등장.",
  "everyday_usage": "'This only exacerbates the problem.' / 'Don't exacerbate the situation.' — stress/crisis를 목적어로 자주 씁니다.",
  "examples": [
    {"en": "Pollution exacerbates respiratory illness.", "ko": "오염은 호흡기 질환을 악화시킨다."},
    {"en": "His comment only exacerbated the tension.", "ko": "그의 발언은 긴장을 더욱 고조시켰다."},
    {"en": "Drought exacerbated the food shortage.", "ko": "가뭄이 식량 부족을 악화시켰다."}
  ]
}

규칙:
- sentence: 짧고 자연스러운 일상 영어 문장
- sentence_ko: 한국어 번역
- nuance: 뉘앙스 (한국어, 2-3문장)
- context: 사용 상황 (한국어, 2-3문장)
- everyday_usage: 실제 일상 표현 패턴과 예시 (한국어, 2-3문장)
- examples: 추가 예문 3개 (각 12단어 이하 영문 + 한국어 번역)
- JSON 객체만 반환, 다른 텍스트 없음`;

  let data;
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content[0].text.trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}') + 1;
    if (start === -1 || end === 0) throw new Error('No JSON found');
    data = JSON.parse(text.slice(start, end));
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Generation failed', detail: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Firebase에 저장
  try {
    const db = getDatabase(getFirebaseApp());
    await set(ref(db, `english/sentences/${key}`), data);
  } catch (e) {
    console.warn('Firebase save failed:', e.message);
  }

  return new Response(JSON.stringify({ success: true, data, cached: false }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
