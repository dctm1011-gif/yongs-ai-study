/**
 * 영어 단어 복습 풀 공통 설정 + 오답 풀 헬퍼.
 *
 * 오답 풀이 필요한 이유: 퀴즈에서 틀리면 reviewPool의 count가 0으로 리셋되지만, 게임 4종이
 * 매일 count를 올려주기 때문에 며칠이면 다시 count 3~4가 되어 우선순위에서 밀려난다.
 * (실측: 9/5에 틀린 dialectical이 count 4로 복구된 뒤 12일간 한 번도 출제되지 않음)
 * 그래서 "틀린 적 있음"을 count와 별개로 유지하고, 실제로 다시 맞힐 때만 해제한다.
 */
import { get, update, remove, increment } from 'firebase/database';
import { userRef } from './userDb';

/** 이 횟수만큼 복습하면 게임 출제 대상에서 제외(졸업). */
export const GRADUATE_AT = 5;

const WRONG_POOL_PATH = 'wrongPool/english';

/** 틀린 단어를 오답 풀에 기록. 다시 맞힐 때까지 게임에서 최우선 출제된다. */
export async function recordWrongWords(
  uid: string | undefined,
  entries: { wordId: string; word?: string }[],
): Promise<void> {
  if (!uid || entries.length === 0) return;
  await Promise.all(
    entries.map(e =>
      update(userRef(uid, `${WRONG_POOL_PATH}/${e.wordId}`), {
        word: e.word ?? e.wordId,
        misses: increment(1),
        lastWrongAt: Date.now(),
      }).catch(() => {}),
    ),
  );
}

/** 자력으로 맞힌 단어를 오답 풀에서 해제. */
export async function clearWrongWords(
  uid: string | undefined,
  wordIds: string[],
): Promise<void> {
  if (!uid || wordIds.length === 0) return;
  await Promise.all(
    wordIds.map(wordId => remove(userRef(uid, `${WRONG_POOL_PATH}/${wordId}`)).catch(() => {})),
  );
}

/** 현재 오답 풀에 있는 wordId 집합. 게임 로드 시 1회 조회해서 정렬에 쓴다. */
export async function getWrongWordIds(uid: string | undefined): Promise<Set<string>> {
  if (!uid) return new Set();
  try {
    const snap = await get(userRef(uid, WRONG_POOL_PATH));
    return snap.exists() ? new Set(Object.keys(snap.val())) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * 각 게임이 정한 정렬을 유지한 채, 오답 이력이 있는 단어만 앞으로 당긴다.
 * (게임별 정렬 로직은 그대로 두고 우선순위만 덧입히는 방식)
 */
export function wrongFirst<T>(
  words: T[],
  wrongIds: Set<string>,
  getId: (w: T) => string = (w: any) => w.wordId,
): T[] {
  if (wrongIds.size === 0) return words;
  const wrong: T[] = [];
  const rest: T[] = [];
  for (const w of words) (wrongIds.has(getId(w)) ? wrong : rest).push(w);
  return [...wrong, ...rest];
}
