// Day boundary is 03:00 KST — times before 03:00 still belong to the previous day.
export function getKSTDateString(): string {
  return new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
}

export function getKSTDateOffset(offsetDays: number): string {
  return new Date(Date.now() + 6 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);
}

/**
 * 03:00 KST 기준으로 옮긴 "지금" — 날짜 계산용.
 * 달력처럼 연/월을 따로 써야 하는 화면이 오프셋을 자기 파일에 또 적지 않도록
 * 여기서 한 번만 정의한다. (한 번 +9로 어긋나 달력만 다른 날을 가리킨 적이 있다.)
 */
export function getKSTNow(): Date {
  return new Date(Date.now() + 6 * 3600_000);
}
