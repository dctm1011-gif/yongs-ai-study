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

const PROMPT = `한국어 크로스워드 낱말퍼즐과 학습 콘텐츠를 생성해줘. 마크다운 코드블록 없이 순수 JSON만 출력해.

puzzle 단어 10개 설계 방법 (이 순서대로 생각한 뒤 JSON 출력):
1단계: 허브 음절 A 선택 -> A를 포함하는 고급 어휘 4개 선택
2단계: 허브 음절 B 선택 (반드시 1단계 단어 중 하나에 포함된 음절) -> B 포함 어휘 3개
3단계: 허브 음절 C 선택 (1단계 또는 2단계 단어 중 하나에 포함된 음절) -> C 포함 어휘 2~3개
4단계: 총합 10개, 교차 가능 쌍 최소 8쌍 확인

예시 구조 (이 단어는 쓰지 말 것, 구조 참고용):
  A=증: 변증, 반증, 논증, 입증
  B=변 (변증의 '변'): 변론, 변별
  C=역 (연역의 '역'): 역설, 연역
  추가: 귀납, 귀추
  교차 쌍: 변증-변론, 변증-반증, 변증-논증, 역설-연역, 귀납-귀추 등 총 8쌍 이상

난이도: 한국어 원어민 성인 최상위 어휘력 향상. 고급 한자어, 철학/법/인문 전문어, 고어.
금지: 나비, 달, 밤, 별, 거울, 산책, 관조, 침잠 등 기초/중급 어휘 일절 금지.
clue: 사전적 정의 + 한자 표기, 한 줄로 간결하게.

출력 형식:
{
  "sajaseongeo": {"idiom": "사자성어 한글", "hanja": "漢字", "meaning": "뜻 2-3문장", "example": "예문"},
  "sangshik": {"question": "질문", "options": ["보기1","보기2","보기3","보기4"], "answer": 0, "explanation": "해설 2-3문장", "category": "분야"},
  "puzzle": [
    {"word": "단어1", "clue": "힌트"},
    {"word": "단어2", "clue": "힌트"},
    {"word": "단어3", "clue": "힌트"},
    {"word": "단어4", "clue": "힌트"},
    {"word": "단어5", "clue": "힌트"},
    {"word": "단어6", "clue": "힌트"},
    {"word": "단어7", "clue": "힌트"},
    {"word": "단어8", "clue": "힌트"},
    {"word": "단어9", "clue": "힌트"},
    {"word": "단어10", "clue": "힌트"}
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
