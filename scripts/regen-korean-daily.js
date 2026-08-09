const { initializeApp } = require('firebase/app');
const { getDatabase, ref, set, remove } = require('firebase/database');
require('dotenv').config({ path: '.env' });

const app = initializeApp({
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
});
const db = getDatabase(app);
const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

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

async function main() {
  await remove(ref(db, 'korean/daily/' + today));
  const res = await fetch('https://api.anthropic.com/v1/messages', {
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
  const data = await res.json();
  const raw = data.content?.[0]?.text ?? '';
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const s = cleaned.indexOf('{');
  const e = cleaned.lastIndexOf('}') + 1;
  const content = JSON.parse(cleaned.slice(s, e));

  const words = content.puzzle?.map(p => p.word) ?? [];
  console.log('단어:', words.join(', '));
  let pairs = 0;
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const common = [...words[i]].filter(c => [...words[j]].includes(c));
      if (common.length) {
        pairs++;
        console.log(`  ${words[i]} ↔ ${words[j]} (${common.join(',')})`);
      }
    }
  }
  console.log(`\n교차 가능 쌍: ${pairs}개`);

  await set(ref(db, 'korean/daily/' + today), {
    ...content,
    date: today,
    generatedAt: new Date().toISOString(),
  });
  console.log('저장 완료:', today);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
