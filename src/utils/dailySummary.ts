import { getDatabase, ref, get, set } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

// 과거 dailySummary → english/summary 백필 (앱 시작 시 1회만 실행)
export async function backfillPublicSummaries(): Promise<void> {
  const DONE_KEY = 'summary_backfill_done_v1';
  const done = await AsyncStorage.getItem(DONE_KEY);
  if (done) return;

  const db = getDatabase(getFirebaseApp());
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const promises: Promise<any>[] = [];

  for (let i = 0; i < 30; i++) {
    const d = new Date(kst.getTime() - i * 86400000);
    const date = d.toISOString().split('T')[0];
    promises.push(
      get(ref(db, `dailySummary/${date}`)).then(snap => {
        if (!snap.exists()) return;
        return set(ref(db, `english/summary/${date}`), snap.val()).catch(() => {});
      }).catch(() => {})
    );
  }

  await Promise.allSettled(promises);
  await AsyncStorage.setItem(DONE_KEY, '1');
}

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

  const summary = {
    completion,
    english: englishSnap?.val() ?? null,
    updatedAt: Date.now(),
  };
  // dailySummary는 Firebase 규칙상 인증 필요 → 리포트용 공개 경로에도 병행 기록
  await Promise.all([
    set(ref(db, `dailySummary/${today}`), summary),
    set(ref(db, `english/summary/${today}`), summary),
  ]);
}
