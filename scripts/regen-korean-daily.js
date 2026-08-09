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

[puzzle 단어 10개 설계 — 반드시 이 순서대로 설계 후 JSON 출력]

핵심 규칙: 모든 단어가 공통 음절을 통해 하나로 이어져야 함. 단어들을 그래프로 그렸을 때 모두 연결되어야 함 (고립된 단어 0개).

설계 방법:
1. 허브 음절 A를 정한다 (예: 증)
2. A를 포함하는 단어를 5개 고른다 (예: 변증, 반증, 논증, 입증, 증거) -> 이 5개는 증으로 모두 연결됨
3. 위 5개 단어 중 하나의 다른 음절을 허브 B로 삼는다 (예: 변증의 변)
4. B를 포함하는 단어 3개를 고른다 (예: 변론, 변별, 변이) -> 변으로 변증과 연결됨
5. 위 전체 단어 중 하나의 또 다른 음절을 허브 C로 삼는다 (예: 변론의 론)
6. C를 포함하는 단어 2개를 고른다 (예: 이론, 각론) -> 론으로 변론과 연결됨
7. 최종 확인: 10개 단어 전부가 공통 음절로 이어지는지 검증. 고립된 단어가 있으면 다시 설계.

예시 (이 단어는 쓰지 말 것):
  증: 변증,반증,논증,입증,증거
  변(변증의 변): 변론,변별
  론(변론의 론): 이론,각론
  -> 10개 모두 연결: 이론-각론-변론-변별-변증-반증-논증-입증-증거(증) 사슬 형성

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
