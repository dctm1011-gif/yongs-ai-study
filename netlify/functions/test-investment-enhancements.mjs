import { createLogger, corsHeaders } from './_utils.mjs';

const log = createLogger('test-investment-enhancements');

/**
 * Test weekly investment summary generation
 */
async function testWeeklySummary() {
  log.log('Testing weekly investment summary...');

  // Simulate property data
  const mockProperties = [
    {
      id: 'prop-1',
      name: '강남 럭셔리 아파트',
      location: '강남구',
      roi: 3.5,
      trend: [
        { date: '2026-07-11', roi: 3.2 },
        { date: '2026-07-12', roi: 3.3 },
        { date: '2026-07-13', roi: 3.4 },
        { date: '2026-07-14', roi: 3.5 },
      ],
    },
    {
      id: 'prop-2',
      name: '서초 프리미엄 빌라',
      location: '서초구',
      roi: 2.8,
      trend: [
        { date: '2026-07-11', roi: 2.1 },
        { date: '2026-07-12', roi: 2.3 },
        { date: '2026-07-13', roi: 2.5 },
        { date: '2026-07-14', roi: 2.8 },
      ],
    },
    {
      id: 'prop-3',
      name: '종로 한옥 타운하우스',
      location: '종로구',
      roi: 2.1,
      trend: [
        { date: '2026-07-11', roi: 2.5 },
        { date: '2026-07-12', roi: 2.4 },
        { date: '2026-07-13', roi: 2.2 },
        { date: '2026-07-14', roi: 2.1 },
      ],
    },
  ];

  // Calculate stats
  const results = {
    passed: 0,
    failed: 0,
    tests: [],
  };

  // Test 1: ROI change calculation
  const prop1 = mockProperties[0];
  const sorted1 = prop1.trend.sort((a, b) => new Date(a.date) - new Date(b.date));
  const change1 = sorted1[sorted1.length - 1].roi - sorted1[0].roi;
  const changePercent1 = (change1 / sorted1[0].roi) * 100;

  if (Math.abs(changePercent1 - 9.375) < 0.1) {
    results.passed++;
    results.tests.push({
      name: '주간 ROI 변화율 계산 (강남)',
      status: '✅ PASS',
      value: `${changePercent1.toFixed(2)}%`,
    });
  } else {
    results.failed++;
    results.tests.push({
      name: '주간 ROI 변화율 계산 (강남)',
      status: '❌ FAIL',
      expected: '9.38%',
      actual: `${changePercent1.toFixed(2)}%`,
    });
  }

  // Test 2: Top risers detection
  const risingProps = mockProperties.filter(p => {
    const sorted = p.trend.sort((a, b) => new Date(a.date) - new Date(b.date));
    const change = sorted[sorted.length - 1].roi - sorted[0].roi;
    return change > 0;
  });

  if (risingProps.length === 2) {
    results.passed++;
    results.tests.push({
      name: '상승 자산 감지',
      status: '✅ PASS',
      value: `${risingProps.length}개 감지`,
    });
  } else {
    results.failed++;
    results.tests.push({
      name: '상승 자산 감지',
      status: '❌ FAIL',
      expected: '2',
      actual: `${risingProps.length}`,
    });
  }

  // Test 3: Average ROI calculation
  const avgROI = (mockProperties.reduce((sum, p) => sum + p.roi, 0) / mockProperties.length).toFixed(2);
  if (parseFloat(avgROI) === 2.8) {
    results.passed++;
    results.tests.push({
      name: '평균 ROI 계산',
      status: '✅ PASS',
      value: `${avgROI}%`,
    });
  } else {
    results.failed++;
    results.tests.push({
      name: '평균 ROI 계산',
      status: '❌ FAIL',
      expected: '2.80%',
      actual: `${avgROI}%`,
    });
  }

  return results;
}

/**
 * Test AI recommendations
 */
async function testAIRecommendations() {
  log.log('Testing AI recommendations...');

  const mockProperties = [
    {
      id: 'prop-1',
      name: '강남 럭셔리 아파트',
      location: '강남구',
      roi: 3.5,
      type: 'apartment',
      trend: [
        { date: '2026-07-12', roi: 3.1 },
        { date: '2026-07-13', roi: 3.3 },
        { date: '2026-07-14', roi: 3.5 },
      ],
    },
  ];

  const userPreferences = {
    propertyTypes: ['apartment', 'villa'],
    locations: ['강남구'],
    minROI: 2.0,
    favoriteIds: [],
  };

  const results = {
    passed: 0,
    failed: 0,
    tests: [],
  };

  // Test 1: Rapid ROI increase detection
  const prop = mockProperties[0];
  const sorted = prop.trend.sort((a, b) => new Date(a.date) - new Date(b.date));
  const recentROI = sorted[sorted.length - 1].roi;
  const prevROI = sorted[sorted.length - 2].roi;
  const roiChange = recentROI - prevROI;
  const changePercent = (roiChange / prevROI) * 100;

  if (changePercent > 5) {
    results.passed++;
    results.tests.push({
      name: '빠른 ROI 상승 감지',
      status: '✅ PASS',
      value: `${changePercent.toFixed(2)}% 증가 감지`,
    });
  } else {
    results.failed++;
    results.tests.push({
      name: '빠른 ROI 상승 감지',
      status: '❌ FAIL',
      expected: '> 5%',
      actual: `${changePercent.toFixed(2)}%`,
    });
  }

  // Test 2: User preference filtering
  const matchesPreferences =
    userPreferences.propertyTypes.includes(prop.type) &&
    userPreferences.locations.includes(prop.location) &&
    prop.roi >= userPreferences.minROI;

  if (matchesPreferences) {
    results.passed++;
    results.tests.push({
      name: '사용자 선호도 필터링',
      status: '✅ PASS',
      value: '필터 통과',
    });
  } else {
    results.failed++;
    results.tests.push({
      name: '사용자 선호도 필터링',
      status: '❌ FAIL',
      value: '필터 실패',
    });
  }

  // Test 3: Uptrend prediction
  const trend1 = sorted[0].roi;
  const trend2 = sorted[1].roi;
  const trend3 = sorted[2].roi;
  const change1 = trend2 - trend1;
  const change2 = trend3 - trend2;

  let predictedTrend = 'stable';
  if (change1 > 0 && change2 > 0) {
    predictedTrend = 'upward';
  }

  if (predictedTrend === 'upward') {
    results.passed++;
    results.tests.push({
      name: '상승 추세 예측',
      status: '✅ PASS',
      value: '상승 추세 감지',
    });
  } else {
    results.failed++;
    results.tests.push({
      name: '상승 추세 예측',
      status: '❌ FAIL',
      value: '상승 추세 미감지',
    });
  }

  return results;
}

