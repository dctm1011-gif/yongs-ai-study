/**
 * 앱 공통 디자인 토큰.
 *
 * 화면마다 각자 색을 하드코딩해서 회색만 13종, accent가 9종이던 상태를 정리하려고 만들었다.
 * 값은 새로 고른 게 아니라 앱에서 이미 가장 많이 쓰이던 색을 그대로 승격시킨 것이라,
 * 토큰으로 바꿔도 화면이 달라 보이지 않는다. (#8e8e8e 206회, #0095f6 145회, #262626 135회 …)
 *
 * 새 화면을 만들거나 기존 화면을 손볼 때는 하드코딩 대신 여기서 가져다 쓸 것.
 */
export const colors = {
  accent: '#0095f6',
  accentSoft: '#e7f3ff',

  ink: '#262626',
  inkMuted: '#8e8e8e',
  border: '#dbdbdb',

  surface: '#ffffff',
  surfaceAlt: '#fafafa',
  /** 카드가 떠 보이도록 화면 바닥에 살짝 색을 깐다 (Today 탭 "소프트 카드" 방향) */
  canvas: '#f6f7fb',

  success: '#16a34a',
  successSoft: '#f0fdf4',
  successBorder: '#bbf7d0',

  warn: '#f59e0b',
  danger: '#ef4444',
} as const;

/** 체크리스트 분류별 색 — 탭했을 때 이동하는 화면의 주 색과 맞춰 둔다. */
export const categoryColors = {
  english: '#0095f6',   // Voca / BBC
  investment: '#f59e0b',
  korean: '#059669',    // Culture
} as const;

export const space = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28,
} as const;

export const radius = {
  sm: 8, md: 12, lg: 16, pill: 999,
} as const;

/** 화면당 폰트 크기가 9~13종씩 흩어져 있어서 스케일을 고정한다. */
export const fontSize = {
  display: 24, title: 18, body: 15, label: 13, caption: 11,
} as const;

export const duration = {
  fast: 140, base: 240, slow: 420,
} as const;

/** 카드 그림자 — Android는 elevation, iOS는 shadow* 를 함께 준다. */
export const shadow = {
  card: {
    shadowColor: '#1a2340',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  lifted: {
    shadowColor: '#0f4c8a',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
} as const;
