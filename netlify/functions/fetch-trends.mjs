import { createLogger, createResponse, corsHeaders } from './_utils.mjs';

const log = createLogger('fetch-trends');

// Cache configuration
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
let cachedTrends = null;
let cacheTimestamp = 0;

// Mock Korean trending data (since we don't have YouTube API key)
// In production, this would scrape real trending data from RSS feeds or APIs
const MOCK_TRENDS = [
  {
    id: 'trend-1-2026-07-18',
    title: '한국 날씨 폭염 경고 발령',
    category: '#뉴스',
    description: '전국 대부분 지역에 폭염 경고가 발령되었습니다. 외출 시 충분한 수분 섭취가 필요합니다.',
    platform: 'Instagram',
    source: 'Instagram Trending',
    timestamp: new Date().toISOString(),
    likes: 15420,
    mentions: 2341,
    popularity: 92,
    trendChange: 'up',
    previousRank: 2,
  },
  {
    id: 'trend-2-2026-07-18',
    title: '신곡 "Summer Breeze" 뮤직비디오 공개',
    category: '#음악',
    description: '유명 가수가 새로운 여름 노래 뮤직비디오를 공개했습니다. 신선한 멜로디가 인기입니다.',
    platform: 'YouTube',
    source: 'YouTube Trending',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    likes: 8923,
    mentions: 1234,
    popularity: 78,
    trendChange: 'stable',
    previousRank: 2,
  },
  {
    id: 'trend-3-2026-07-18',
    title: '2026년 월드컵 한국팀 신명부 발표',
    category: '#뉴스',
    description: '한국 축구 국가대표팀의 월드컵 최종 신명부가 발표되었습니다. 강력한 라인업이 기대됩니다.',
    platform: 'Twitter',
    source: 'Twitter Trending',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    likes: 22150,
    mentions: 3456,
    popularity: 88,
    trendChange: 'down',
    previousRank: 1,
  },
  {
    id: 'trend-4-2026-07-18',
    title: 'AI 기술 발전으로 새로운 스타트업 등장',
    category: '#기술',
    description: '최신 AI 기술을 활용한 혁신 기업들이 시장에 진입하면서 업계 주목을 받고 있습니다.',
    platform: 'LinkedIn',
    source: 'LinkedIn News',
    timestamp: new Date(Date.now() - 5400000).toISOString(),
    likes: 5634,
    mentions: 892,
    popularity: 65,
    trendChange: 'up',
    previousRank: 5,
  },
  {
    id: 'trend-5-2026-07-18',
    title: '서울 여행 가이드 2026',
    category: '#여행',
    description: '올여름 서울 방문객들을 위한 필수 관광지와 숨겨진 명소들이 소개되고 있습니다.',
    platform: 'Instagram',
    source: 'Instagram Travel',
    timestamp: new Date(Date.now() - 9300000).toISOString(),
    likes: 9876,
    mentions: 1567,
    popularity: 72,
    trendChange: 'stable',
    previousRank: 3,
  },
];

/**
 * Check if cache is still valid
 */
function isCacheValid() {
  return cachedTrends && (Date.now() - cacheTimestamp) < CACHE_TTL;
}

/**
 * Get cached or fresh trends
 */
function getTrends(count = 5) {
  // Return cached trends if valid
  if (isCacheValid()) {
    log.log('Returning cached trends', { age: Date.now() - cacheTimestamp });
    return cachedTrends;
  }

  // Generate fresh trends with slight variations
  const now = Date.now();
  const trends = MOCK_TRENDS.map((trend, index) => ({
    ...trend,
    id: `${trend.id}-${Math.floor(now / 60000)}`, // Update ID every minute
    timestamp: new Date(now - index * 3600000).toISOString(),
    // Add slight randomness to engagement metrics
    likes: Math.floor(trend.likes * (0.9 + Math.random() * 0.2)),
    mentions: Math.floor(trend.mentions * (0.9 + Math.random() * 0.2)),
  }));

  // Cache the fresh trends
  cachedTrends = trends.slice(0, count);
  cacheTimestamp = now;

  log.log('Generated fresh trends', { count: cachedTrends.length });
  return cachedTrends;
}

export async function handler(event, context) {
  log.log('Fetching trending topics for Korea', { timestamp: new Date().toISOString() });

  try {
    // Get count from query parameter or default to 5
    const count = Math.min(
      parseInt(event.queryStringParameters?.count || '5', 10),
      MOCK_TRENDS.length
    );

    // Fetch or cache trends
    const trends = getTrends(count);

    log.log('Successfully fetched trending topics', {
      count: trends.length,
      platforms: [...new Set(trends.map(t => t.platform))],
      fromCache: isCacheValid(),
      cacheAge: Date.now() - cacheTimestamp,
    });

    return createResponse(200, {
      trends,
      count: trends.length,
      cacheAge: Date.now() - cacheTimestamp,
      cacheValid: isCacheValid(),
      nextRefresh: new Date(cacheTimestamp + CACHE_TTL).toISOString(),
      timestamp: new Date().toISOString(),
    }, corsHeaders());
  } catch (error) {
    log.error('Failed to fetch trends', { message: error.message, stack: error.stack });
    return createResponse(500, `Failed to fetch trends: ${error.message}`, corsHeaders());
  }
}
