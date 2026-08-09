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

const PROMPT = `오늘의 한국어 학습 콘텐츠를 생성해줘. 아래 JSON 형식으로만 응답해. 마크다운 코드블록 없이 순수 JSON만.

{
  "sajaseongeo": {
    "idiom": "사자성어 한글",
    "hanja": "漢字",
    "meaning": "뜻 설명 (2-3문장)",
    "example": "실생활 예문 1문장"
  },
  "sangshik": {
    "question": "교양 상식 질문",
    "options": ["보기1", "보기2", "보기3", "보기4"],
    "answer": 0,
    "explanation": "정답 해설 (2-3문장)",
    "category": "카테고리(역사/과학/지리/문화/예술/스포츠/기술/수학/언어 중 하나)"
  },
  "puzzle": [
    {"word": "한국어단어1", "clue": "힌트설명"},
    {"word": "한국어단어2", "clue": "힌트설명"},
    {"word": "한국어단어3", "clue": "힌트설명"},
    {"word": "한국어단어4", "clue": "힌트설명"},
    {"word": "한국어단어5", "clue": "힌트설명"},
    {"word": "한국어단어6", "clue": "힌트설명"},
    {"word": "한국어단어7", "clue": "힌트설명"},
    {"word": "한국어단어8", "clue": "힌트설명"},
    {"word": "한국어단어9", "clue": "힌트설명"},
    {"word": "한국어단어10", "clue": "힌트설명"}
  ]
}

조건:
- sajaseongeo: 잘 알려진 사자성어 중 교훈적인 것, 실생활 예문 포함
- sangshik: 역사·과학·지리·문화 등 교양 수준의 4지선다 문제, answer는 0-3 인덱스
- puzzle: 2~5글자 한국어 단어 정확히 10개. 대상은 한국어 원어민 성인. 목표: 최상위권 어휘력 확장.

  ★ 크로스워드 교차 필수 조건 (반드시 지킬 것):
  단어들이 실제로 교차할 수 있으려면 공통 음절(글자)이 있어야 함.
  아래 구조를 따를 것:
  - 그룹 A: 같은 음절을 포함하는 단어 4~5개 (예: '증'자 → 변증, 반증, 논증, 입증, 증거)
  - 그룹 B: 다른 공통 음절을 가진 단어 3~4개 (예: '론'자 → 변론, 이론, 각론)
  - 그룹 A와 B 사이에도 공통 음절이 최소 1개 있을 것 (예: 변증↔변론이 '변' 공유)

  난이도: 고급 한자어, 철학/법/인문 전문어 (귀납, 연역, 변증, 전거, 준거, 역설, 반증, 귀추, 논증, 입증, 변론, 천착, 혜안, 경구, 준엄 수준)
  ※ 금지: 나비, 달, 밤, 별 등 기초 어휘
  clue: 사전적 정의 + 한자 표기(있으면)
  출력 전에 반드시 각 단어 쌍에서 공통 음절이 있는지 검토할 것.`;

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
        max_tokens: 1800,
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
    if (!content.sajaseongeo?.idiom || !content.sangshik?.question || !Array.isArray(content.puzzle)) {
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

export const config2 = { path: '/api/korean-daily' };
