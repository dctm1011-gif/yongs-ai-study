import { getDatabase, ref, get, set } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';

function getKSTDateString(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

const COMPLETION_KEYS = [
  // 영어
  'english', 'english_crossword', 'english_review',
  'english_scramble', 'english_sentence', 'english_word_match',
  'english_news_reading', 'english_news_listening',
  // 한국어
  'reading', 'sajaseongeo', 'sangshik', 'korean_ox',
  // 투자
  'investment',
  // TOEFL
  'toefl_reading', 'toefl_listening', 'toefl_writing', 'toefl_speaking',
  // AI 스피킹
  'english_speaking',
];

export async function writeDailySummary(uid: string): Promise<void> {
  const db = getDatabase(getFirebaseApp());
  const today = getKSTDateString();

  const [completionSnaps, englishSnap] = await Promise.all([
    Promise.all(
      COMPLETION_KEYS.map(key =>
        get(ref(db, `users/${uid}/completion/${key}/${today}`)).catch(() => null)
      )
    ),
    get(ref(db, `english/dailySummary/${today}`)).catch(() => null),
  ]);

  const completion: Record<string, any> = {};
  COMPLETION_KEYS.forEach((key, i) => {
    const val = completionSnaps[i]?.val();
    if (val !== null && val !== undefined) {
      completion[key] = val;
    }
  });

  await set(ref(db, `dailySummary/${today}`), {
    completion,
    english: englishSnap?.val() ?? null,
    updatedAt: Date.now(),
  });
}
