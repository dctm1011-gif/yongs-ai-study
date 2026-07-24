import { getDatabase, ref, push } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';

export type CompletionType =
  | 'english_word'
  | 'toefl_reading'
  | 'toefl_listening'
  | 'toefl_writing'
  | 'toefl_speaking'
  | 'investment_column';

const TYPE_LABELS: Record<CompletionType, string> = {
  english_word: '영어단어',
  toefl_reading: '토플 리딩',
  toefl_listening: '토플 리스닝',
  toefl_writing: '토플 라이팅',
  toefl_speaking: '토플 스피킹',
  investment_column: '투자 칼럼',
};

export function writeCompletion(type: CompletionType, title?: string) {
  try {
    const db = getDatabase(getFirebaseApp());
    push(ref(db, 'completions'), {
      type,
      title: title ?? TYPE_LABELS[type],
      completedAt: Date.now(),
      processed: false,
    });
  } catch (e) {
    // 완료 기록 실패는 무시 (UX에 영향 없어야 함)
  }
}
