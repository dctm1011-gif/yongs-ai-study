import { Handler } from '@netlify/functions';

export interface InvestmentColumn {
  id: string;
  title: string;
  category: 'real-estate' | 'stocks';
  author: string;
  authorTitle: string;
  date: string;
  content: string;
  summary: string;
  region?: string; // For real estate columns
  ticker?: string; // For stock columns
  analysis: string;
  outlook: 'positive' | 'neutral' | 'negative';
  readTime: number; // in minutes
}

export interface InvestmentReport {
  columns: InvestmentColumn[];
  timestamp: string;
  lastUpdated: string;
}

// Expert investment columns - trend analyses
const mockColumns: InvestmentColumn[] = [
  // Real Estate Columns
  {
    id: 'col-re-1',
    title: '강남구 아파트 가격 상승세 지속... 향후 투자 전망',
    category: 'real-estate',
    author: '김부동산',
    authorTitle: '부동산 마케팅 전문가',
    date: '2026-07-18',
    region: '강남구',
    summary:
      '최근 3개월간 강남구 아파트 평균 가격이 전월 대비 3.5% 상승. 서울 강남역 신축 개발과 기업 이전으로 인한 수요 증가가 주요 원인으로 분석됨.',
    content: `
강남구는 서울의 가장 프리미엄 지역 중 하나로 꼽히고 있습니다. 최근 강남역 인근 대형 개발 프로젝트와 IT 기업들의 강남 이전이 이어지면서 아파트 가격이 꾸준히 상승하고 있습니다.

주요 상승 요인:
- 신축 개발 수요 증가 (+2.8%)
- 기업 본사 이전 (+1.2%)
- 외국인 투자 관심 (+0.5%)

평균 가격대: 약 12억 5천만 원
최근 성약률: 약 87%
예상 상승률: 향후 6개월 내 4-5% 추가 상승 가능
    `.trim(),
    analysis:
      '강남구의 지속적인 도시 개발과 기업 이전이 가격 상승을 견인하고 있으며, 금리 인하 가능성도 긍정적 요인',
    outlook: 'positive',
    readTime: 4,
  },
  {
    id: 'col-re-2',
    title: '서초구 프리미엄 빌라... 신흥 투자처로 부상',
    category: 'real-estate',
    author: '이부동산',
    authorTitle: '주거공간 트렌드 분석가',
    date: '2026-07-17',
    region: '서초구',
    summary:
      '서초구가 단순 주거지를 넘어 프리미엄 빌라의 투자처로 부상하고 있습니다. 이태원 재개발과 신분당선 확장으로 인한 접근성 개선이 주요 이유.',
    content: `
서초구의 부동산 시장이 새로운 변화를 맞이하고 있습니다. 기존의 대형 아파트 중심에서 벗어나 고급 빌라에 대한 수요가 급증하고 있는 추세입니다.

주목할 변화:
- 빌라 거래량 증가 (+45% YoY)
- 가격대 안정화 (약 9억 8천만 원)
- 외국인 거주자 증가
- 문화 시설 확충

투자 포인트:
1. 아파트보다 낮은 진입 장벽
2. 개인 정원 등 생활 품질 향상
3. 임대수익률 상대적으로 높음 (약 2.8%)

향후 전망:
- 계속된 문화시설 개발
- 교통 접근성 개선
- 세대 내 자산 격차 이용 투자 기회
    `.trim(),
    analysis:
      '서초구의 다변화된 도시 개발 전략과 접근성 개선은 빌라 시장의 성장 기반을 제공. 중장기 투자 관점에서 매력적',
    outlook: 'positive',
    readTime: 5,
  },
  {
    id: 'col-re-3',
    title: '종로구 한옥 타운하우스... 전통과 현대의 조화',
    category: 'real-estate',
    author: '박건축',
    authorTitle: '건축 및 부동산 기획가',
    date: '2026-07-16',
    region: '종로구',
    summary:
      '종로구의 전통 한옥을 현대식으로 개조한 타운하우스가 새로운 투자 트렌드로 떠오르고 있습니다. 문화유산 보존과 현대적 생활의 결합이 특징.',
    content: `
서울의 심장부 종로구에서 주목할 만한 변화가 일어나고 있습니다. 전통 한옥을 현대식으로 개조한 프리미엄 타운하우스들이 새로운 투자 기회로 떠오르고 있는 것입니다.

특징:
- 전통 한옥 건축의 아름다움 보존
- 현대식 인테리어 및 설비
- 문화유산 프리미엄 (약 2.1% 추가)
- 독특한 생활 공간의 가치

시장 현황:
- 평균 가격: 약 8억 5천만 원
- 수요층: 30-50대 고급 주거 선호층
- 임대 수익성: 중상 (약 2.1%)
- 재개발 위험도: 낮음

투자 고려사항:
1. 역사 보존 가치
2. 관광지 인근 임대 수익성
3. 문화권 발전 가능성
4. 개인 개조 제약 사항

결론:
종로구의 문화 재개발과 한옥 보존 정책이 이 지역의 투자 매력을 높이고 있습니다.
세대를 초월한 자산 가치를 원하는 투자자에게 좋은 선택이 될 수 있습니다.
    `.trim(),
    analysis:
      '문화유산 보존 정책과 관광지 개발이 장기적 자산가치를 담보. 특수한 투자 철학을 가진 고급 투자자 대상',
    outlook: 'neutral',
    readTime: 6,
  },

  // Stock Columns
  {
    id: 'col-st-1',
    title: '삼성전자, AI 칩 시장 진출 본격화... 실적 전망 밝아',
    category: 'stocks',
    author: '손기술',
    authorTitle: '테크 주식 분석가',
    date: '2026-07-18',
    ticker: '005930',
    summary:
      '삼성전자가 AI 칩 시장에 본격 진출하며 차분기 매출 성장세가 예상됩니다. GPU/NPU 칩 수주 증가가 긍정적 신호로 평가되고 있습니다.',
    content: `
반도체 시장의 새로운 흐름이 일어나고 있습니다. 인공지능 기술의 급속한 확산에 따라 AI 칩에 대한 수요가 급증하면서,
삼성전자의 경쟁력 있는 포지셔닝이 주목을 받고 있습니다.

최근 호재:
- Nvidia 경쟁사 칩 개발 진행률 70% 달성
- 주요 클라우드 기업 4곳의 샘플 테스트 중
- 분기별 매출 전망 +15% 상향
- 미국 정부 반도체 지원금 수혜 가능성

기술 지표:
- 5nm 공정 수율 개선: 88% (전 분기: 82%)
- 신규 설비 투자 완료: 약 5조 원
- 인력 확충: AI 엔지니어 200명 신규 채용

주가 전망:
- 목표 주가: 70,000원 (현재 68,000원)
- 상승 여력: 약 2.9%
- 투자 타이밍: 기술주 회복세 단계

리스크 요인:
- 미중 무역 분쟁 재심화
- 글로벌 경제 둔화 가능성
- 경쟁사 기술 추격

종합 평가:
AI 칩 시장의 성장성과 삼성전자의 기술력을 감안하면 중기적으로 긍정적 전망을 유지합니다.
    `.trim(),
    analysis:
      'AI 칩 시장의 폭발적 성장세와 삼성전자의 기술 우위가 장기적 성장 동력 제공. 기술주 회복 트렌드 수혜',
    outlook: 'positive',
    readTime: 5,
  },
  {
    id: 'col-st-2',
    title: 'SK하이닉스, 메모리 칩 공급 부족 심화... 가격 강세 예상',
    category: 'stocks',
    author: '이반도체',
    authorTitle: '메모리 칩 시장 전문가',
    date: '2026-07-17',
    ticker: '000660',
    summary:
      '글로벌 메모리 칩 공급이 부족해지면서 SK하이닉스의 실적 개선 시나리오가 현실화하고 있습니다. 차분기부터 본격적인 가격 상승이 예상됩니다.',
    content: `
메모리 칩 시장에 공급 부족 현상이 나타나고 있습니다. DRAM과 NAND 플래시의 가격이 상승세를 보이면서,
메모리 칩 주요 생산사인 SK하이닉스의 실적 개선이 임박한 상황입니다.

시장 현황:
- DRAM 가격지수: 전월 대비 +8.2%
- NAND 플래시 가격: +12.5% (3개월만에)
- 공급률 부족도: 약 15% (정상: 25-30%)
- 업체별 재고: 2주분 이하

SK하이닉스 실적 전망:
- 3분기 매출: 예상 9.2조 원 (+18%)
- 영업이익: 예상 2.1조 원 (전년 대비 3배)
- 마진율 개선: 22.8% → 26.5%

가격 재평가:
- 현재 주가: 180,000원
- 목표 주가: 205,000원 (상승 여력 13.9%)
- P/E 비율: 10배 (업계 평균: 14배)

긍정 요인:
1. 공급 부족 현상 심화
2. 가격 상승 추세 가속
3. 산업 이익률 개선
4. 고급 공정 기술 우위

위험 요인:
- 신규 공급 업체 출현 (중국)
- 기술 발전 가속화
- 경기 둔화 시 수요 감소

투자 제언:
메모리 칩 시장의 구조적 공급 부족이 분명한 만큼, SK하이닉스의 실적 개선은 상당히 확실해 보입니다.
차분기부터 본격적인 가격 재평가가 일어날 것으로 예상됩니다.
    `.trim(),
    analysis:
      '메모리 칩 공급 부족의 구조적 현상이 SK하이닉스의 수익성 개선으로 이어질 가능성 높음. 실적주로서의 가치 부각',
    outlook: 'positive',
    readTime: 6,
  },
  {
    id: 'col-st-3',
    title: 'LG화학, 배터리 수주 감소... 실적 부진 우려',
    category: 'stocks',
    author: '정에너지',
    authorTitle: '배터리 업계 분석가',
    date: '2026-07-16',
    ticker: '051910',
    summary:
      'EV 시장 성장 둔화에 따라 LG화학의 배터리 수주가 감소세를 보이고 있습니다. 향후 2-3분기 실적 부진이 우려되는 상황입니다.',
    content: `
전기자동차 시장의 성장률 둔화가 배터리 업계에 직격탄을 주고 있습니다. LG화학을 포함한 주요 배터리 제조사들이
수주 감소와 실적 악화의 어려움을 겪고 있는 상황입니다.

산업 현황:
- EV 판매 성장률: 12.3% (작년: 42%)
- 배터리 수주량: -15.8% (YoY)
- 평균 판가: -8.2% (공급 과잉)
- 원재료비: 안정화 (긍정 요인)

LG화학 실적 부진 신호:
- 2분기 배터리 매출: 2.1조 원 (-12%)
- 영업이익 마진: 12.3% → 8.7%
- 신규 계약 수주: -22.4%
- 가동률: 73% (정상: 85-90%)

주가 전망:
- 현재 주가: 350,000원
- 목표 주가: 320,000원 (하향)
- 투자 등급: 매수 → 보유로 변경
- 하락 위험도: 중상

부정 요인:
1. EV 시장 성장 둔화
2. 중국 배터리 기업의 저가 경쟁
3. 수주 파이프라인 약화
4. 마진율 계속 압박 예상

긍정 요인:
1. 차세대 고에너지 밀도 기술 개발 중
2. 인도/동남아 신규 시장 개척
3. 원재료 가격 안정화
4. 정부 지원 정책 지속

투자 전략:
현재로서는 실적 회복까지 대기하는 것이 현명합니다. 4분기 이후 체질 개선 신호가 보일 때
점진적으로 진입하는 전략을 제안합니다.
    `.trim(),
    analysis:
      'EV 시장 성장률 둔화는 구조적 문제로 보여 단기 회복 가능성 낮음. 실적 개선까지 신중한 접근 필요',
    outlook: 'negative',
    readTime: 7,
  },
];

