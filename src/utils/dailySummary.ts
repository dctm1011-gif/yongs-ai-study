import { getDatabase, ref, get, set } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CHECKLIST_KEYS, isDone } from '../constants/studyKeys';

function getKSTDateString(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

// completion 기록 대상 전체 키 (진행도 계산 대상인 CHECKLIST_KEYS보다 범위가 넓음)
const ALL_COMPLETION_KEYS = [
  // 영어
  'english', 'english_crossword', 'english_review',
  'english_scramble', 'english_sentence', 'english_word_match',
  'english_news_reading', 'english_news_listening',
  // 한국어
  'reading', 'korean_diary', 'sajaseongeo', 'sangshik', 'korean_ox',
  // 투자
  'investment',
  // TOEFL
  'toefl_reading', 'toefl_listening', 'toefl_writing', 'toefl_speaking',
  // AI 스피킹
  'english_speaking',
];

// 과거 completion 원본 → 날짜별 progress 백필 (앱 시작 시 1회)
export async function backfillProgressHistory(uid: string): Promise<void> {
  const DONE_KEY = 'progress_backfill_done_v3';
  const done = await AsyncStorage.getItem(DONE_KEY);
  if (done) return;

  const db = getDatabase(getFirebaseApp());

  // key 별로 전체 날짜 데이터를 한 번에 읽기 (13 reads)
  const results = await Promise.allSettled(
    CHECKLIST_KEYS.map(key =>
      get(ref(db, `users/${uid}/completion/${key}`))
        .then(snap => ({ key, dates: (snap.val() ?? {}) as Record<string, any> }))
    )
  );

  // 날짜 → { key: value } 형태로 집계
  const byDate: Record<string, Record<string, any>> = {};
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const { key, dates } = r.value;
    for (const [date, val] of Object.entries(dates)) {
      if (!byDate[date]) byDate[date] = {};
      byDate[date][key] = val;
    }
  }

  // 날짜별 progress 계산 후 저장
  await Promise.allSettled(
    Object.entries(byDate).map(([date, completion]) => {
      const completedCount = CHECKLIST_KEYS.filter(k => isDone(completion[k])).length;
      const progress = {
        completed: completedCount,
        total: CHECKLIST_KEYS.length,
        pct: Math.round((completedCount / CHECKLIST_KEYS.length) * 100),
      };
      return Promise.allSettled([
        set(ref(db, `studySummary/${date}/progress`), progress),
        set(ref(db, `users/${uid}/progressHistory/${date}`), progress),
      ]);
    })
  );

  await AsyncStorage.setItem(DONE_KEY, '1');
}

export async function writeDailySummary(uid: string): Promise<void> {
  const db = getDatabase(getFirebaseApp());
  const today = getKSTDateString();

  const [completionSnaps, englishSnap] = await Promise.all([
    Promise.all(
      ALL_COMPLETION_KEYS.map(key =>
        get(ref(db, `users/${uid}/completion/${key}/${today}`)).catch(() => null)
      )
    ),
    get(ref(db, `english/dailySummary/${today}`)).catch(() => null),
  ]);

  const completion: Record<string, any> = {};
  ALL_COMPLETION_KEYS.forEach((key, i) => {
    const val = completionSnaps[i]?.val();
    if (val !== null && val !== undefined) {
      completion[key] = val;
    }
  });

  const completedCount = CHECKLIST_KEYS.filter(key => isDone(completion[key])).length;
  const total = CHECKLIST_KEYS.length;
  const progress = {
    completed: completedCount,
    total,
    pct: Math.round((completedCount / total) * 100),
  };

  const summary = {
    completion,
    progress,
    english: englishSnap?.val() ?? null,
    updatedAt: Date.now(),
  };
  // dailySummary는 Firebase 규칙상 인증 필요 → 위젯/달력용 공개 경로에도 병행 기록
  await Promise.all([
    set(ref(db, `dailySummary/${today}`), summary),
    set(ref(db, `studySummary/${today}`), summary),
    set(ref(db, `users/${uid}/progressHistory/${today}`), progress),
  ]);
}
