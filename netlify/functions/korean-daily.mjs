import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, set, get } from 'firebase/database';

export const config = {
  schedule: '0 21 * * *', // 매일 06:00 KST
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

function getKSTDateString() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

const PROMPT = `한국어 학습 콘텐츠를 생성해줘. 마크다운 코드블록 없이 순수 JSON만 출력해.

[어휘 O/X 퀴즈 10문제]
고급 한국어 어휘(한자어·인문/철학/법 전문어)를 사용한 예문을 제시하고, 그 쓰임이 올바른지(O) 틀린지(X) 판별하는 퀴즈.

규칙:
- word: 고급 한자어 또는 전문어 (실제 사전 등재 단어만)
- sentence: word를 포함한 자연스러운 한국어 문장 (word가 sentence 안에 반드시 포함)
- isO: true면 올바른 쓰임, false면 틀린 쓰임 (단어의 뜻을 잘못 사용하거나 문맥이 맞지 않는 경우)
- explanation: 왜 O인지/X인지 명확한 해설 (단어 뜻 + 한자 + 판단 이유)
- O문제 5개, X문제 5개 균형 있게 배치. 순서는 무작위.
- 난이도: 한국어 원어민 성인 최상위 어휘력. 기초/중급 어휘 금지.
- X문제는 단어 뜻과 반대로 쓰거나 전혀 다른 맥락에서 쓴 문장으로 만들 것.

출력 형식:
{
  "sajaseongeo": {"idiom": "사자성어 한글", "hanja": "漢字", "meaning": "뜻 2-3문장", "example": "예문"},
  "sangshik": {"question": "질문", "options": ["보기1","보기2","보기3","보기4"], "answer": 0, "explanation": "해설 2-3문장", "category": "분야"},
  "oxQuiz": [
    {"word": "어휘1", "sentence": "예문1", "isO": true, "explanation": "해설1"},
    {"word": "어휘2", "sentence": "예문2", "isO": false, "explanation": "해설2"},
    {"word": "어휘3", "sentence": "예문3", "isO": true, "explanation": "해설3"},
    {"word": "어휘4", "sentence": "예문4", "isO": false, "explanation": "해설4"},
    {"word": "어휘5", "sentence": "예문5", "isO": true, "explanation": "해설5"},
    {"word": "어휘6", "sentence": "예문6", "isO": false, "explanation": "해설6"},
    {"word": "어휘7", "sentence": "예문7", "isO": true, "explanation": "해설7"},
    {"word": "어휘8", "sentence": "예문8", "isO": false, "explanation": "해설8"},
    {"word": "어휘9", "sentence": "예문9", "isO": true, "explanation": "해설9"},
    {"word": "어휘10", "sentence": "예문10", "isO": false, "explanation": "해설10"}
  ]
}
sajaseongeo: 교훈적 사자성어, 실생활 예문 포함. sangshik: 4지선다, answer는 0-3 인덱스.`;

export default async (req, context) => {
  try {
    const today = getKSTDateString();
    const db = getDatabase(getFirebaseApp());
    const dailyRef = ref(db, `korean/daily/${today}`);

    // 이미 오늘 생성됐으면 스킵
    const existing = await get(dailyRef);
    if (existing.exists()) {
      console.log(`✅ Korean daily already exists for ${today}`);
      return new Response(JSON.stringify({ ok: true, cached: true, date: today }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Claude API 호출
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        messages: [{ role: 'user', content: PROMPT }],
      }),
    });

    if (!apiRes.ok) {
      const err = await apiRes.text();
      console.error('Claude API error:', apiRes.status, err);
      return new Response(JSON.stringify({ error: 'Claude API error', detail: err }), { status: 502 });
    }

    const apiData = await apiRes.json();
    const raw = apiData.content?.[0]?.text ?? '';

    // JSON 파싱 (마크다운 코드펜스 제거)
    let content;
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}') + 1;
      if (start === -1 || end === 0) throw new Error('No JSON found');
      content = JSON.parse(cleaned.slice(start, end));
    } catch (e) {
      console.error('JSON parse failed. Raw:', raw.slice(0, 300));
      return new Response(JSON.stringify({ error: 'JSON parse failed', raw: raw.slice(0, 300) }), { status: 500 });
    }

    // 필드 검증
    if (!content.sajaseongeo?.idiom || !content.sangshik?.question || !Array.isArray(content.oxQuiz)) {
      console.error('Invalid content structure:', JSON.stringify(content).slice(0, 200));
      return new Response(JSON.stringify({ error: 'Invalid content structure' }), { status: 500 });
    }

    // Firebase 저장
    await set(dailyRef, {
      ...content,
      date: today,
      generatedAt: new Date().toISOString(),
    });

    console.log(`✅ Korean daily generated and saved for ${today}`);
    return new Response(JSON.stringify({ ok: true, date: today, idiom: content.sajaseongeo.idiom }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  } catch (err) {
    console.error('korean-daily error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