// In-memory store for bookmarks/favorites (in production, use a database)
const bookmarksStore: Map<string, Set<string>> = new Map();

const handler: Handler = async (event) => {
  try {
    // Parse the path to determine the endpoint
    const rawPath = event.rawPath || event.path || '';
    const pathSuffix = rawPath.replace(/^\/api\/investment\/?/, '') || '';

    console.log(`[Investment API] RawPath: ${rawPath}, Path: ${event.path}, Method: ${event.httpMethod}, PathSuffix: ${pathSuffix}`);

    // Handle GET /api/investment/daily-report (now returns columns instead of properties)
    if (
      event.httpMethod === 'GET' &&
      (pathSuffix.includes('daily-report') || rawPath.includes('daily-report'))
    ) {
      const report: InvestmentReport = {
        columns: mockColumns,
        timestamp: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      };

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      };
    }

    // Handle GET /api/investment/columns (new endpoint for columns)
    if (
      event.httpMethod === 'GET' &&
      (pathSuffix.includes('columns') || rawPath.includes('columns'))
    ) {
      const category = event.queryStringParameters?.category;
      let filtered = mockColumns;

      if (category && ['real-estate', 'stocks'].includes(category)) {
        filtered = filtered.filter(c => c.category === category);
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columns: filtered,
          count: filtered.length,
          timestamp: new Date().toISOString(),
        }),
      };
    }

    // Handle POST /api/investment/bookmarks (bookmark/save columns)
    if (
      event.httpMethod === 'POST' &&
      (pathSuffix.includes('bookmarks') || rawPath.includes('bookmarks'))
    ) {
      try {
        const payload = JSON.parse(event.body || '{}');
        const { columnId, isBookmarked, userId } = payload;

        if (!columnId) {
          return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'columnId is required' }),
          };
        }

        // Get or create bookmarks set for user
        const userKey = userId || 'default-user';
        if (!bookmarksStore.has(userKey)) {
          bookmarksStore.set(userKey, new Set());
        }

        const userBookmarks = bookmarksStore.get(userKey)!;

        if (isBookmarked) {
          userBookmarks.add(columnId);
        } else {
          userBookmarks.delete(columnId);
        }

        console.log(
          `[Investment API] Bookmark updated for ${userKey}: ${columnId} -> ${isBookmarked}`
        );

        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: true,
            columnId,
            isBookmarked,
            totalBookmarks: userBookmarks.size,
          }),
        };
      } catch (err) {
        console.error('[Investment API] Error processing bookmarks:', err);
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid request body' }),
        };
      }
    }

    // 404 - Endpoint not found
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Investment API endpoint not found',
        path: event.path,
      }),
    };
  } catch (error) {
    console.error('[Investment API] Unhandled error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};

export { handler };
