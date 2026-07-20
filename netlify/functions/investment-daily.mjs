import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createLogger } from './_utils.mjs';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

export const config = {
  schedule: '0 21 * * *',
};

const log = createLogger('investment-daily');

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

let app = null;
function getFirebaseApp() {
  if (!app) {
    const existing = getApps();
    app = existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
  }
  return app;
}

// Netlify Functions run in UTC; KST (UTC+9) doesn't roll to the next
// calendar day until 09:00 UTC, so the plain UTC date lags KST by a day
// for 9 hours each morning. Shift the clock forward before formatting.
function getKSTDateString() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

// 하드코딩 fallback 칼럼 (investment/daily.json이 없거나 파싱 실패할 때만 사용)
function getFallbackColumns() {
  const today = getKSTDateString();
  return [
    {
      id: 'col-daily-1',
      title: '부동산 시장, 금리 인하 기대감에 상승세',
      category: 'real-estate',
      author: '김부동산',
      authorTitle: '부동산 시장 분석가',
      date: today,
      region: '서울 전역',
      summary: '최근 금리 인하 가능성이 높아지면서 부동산 시장이 전반적인 상승세를 보이고 있습니다.',
      content: `부동산 시장이 금리 인하 기대감에 힘입어 긍정적 신호를 보이고 있습니다.

주요 포인트:
- 강남, 서초 지역 가격 상승세 지속
- 신축 아파트 분양권 수요 증가
- 전세 시장도 안정화 추세
- 외국인 투자 관심 증대

시장 전망:
앞으로 2-3개월이 부동산 투자의 중요한 타이밍이 될 것으로 예상됩니다.`,
      analysis: '금리 인하 기대감과 도시 개발 호재가 맞물리면서 중기적 상승세가 예상됩니다.',
      outlook: 'positive',
      readTime: 5,
      source: '국토교통부 실거래가 공개시스템',
      chartData: [
        {
          title: '서울 아파트 가격 지수 추이',
          unit: '단위: 지수',
          data: [
            { label: '3월', value: 82 },
            { label: '4월', value: 85 },
            { label: '5월', value: 87 },
            { label: '6월', value: 91 },
            { label: '7월', value: 96 },
          ],
        },
      ],
    },
    {
      id: 'col-daily-2',
      title: '반도체 주가, AI 수요 증가로 강세 지속',
      category: 'stocks',
      author: '손기술',
      authorTitle: '테크 주식 전문가',
      date: today,
      ticker: '005930',
      summary: 'AI 칩 수요 폭증으로 반도체 업계가 호황을 맞이하고 있습니다.',
      content: `AI 시장의 급성장이 반도체 업계에 미치는 영향은 지대합니다.

긍정 신호:
- GPU/NPU 칩 수주량 사상 최대
- 데이터센터 투자 급증
- 글로벌 기술 기업들의 선투자
- 향후 3년 동안 성장성 높음

투자 관점:
AI 칩 시장은 10년 이상의 성장 사이클이 예상되고 있습니다.`,
      analysis: 'AI 혁명의 초반부이며, 반도체 수요는 계속 증가할 것으로 전망됩니다.',
      outlook: 'positive',
      readTime: 6,
      source: '한국거래소(KRX) 시황정보시스템',
      chartData: [
        {
          title: '반도체 주가 추이',
          unit: '단위: 원',
          data: [
            { label: '3월', value: 68000 },
            { label: '4월', value: 71500 },
            { label: '5월', value: 75200 },
            { label: '6월', value: 79800 },
            { label: '7월', value: 84300 },
          ],
        },
      ],
    },
  ];
}

export default async (req, context) => {
  try {
    const today = getKSTDateString();

    // investment/generate_investment.py가 생성한 파일을 우선 사용,
    // 없거나 파싱 실패하면 하드코딩된 fallback 칼럼 사용
    let investmentColumns;
    try {
      const dailyPath = resolve(process.cwd(), 'investment', 'daily.json');
      const parsed = JSON.parse(readFileSync(dailyPath, 'utf-8'));
      investmentColumns = parsed.columns;
      log.log('✅ investment/daily.json 사용');
    } catch (e) {
      log.log('investment/daily.json 없음/파싱 실패, fallback 사용:', e.message);
      investmentColumns = getFallbackColumns();
    }

    const firebaseApp = getFirebaseApp();
    const db = getDatabase(firebaseApp);

    // Firebase에 칼럼 데이터 저장
    const columnData = {
      columns: investmentColumns,
      timestamp: new Date().toISOString(),
      date: today,
      count: investmentColumns.length,
    };

    await set(ref(db, `investment/columns/${today}`), columnData);

    log.log('✅ Investment columns saved to Firebase', {
      count: investmentColumns.length,
      date: today,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Investment columns generated and saved',
        count: investmentColumns.length,
        date: today,
      }),
      { status: 200 }
    );
  } catch (error) {
    log.error('Failed to generate investment columns:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
};
