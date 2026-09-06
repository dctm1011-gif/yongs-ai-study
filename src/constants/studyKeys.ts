/** Today 탭 체크리스트와 동일한 항목 순서 */
export const CHECKLIST_KEYS = [
  'english', 'english_word_match', 'english_crossword', 'english_scramble',
  'english_sentence', 'english_review', 'english_news_reading', 'english_news_listening',
  'investment',
  'reading', 'korean_diary',
] as const;

export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

/**
 * Firebase completion 값 → 완료 여부
 * - boolean true  : 대부분의 게임/활동
 * - number > 0    : 일부 퀴즈 점수
 * - { done: true }: speaking 등 메타데이터 포함 객체
 */
export function isDone(val: unknown): boolean {
  return (
    val === true ||
    (typeof val === 'number' && val > 0) ||
    (typeof val === 'object' && val !== null && (val as Record<string, unknown>).done === true)
  );
}