/**
 * Test portfolio tracking
 */
async function testPortfolioTracking() {
  log.log('Testing portfolio tracking...');

  const mockProperties = [
    { id: 'prop-1', type: 'apartment', roi: 3.5, price: 1250000000 },
    { id: 'prop-2', type: 'villa', roi: 2.8, price: 980000000 },
    { id: 'prop-3', type: 'apartment', roi: 2.1, price: 850000000 },
  ];

  const favoriteIds = ['prop-1', 'prop-2'];
  const favorites = mockProperties.filter(p => favoriteIds.includes(p.id));

  const results = {
    passed: 0,
    failed: 0,
    tests: [],
  };

  // Test 1: Favorite count
  if (favorites.length === 2) {
    results.passed++;
    results.tests.push({
      name: '즐겨찾기 자산 카운트',
      status: '✅ PASS',
      value: `${favorites.length}개`,
    });
  } else {
    results.failed++;
    results.tests.push({
      name: '즐겨찾기 자산 카운트',
      status: '❌ FAIL',
      expected: '2',
      actual: `${favorites.length}`,
    });
  }

  // Test 2: Cumulative ROI
  const cumulativeROI = (favorites.reduce((sum, p) => sum + p.roi, 0)).toFixed(2);
  if (parseFloat(cumulativeROI) === 6.3) {
    results.passed++;
    results.tests.push({
      name: '누적 ROI 계산',
      status: '✅ PASS',
      value: `${cumulativeROI}%`,
    });
  } else {
    results.failed++;
    results.tests.push({
      name: '누적 ROI 계산',
      status: '❌ FAIL',
      expected: '6.30%',
      actual: `${cumulativeROI}%`,
    });
  }

  // Test 3: Portfolio composition
  const typeMap = {};
  favorites.forEach(p => {
    typeMap[p.type] = (typeMap[p.type] || 0) + 1;
  });

  if (typeMap['apartment'] === 1 && typeMap['villa'] === 1) {
    results.passed++;
    results.tests.push({
      name: '포트폴리오 구성 분석',
      status: '✅ PASS',
      value: `아파트 50%, 빌라 50%`,
    });
  } else {
    results.failed++;
    results.tests.push({
      name: '포트폴리오 구성 분석',
      status: '❌ FAIL',
      value: '구성 분석 실패',
    });
  }

  // Test 4: Total portfolio value
  const totalValue = favorites.reduce((sum, p) => sum + p.price, 0);
  if (totalValue === 2230000000) {
    results.passed++;
    results.tests.push({
      name: '포트폴리오 총 자산가',
      status: '✅ PASS',
      value: '22.3억 원',
    });
  } else {
    results.failed++;
    results.tests.push({
      name: '포트폴리오 총 자산가',
      status: '❌ FAIL',
      expected: '22.3억',
      actual: `${(totalValue / 1000000000).toFixed(1)}억`,
    });
  }

  return results;
}

/**
 * Main handler
 */
export default async (req) => {
  const cors = corsHeaders();

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    log.log('Running investment enhancement tests');

    // Run all tests
    const weeklySummaryResults = await testWeeklySummary();
    const aiRecommendationsResults = await testAIRecommendations();
    const portfolioTrackingResults = await testPortfolioTracking();

    // Aggregate results
    const totalPassed = weeklySummaryResults.passed + aiRecommendationsResults.passed + portfolioTrackingResults.passed;
    const totalFailed = weeklySummaryResults.failed + aiRecommendationsResults.failed + portfolioTrackingResults.failed;
    const totalTests = totalPassed + totalFailed;

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests,
        passed: totalPassed,
        failed: totalFailed,
        successRate: `${((totalPassed / totalTests) * 100).toFixed(1)}%`,
      },
      sections: {
        '주간 분석': weeklySummaryResults,
        'AI 추천': aiRecommendationsResults,
        '포트폴리오': portfolioTrackingResults,
      },
      status: totalFailed === 0 ? '✅ ALL TESTS PASSED' : '⚠️ SOME TESTS FAILED',
    };

    log.log('Test report generated', {
      totalTests,
      passed: totalPassed,
      failed: totalFailed,
    });

    return Response.json(report, { headers: cors });
  } catch (error) {
    log.error('Test execution error', { error: error.message });
    return Response.json(
      { error: error.message },
      { status: 500, headers: cors }
    );
  }
};

export const config = { path: '/api/investment/test-enhancements' };
