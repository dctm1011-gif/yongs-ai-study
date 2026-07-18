import { createLogger, createResponse, corsHeaders } from './_utils.mjs';

const log = createLogger('fetch-trends');

// Mock Korean trending data (since we don't have YouTube API key)
// In production, this would scrape real trending data from RSS feeds or APIs
const MOCK_TRENDS = [
  {
    id: '1',
    title: '한국 날씨 폭염 경고 발령',
    category: '#뉴스',
    description: '전국 대부분 지역에 폭염 경고가 발령되었습니다. 외출 시 충분한 수분 섭취가 필요합니다.',
    platform: 'Instagram',
    timestamp: new Date().toISOString(),
    likes: 15420,
    mentions: 2341,
  },
  {
    id: '2',
    title: '신곡 "Summer Breeze" 뮤직비디오 공개',
    category: '#음악',
    description: '유명 가수가 새로운 여름 노래 뮤직비디오를 공개했습니다. 신선한 멜로디가 인기입니다.',
    platform: 'YouTube',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    likes: 8923,
    mentions: 1234,
  },
  {
    id: '3',
    title: '2026년 월드컵 한국팀 신명부 발표',
    category: '#뉴스',
    description: '한국 축구 국가대표팀의 월드컵 최종 신명부가 발표되었습니다. 강력한 라인업이 기대됩니다.',
    platform: 'Twitter',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    likes: 22150,
    mentions: 3456,
  },
];

export async function handler(event, context) {
  log.log('Fetching trending topics for Korea', { timestamp: new Date().toISOString() });

  try {
    // Simulate fetching trending data
    // In production, you would:
    // 1. Use RSS feeds (e.g., from News APIs)
    // 2. Scrape trending from Instagram, YouTube, Twitter
    // 3. Use paid APIs for trending data

    const trends = MOCK_TRENDS.map((trend, index) => ({
      ...trend,
      id: `trend-${index + 1}-${Date.now()}`,
      timestamp: new Date(Date.now() - index * 3600000).toISOString(),
    }));

    log.log('Successfully fetched trending topics', {
      count: trends.length,
      platforms: [...new Set(trends.map(t => t.platform))],
    });

    return createResponse(200, {
      trends: trends.slice(0, 3), // Return top 3
      count: 3,
      timestamp: new Date().toISOString(),
    }, corsHeaders());
  } catch (error) {
    log.error('Failed to fetch trends', { message: error.message, stack: error.stack });
    return createResponse(500, `Failed to fetch trends: ${error.message}`, corsHeaders());
  }
}
